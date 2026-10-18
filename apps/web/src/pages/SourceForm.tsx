import { ArrowLeft, Info, Send } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { LocationPicker } from '../components/map/LocationPicker';
import { TypeSwatch } from '../components/ui/Badges';
import { Card } from '../components/ui/Card';
import { Button, Field, borderFor, inputClass } from '../components/ui/Controls';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorState, LoadingBlock } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, apiPost } from '../lib/api';
import { useAuth } from '../lib/auth';
import { SOURCE_TYPES, TYPE_META } from '../lib/domain';
import { detailAsField, fieldCatalog } from '../lib/fields';
import { usePendingChangesForSource, useReference, useSource } from '../lib/queries';
import type { FieldDef, SourceDetail, SourceType } from '../lib/types';

type FormValues = Record<string, string>;

const camel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Form values are kept as strings (what inputs hold); the API parses and validates them. */
function toFormString(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

export function SourceForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const source = useSource(id);
  const reference = useReference();
  const pending = usePendingChangesForSource(id);

  if (reference.isError || source.isError) {
    return (
      <Card>
        <ErrorState error={reference.error ?? source.error} />
      </Card>
    );
  }
  if (!reference.data || (editing && !source.data)) {
    return (
      <Card>
        <LoadingBlock rows={10} />
      </Card>
    );
  }
  if (editing && pending.data && pending.data.length > 0) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <h1 className="text-xl font-semibold text-ink">A change is already waiting for review</h1>
        <p className="mt-2 text-ink-2">Only one change per source can be pending at a time, so reviewers see a clear picture.</p>
        <Link to={`/approvals/${pending.data[0].id}`} className="mt-6 inline-flex rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800">
          View the pending request
        </Link>
      </div>
    );
  }
  return <SourceFormBody source={source.data ?? null} />;
}

function SourceFormBody({ source }: { source: SourceDetail | null }) {
  const reference = useReference().data!;
  const { scopeRegionId } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [type, setType] = useState<SourceType | ''>(source?.type ?? '');
  const [values, setValues] = useState<FormValues>(() => {
    const v: FormValues = {};
    for (const def of reference.fields) {
      v[def.key] = source ? toFormString((source as unknown as Record<string, unknown>)[camel(def.key)]) : '';
    }
    if (!source) {
      v.status = 'functioning';
      if (scopeRegionId) v.region_id = String(scopeRegionId);
    }
    return v;
  });
  const [details, setDetails] = useState<FormValues>(() => {
    const d: FormValues = {};
    for (const [k, val] of Object.entries(source?.details ?? {})) d[k] = toFormString(val);
    return d;
  });
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const catalog = useMemo(() => (type ? fieldCatalog(reference, type) : null), [reference, type]);
  const districts = reference.regions.find((r) => String(r.id) === values.region_id)?.districts ?? [];
  const lat = Number(values.lat);
  const lng = Number(values.lng);
  const point = values.lat !== '' && values.lng !== '' && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  // Scroll to the first problem after a failed submit.
  useEffect(() => {
    const first = Object.keys(errors)[0];
    if (first) document.getElementById(`f-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [errors]);

  const setField = (key: string, v: string) => {
    setValues((s) => ({ ...s, [key]: v }));
    if (errors[key]) setErrors(({ [key]: _, ...rest }) => rest);
  };
  const setDetail = (key: string, v: string) => {
    setDetails((s) => ({ ...s, [key]: v }));
    const k = `details.${key}`;
    if (errors[k]) setErrors(({ [k]: _, ...rest }) => rest);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!type) {
      setErrors({ type: 'Choose the type of water source' });
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const detailKeys = new Set(catalog!.details.map((d) => d.key));
      const result = await apiPost<{ id: string }>('/change-requests', {
        kind: source ? 'update' : 'create',
        sourceId: source?.id,
        sourceType: source ? undefined : type,
        fields: values,
        details: Object.fromEntries(Object.entries(details).filter(([k]) => detailKeys.has(k))),
        comment: comment || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['changes'] });
      toast(source ? 'Changes sent for approval' : 'New source sent for approval');
      navigate(`/approvals/${result.id}`);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors(err.fieldErrors);
        setFormError('Some values need attention. They are marked below.');
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Could not submit. Try again.');
      }
    }
  };

  const renderField = (def: FieldDef, value: string, onChange: (v: string) => void, errorKey: string) => {
    const id = `f-${errorKey}`;
    const error = errors[errorKey];
    const describedBy = error ? `${id}-error` : def.help ? `${id}-hint` : undefined;
    const common = { id, 'aria-invalid': Boolean(error) || undefined, 'aria-describedby': describedBy };
    const label = def.unit ? `${def.label} (${def.unit})` : def.label;
    let control: ReactNode;

    switch (def.kind) {
      case 'select':
        control = (
          <select {...common} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} ${borderFor(error)}`}>
            {!def.required && <option value="">Not recorded</option>}
            {def.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
        break;
      case 'region':
        control = (
          <select
            {...common}
            value={value}
            disabled={Boolean(scopeRegionId)}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} ${borderFor(error)}`}
          >
            <option value="">Choose a region</option>
            {reference.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        );
        break;
      case 'boolean':
        control = (
          <select {...common} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} ${borderFor(error)}`}>
            <option value="">Not recorded</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        );
        break;
      case 'textarea':
        control = (
          <textarea
            {...common}
            rows={3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} ${borderFor(error)} h-auto py-2`}
          />
        );
        break;
      default: {
        const listId = def.suggestions?.length || def.key === 'district' ? `${id}-list` : undefined;
        const suggestions = def.key === 'district' ? districts.map((d) => d.name) : def.suggestions;
        control = (
          <>
            <input
              {...common}
              type={def.kind === 'date' ? 'date' : 'text'}
              inputMode={def.kind === 'number' ? 'decimal' : def.kind === 'integer' ? 'numeric' : undefined}
              list={listId}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={`${inputClass} ${borderFor(error)}`}
            />
            {listId && (
              <datalist id={listId}>
                {suggestions?.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
          </>
        );
      }
    }

    return (
      <Field key={errorKey} label={label} htmlFor={id} required={def.required} error={error} hint={def.help} className={def.kind === 'textarea' ? 'sm:col-span-2 xl:col-span-3' : ''}>
        {control}
      </Field>
    );
  };

  const sectionFields = (sectionId: string) => reference.fields.filter((f) => f.section === sectionId && f.key !== 'lat' && f.key !== 'lng');

  return (
    <form onSubmit={submit} noValidate>
      <Link to={source ? `/sources/${source.id}` : '/sources'} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> {source ? source.name : 'Water sources'}
      </Link>
      <PageHeader
        eyebrow={source ? `Propose changes · ${source.code}` : 'Registry'}
        title={source ? `Edit ${source.name}` : 'Register a water source'}
        description="Nothing changes in the registry until the responsible department approves. Leave a field empty if it is not known."
      />

      {formError && (
        <div role="alert" className="mb-6 rounded-xl bg-critical-wash px-4 py-3 text-sm text-critical-ink">
          {formError}
        </div>
      )}

      <div className="space-y-6">
        {!source && (
          <Card title="Type of source">
            <fieldset>
              <legend className="sr-only">Type of source</legend>
              <div id="f-type" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {SOURCE_TYPES.map((t) => (
                  <label
                    key={t}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-3 text-sm transition ${
                      type === t ? 'border-brand-600 bg-brand-50 font-medium text-ink ring-2 ring-brand-600/15' : 'border-line-strong text-ink-2 hover:border-ink-3'
                    }`}
                  >
                    <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
                    <TypeSwatch type={t} size={16} />
                    {TYPE_META[t].label}
                  </label>
                ))}
              </div>
              {errors.type && <p className="mt-2 text-xs text-critical-ink">{errors.type}</p>}
            </fieldset>
          </Card>
        )}

        {type && catalog && (
          <>
            <Card title="Name and location">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2">
                  {sectionFields('identity').map((def) => renderField(def, values[def.key] ?? '', (v) => setField(def.key, v), def.key))}
                  {renderField(catalog.field.get('lat')!, values.lat, (v) => setField('lat', v), 'lat')}
                  {renderField(catalog.field.get('lng')!, values.lng, (v) => setField('lng', v), 'lng')}
                </div>
                <LocationPicker
                  value={point}
                  onChange={(p) => {
                    setField('lat', String(p.lat));
                    setField('lng', String(p.lng));
                  }}
                  className="h-80 lg:h-full lg:min-h-80"
                  label="Pick the location on the map"
                />
              </div>
            </Card>

            {reference.sections
              .filter((s) => s.id !== 'identity')
              .map((section) => {
                const fields = section.id === 'technical' ? [] : sectionFields(section.id);
                const technical = section.id === 'technical' ? catalog.details : [];
                if (!fields.length && !technical.length) return null;
                return (
                  <Card key={section.id} title={section.id === 'technical' ? `Technical details (${TYPE_META[type].plural.toLowerCase()})` : section.label}>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {fields.map((def) => renderField(def, values[def.key] ?? '', (v) => setField(def.key, v), def.key))}
                      {technical.map((d) => renderField(detailAsField(d), details[d.key] ?? '', (v) => setDetail(d.key, v), `details.${d.key}`))}
                    </div>
                  </Card>
                );
              })}

            <Card title="Note for the reviewer" subtitle="Where the information comes from, e.g. a field visit or a drilling report.">
              <label htmlFor="f-comment" className="sr-only">
                Note for the reviewer
              </label>
              <textarea id="f-comment" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} className={`${inputClass} ${borderFor()} h-auto py-2`} />
            </Card>
          </>
        )}
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <p className="hidden items-center gap-2 text-xs text-ink-3 sm:flex">
          <Info size={14} aria-hidden /> The responsible department will review this before it appears in the registry.
        </p>
        <div className="flex flex-1 justify-end gap-2 sm:flex-none">
          <Button onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !type}>
            <Send size={15} aria-hidden /> {busy ? 'Sending…' : 'Submit for approval'}
          </Button>
        </div>
      </div>
    </form>
  );
}
