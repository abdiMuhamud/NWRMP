import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, Crosshair, ImagePlus, Info, LocateFixed, MessageSquareWarning, Send, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { FieldInput } from '../../components/form/FieldInput';
import { LocationPicker } from '../../components/map/LocationPicker';
import { TypeLabel } from '../../components/ui/Badges';
import { Card } from '../../components/ui/Card';
import { Button, Field, borderFor, inputClass } from '../../components/ui/Controls';
import { ErrorState, LoadingBlock } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { ApiError, apiDelete, apiPatch, apiPost, apiUpload } from '../../lib/api';
import { compressPhoto, distanceM, formatDistance, getPosition, type GpsFix } from '../../lib/device';
import { formatDate } from '../../lib/format';
import { addToOutbox, discardOutboxItem, getOutboxItem, syncOutbox, useOnline } from '../../lib/offline';
import { useInspection, useMyAssignments, useReference, useSource } from '../../lib/queries';
import type { FieldValue, InspectionDetail, SourceType } from '../../lib/types';

const MAX_PHOTOS = 8;
const camel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const toStr = (v: FieldValue | undefined) => (v === null || v === undefined ? '' : String(v));

/** What the form needs to know about the source, from the cached assignment or the live record. */
interface Target {
  sourceId: string;
  name: string;
  code: string;
  type: SourceType;
  place: string;
  lat: number;
  lng: number;
  current: Record<string, FieldValue>;
  assignmentId?: string;
  dueOn?: string | null;
  notes?: string | null;
}

export function InspectionForm() {
  const { sourceId = '' } = useParams();
  const [params] = useSearchParams();
  const assignmentId = params.get('assignment') ?? undefined;
  const inspectionId = params.get('inspection') ?? undefined;

  const reference = useReference();
  const assignments = useMyAssignments(Boolean(assignmentId));
  const assignment = assignments.data?.find((a) => a.id === assignmentId);
  // Without an assignment (or when correcting a returned inspection), read the live record.
  const source = useSource(!assignmentId || (assignments.isFetched && !assignment) ? sourceId : undefined);
  const existing = useInspection(inspectionId);
  const fields = reference.data?.inspectionFields;

  const target = useMemo<Target | null>(() => {
    if (assignment) {
      return {
        sourceId: assignment.sourceId,
        name: assignment.name,
        code: assignment.code,
        type: assignment.type,
        place: [assignment.settlement, assignment.district, assignment.region].filter(Boolean).join(' · '),
        lat: assignment.lat,
        lng: assignment.lng,
        current: assignment.current,
        assignmentId: assignment.id,
        dueOn: assignment.dueOn,
        notes: assignment.notes,
      };
    }
    if (source.data && fields) {
      const s = source.data as unknown as Record<string, FieldValue>;
      return {
        sourceId: source.data.id,
        name: source.data.name,
        code: source.data.code,
        type: source.data.type,
        place: [source.data.settlement, source.data.district, source.data.region].filter(Boolean).join(' · '),
        lat: source.data.lat,
        lng: source.data.lng,
        current: Object.fromEntries(fields.map((k) => [k, s[camel(k)] ?? null])),
      };
    }
    return null;
  }, [assignment, source.data, fields]);

  const error = reference.error ?? source.error ?? existing.error;
  if (error) {
    return (
      <Card>
        <ErrorState error={error} />
      </Card>
    );
  }
  if (!reference.data || !target || (inspectionId && !existing.data)) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <LoadingBlock rows={8} />
        </Card>
      </div>
    );
  }
  return <Form key={target.sourceId + (inspectionId ?? '')} target={target} existing={existing.data ?? null} />;
}

interface NewPhoto {
  clientId: string;
  blob: Blob;
  url: string;
  caption: string;
}

function Form({ target, existing }: { target: Target; existing: InspectionDetail | null }) {
  const reference = useReference().data!;
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const editing = Boolean(existing);

  const keys = reference.inspectionFields;
  const defs = useMemo(() => reference.fields.filter((f) => keys.includes(f.key)), [reference, keys]);
  const sections = reference.sections.filter((s) => defs.some((d) => d.section === s.id));

  // Start from the last approved values (or the returned inspection) so the officer only changes what differs.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(keys.map((k) => [k, toStr(existing ? existing.observed?.[k] : target.current[k])])),
  );
  const [visitDate, setVisitDate] = useState(existing?.inspectedOn ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [gps, setGps] = useState<GpsFix | null>(
    existing?.gpsLat != null && existing.gpsLng != null ? { lat: existing.gpsLat, lng: existing.gpsLng, accuracy: existing.gpsAccuracyM ?? 0 } : null,
  );
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [existingPhotos, setExistingPhotos] = useState(existing?.photos ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);
  useEffect(() => {
    const first = Object.keys(errors)[0];
    if (first) document.getElementById(`f-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [errors]);

  const registered = { lat: target.lat, lng: target.lng };
  const away = gps ? distanceM(gps, registered) : null;
  const photoCount = photos.length + existingPhotos.length;
  const setField = (k: string, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors(({ [k]: _, ...rest }) => rest);
  };

  const captureGps = async () => {
    setGpsBusy(true);
    setGpsError(null);
    try {
      setGps(await getPosition());
    } catch (err) {
      setGpsError((err as Error).message);
    } finally {
      setGpsBusy(false);
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photoCount;
    const picked = Array.from(files).slice(0, room);
    try {
      const added = await Promise.all(
        picked.map(async (file) => {
          const blob = await compressPhoto(file);
          return { clientId: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), caption: '' };
        }),
      );
      setPhotos((p) => [...p, ...added]);
    } catch {
      toast('One of the photos could not be read', 'error');
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const removeExistingPhoto = async (photoId: string) => {
    try {
      await apiDelete(`/inspections/${existing!.id}/photos/${photoId}`);
      setExistingPhotos((p) => p.filter((x) => x.id !== photoId));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not remove the photo', 'error');
    }
  };

  const refreshLists = () => {
    for (const key of ['assignments', 'inspections', 'inspection', 'source', 'sources']) queryClient.invalidateQueries({ queryKey: [key] });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.status) {
      setErrors({ status: 'Record whether the source is functioning' });
      return;
    }
    setBusy(true);
    setFormError(null);

    if (editing) {
      // Correcting a returned inspection happens online, directly against the server.
      try {
        await apiPatch(`/inspections/${existing!.id}`, { observed: values, notes, inspectedOn: visitDate, gps: gps ?? undefined });
        for (const p of photos) {
          const form = new FormData();
          form.append('file', p.blob, `${p.clientId}.jpg`);
          form.append('clientId', p.clientId);
          if (p.caption) form.append('caption', p.caption);
          await apiUpload(`/inspections/${existing!.id}/photos`, form);
        }
        await apiPost(`/inspections/${existing!.id}/submit`);
        refreshLists();
        toast('Corrected inspection sent for review');
        navigate('/field');
      } catch (err) {
        setBusy(false);
        if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
        setFormError(err instanceof ApiError ? err.message : 'Could not send. Try again.');
      }
      return;
    }

    const clientId = crypto.randomUUID();
    await addToOutbox({
      clientId,
      sourceId: target.sourceId,
      sourceName: target.name,
      sourceCode: target.code,
      assignmentId: target.assignmentId,
      inspectedOn: visitDate,
      observed: values,
      gps: gps ?? undefined,
      notes: notes.trim() || undefined,
      photos: photos.map((p) => ({ clientId: p.clientId, blob: p.blob, caption: p.caption || undefined })),
      createdAt: new Date().toISOString(),
      status: 'waiting',
    });

    if (!navigator.onLine) {
      toast('Saved on this phone. It will be sent when you have signal.');
      navigate('/field');
      return;
    }
    await syncOutbox(refreshLists);
    const left = await getOutboxItem(clientId);
    if (!left) {
      toast('Inspection sent for review');
      navigate('/field');
    } else if (left.status === 'needs_attention') {
      // Rejected by the server: keep the officer on the form to fix it.
      await discardOutboxItem(clientId);
      setBusy(false);
      setErrors(left.fieldErrors ?? {});
      setFormError(left.error ?? 'The inspection could not be sent.');
    } else {
      toast('Saved on this phone. It will be sent when the connection is better.');
      navigate('/field');
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-2xl pb-4">
      <Link to="/field" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> My inspections
      </Link>

      <section className="mb-5 rounded-xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <TypeLabel type={target.type} className="font-medium text-ink" />
          <span className="font-mono text-xs text-ink-3">{target.code}</span>
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{editing ? 'Correct inspection' : 'Inspection'}: {target.name}</h1>
        <p className="mt-1 text-sm text-ink-2">{target.place}</p>
        {target.notes && <p className="mt-3 rounded-lg bg-page px-3 py-2 text-sm text-ink">{target.notes}</p>}
        {target.dueOn && <p className="mt-2 text-xs text-ink-3">Due {formatDate(target.dueOn)}</p>}
      </section>

      {existing?.reviewComment && (
        <div className="mb-5 flex gap-3 rounded-xl border border-gold-300/70 bg-gold-100/60 px-4 py-3 text-sm text-gold-800">
          <MessageSquareWarning size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">Returned by {existing.reviewer ?? 'the reviewer'}:</span> {existing.reviewComment}
          </p>
        </div>
      )}

      {formError && (
        <div role="alert" className="mb-5 rounded-xl bg-critical-wash px-4 py-3 text-sm text-critical-ink">
          {formError}
        </div>
      )}

      {!editing && (
        <p className="mb-5 flex gap-2 text-sm text-ink-2">
          <Info size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
          The last approved values are filled in. Change anything that is different today.
        </p>
      )}

      <div className="space-y-5">
        <Card title="Visit">
          <Field label="Date of visit" htmlFor="f-inspectedOn" error={errors.inspectedOn} required>
            <input
              id="f-inspectedOn"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className={`${inputClass} ${borderFor(errors.inspectedOn)} h-12 text-base`}
            />
          </Field>
        </Card>

        {sections.map((s) => (
          <Card key={s.id} title={s.label}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {defs
                .filter((d) => d.section === s.id)
                .map((def) => (
                  <FieldInput
                    key={def.key}
                    def={def.key === 'status' ? { ...def, required: true } : def}
                    name={def.key}
                    value={values[def.key] ?? ''}
                    onChange={(v) => setField(def.key, v)}
                    error={errors[def.key]}
                    large
                    className={def.kind === 'textarea' ? 'sm:col-span-2' : ''}
                  />
                ))}
            </div>
          </Card>
        ))}

        <Card title="Location" subtitle="Stand at the source and record the GPS position.">
          {gps ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                  <LocateFixed size={16} className="text-brand-700" aria-hidden /> {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                </span>
                <span className="text-ink-2">±{gps.accuracy} m</span>
              </div>
              {away !== null && (
                <p className={`text-sm ${away > 500 ? 'font-medium text-warn-ink' : 'text-ink-2'}`}>
                  {formatDistance(away)} from the registered location
                  {away > 500 && ' — check you are at the right source. The reviewer can correct the registered location.'}
                </p>
              )}
              <LocationPicker value={gps} previous={registered} readOnly className="h-48" label="Recorded GPS position and registered location" />
              <p className="text-xs text-ink-3">Green: your position · Grey: registered location</p>
              <Button onClick={() => void captureGps()} disabled={gpsBusy}>
                <Crosshair size={15} aria-hidden /> {gpsBusy ? 'Reading GPS…' : 'Record again'}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Button variant="primary" onClick={() => void captureGps()} disabled={gpsBusy} className="h-12 w-full text-base">
                <Crosshair size={18} aria-hidden /> {gpsBusy ? 'Reading GPS…' : 'Record GPS position'}
              </Button>
              {gpsError && <p className="text-sm text-critical-ink">{gpsError}</p>}
              <p className="text-xs text-ink-3">Works without mobile data. It can take up to 20 seconds outdoors.</p>
            </div>
          )}
        </Card>

        <Card title="Photos" subtitle={`${photoCount} of ${MAX_PHOTOS}: the source, pump, tank and any damage`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {existingPhotos.map((p) => (
              <figure key={p.id} className="relative overflow-hidden rounded-lg border border-line">
                <img src={p.url} alt={p.caption ?? 'Inspection photo'} className="aspect-[4/3] w-full object-cover" />
                {p.caption && <figcaption className="truncate px-2 py-1 text-xs text-ink-2">{p.caption}</figcaption>}
                <button
                  type="button"
                  onClick={() => void removeExistingPhoto(p.id)}
                  className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-ink/70 text-white"
                  aria-label="Remove photo"
                >
                  <Trash2 size={14} />
                </button>
              </figure>
            ))}
            {photos.map((p) => (
              <figure key={p.clientId} className="relative overflow-hidden rounded-lg border border-line">
                <img src={p.url} alt="New inspection photo" className="aspect-[4/3] w-full object-cover" />
                <input
                  value={p.caption}
                  onChange={(e) => setPhotos((all) => all.map((x) => (x.clientId === p.clientId ? { ...x, caption: e.target.value } : x)))}
                  placeholder="Caption (optional)"
                  aria-label="Photo caption"
                  className="w-full border-t border-line px-2 py-1.5 text-xs text-ink focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setPhotos((all) => all.filter((x) => x.clientId !== p.clientId))}
                  className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-ink/70 text-white"
                  aria-label="Remove photo"
                >
                  <X size={15} />
                </button>
              </figure>
            ))}
            {photoCount < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-line-strong text-sm font-medium text-ink-2 hover:border-brand-600 hover:text-brand-700"
              >
                {photoCount === 0 ? <Camera size={22} aria-hidden /> : <ImagePlus size={22} aria-hidden />}
                Take photo
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => void addPhotos(e.target.files)}
          />
        </Card>

        <Card title="Notes">
          <label htmlFor="f-notes" className="sr-only">
            Notes
          </label>
          <textarea
            id="f-notes"
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the reviewer should know"
            className={`${inputClass} ${borderFor()} h-auto py-2 text-base`}
          />
        </Card>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-5 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button type="submit" variant="primary" disabled={busy || (editing && !online)} className="h-12 w-full text-base">
          <Send size={17} aria-hidden />
          {busy ? 'Sending…' : editing ? 'Send correction' : online ? 'Send inspection' : 'Save on phone (send later)'}
        </Button>
        {editing && !online && <p className="mt-2 text-center text-xs text-ink-3">Corrections need a connection.</p>}
      </div>
    </form>
  );
}
