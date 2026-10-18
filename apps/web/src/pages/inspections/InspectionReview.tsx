import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Info, MessageSquareText, PencilLine, RotateCcw, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { InspectionStateBadge } from '../../components/inspections/InspectionStateBadge';
import { LocationPicker } from '../../components/map/LocationPicker';
import { TypeLabel } from '../../components/ui/Badges';
import { Card } from '../../components/ui/Card';
import { Button, borderFor, inputClass } from '../../components/ui/Controls';
import { Dialog } from '../../components/ui/Dialog';
import { ErrorState, LoadingBlock } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { ApiError, apiPost } from '../../lib/api';
import { formatDistance } from '../../lib/device';
import { formatFieldValue } from '../../lib/fields';
import { formatDate } from '../../lib/format';
import { useInspection, useReference } from '../../lib/queries';
import type { InspectionDetail } from '../../lib/types';

export function InspectionReview() {
  const { id } = useParams();
  const inspection = useInspection(id);
  return (
    <>
      <Link to="/inspections" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> Inspections
      </Link>
      {inspection.isError ? (
        <Card>
          <ErrorState error={inspection.error} onRetry={() => inspection.refetch()} />
        </Card>
      ) : !inspection.data ? (
        <Card>
          <LoadingBlock rows={8} />
        </Card>
      ) : (
        <Review i={inspection.data} />
      )}
    </>
  );
}

function Review({ i }: { i: InspectionDetail }) {
  const reference = useReference();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [moveLocation, setMoveLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<InspectionDetail['photos'][number] | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);

  // Compare what was observed with the registered values (or, once approved, with what it replaced).
  const rows = useMemo(() => {
    const defs = reference.data?.fields ?? [];
    const keys = reference.data?.inspectionFields ?? [];
    const before = i.state === 'approved' && i.previous ? { ...i.current, ...i.previous.fields } : i.current ?? {};
    return defs
      .filter((d) => keys.includes(d.key))
      .map((d) => {
        const b = formatFieldValue(d, before[d.key], reference.data);
        const a = formatFieldValue(d, i.observed?.[d.key], reference.data);
        return { key: d.key, label: d.label, before: b, after: a, changed: b !== a };
      });
  }, [reference.data, i]);
  const changed = rows.filter((r) => r.changed);
  const unchanged = rows.filter((r) => !r.changed);
  const hasGps = i.gpsLat !== null && i.gpsLng !== null;

  const decide = useMutation({
    mutationFn: (action: 'approve' | 'return') => apiPost<{ state: string }>(`/inspections/${i.id}/${action}`, { comment, moveLocation }),
    onSuccess: (r) => {
      for (const key of ['inspection', 'inspections', 'assignments', 'source', 'sources', 'sources-geojson', 'summary', 'source-history']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast(r.state === 'approved' ? 'Approved. The record is updated and marked verified.' : 'Returned to the inspector');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">
        <section className="rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6">
          <InspectionStateBadge state={i.state} />
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Inspection: {i.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
            <TypeLabel type={i.type} />
            <span>{i.region}</span>
            <Link to={`/sources/${i.sourceId}`} className="inline-flex items-center gap-1 font-mono text-xs text-brand-700 hover:underline">
              {i.code} <ArrowRight size={12} aria-hidden />
            </Link>
          </div>
          <p className="mt-4 text-sm text-ink-2">
            Visited by <span className="font-medium text-ink">{i.inspector}</span> on {formatDate(i.inspectedOn)} · sent {formatDate(i.submittedAt)}
          </p>
          {i.notes && (
            <blockquote className="mt-3 flex gap-2.5 rounded-lg bg-page px-4 py-3 text-sm text-ink">
              <MessageSquareText size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              <span>{i.notes}</span>
            </blockquote>
          )}
        </section>

        {i.warnings.length > 0 && i.state === 'submitted' && (
          <div className="flex gap-3 rounded-xl border border-gold-300/70 bg-gold-100/60 px-4 py-3 text-sm text-gold-800">
            <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
            <div>
              <span className="font-semibold">Please check:</span>
              <ul className="mt-1 list-disc pl-5">
                {i.warnings.map((w) => (
                  <li key={w.message}>{w.message}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <Card
          title="What was found"
          subtitle={`${changed.length} of ${rows.length} values differ from the registered record`}
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
                  <th className="px-5 py-2.5 font-medium">Field</th>
                  <th className="px-5 py-2.5 font-medium">{i.state === 'approved' ? 'Before' : 'Registered'}</th>
                  <th className="px-5 py-2.5 font-medium">Found at visit</th>
                </tr>
              </thead>
              <tbody>
                {[...changed, ...(showUnchanged ? unchanged : [])].map((r) => (
                  <tr key={r.key} className="border-b border-line align-top last:border-0">
                    <td className="px-5 py-3 text-ink-2">{r.label}</td>
                    <td className="px-5 py-3">
                      <span className={r.changed && r.before !== '—' ? 'text-ink line-through decoration-critical/50' : 'text-ink-3'}>{r.before}</span>
                    </td>
                    <td className="px-5 py-3">
                      {r.changed ? (
                        <span className="rounded bg-good-wash px-1.5 py-0.5 font-medium text-good-ink">{r.after}</span>
                      ) : (
                        <span className="text-ink-2">{r.after}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {unchanged.length > 0 && (
            <button type="button" onClick={() => setShowUnchanged((s) => !s)} className="w-full border-t border-line px-5 py-2.5 text-left text-xs font-medium text-brand-700 hover:bg-page">
              {showUnchanged ? 'Hide' : 'Show'} {unchanged.length} unchanged values
            </button>
          )}
        </Card>

        <Card title="Photos" subtitle={i.photos.length ? `${i.photos.length} taken at the visit` : undefined}>
          {i.photos.length === 0 ? (
            <p className="text-sm text-ink-3">No photos were taken.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {i.photos.map((p) => (
                <button key={p.id} type="button" onClick={() => setPhoto(p)} className="overflow-hidden rounded-lg border border-line text-left hover:ring-2 hover:ring-brand-600/30">
                  <img src={p.url} alt={p.caption ?? 'Inspection photo'} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  {p.caption && <span className="block truncate px-2 py-1 text-xs text-ink-2">{p.caption}</span>}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <aside className="space-y-6">
        <Card title="Location" subtitle={hasGps ? 'Green: GPS at the visit · Grey: registered' : undefined} bodyClassName="p-3">
          {hasGps ? (
            <>
              <LocationPicker
                value={{ lat: i.gpsLat!, lng: i.gpsLng! }}
                previous={i.locationMoved ? null : { lat: i.sourceLat, lng: i.sourceLng }}
                readOnly
                className="h-60"
                label="GPS position recorded at the visit and the registered location"
              />
              <p className="px-2 pb-1 pt-3 text-sm text-ink-2">
                {i.locationMoved
                  ? 'The registered location was moved to this GPS position.'
                  : `${formatDistance(i.distanceM ?? 0)} from the registered location${i.gpsAccuracyM ? ` · accuracy ±${Math.round(i.gpsAccuracyM)} m` : ''}`}
              </p>
            </>
          ) : (
            <p className="p-2 text-sm text-ink-3">No GPS position was recorded.</p>
          )}
        </Card>

        <Card title="Decision">
          {i.state !== 'submitted' ? (
            <div className="space-y-2 text-sm">
              <InspectionStateBadge state={i.state} />
              {i.reviewer && (
                <p className="text-ink-2">
                  By <span className="font-medium text-ink">{i.reviewer}</span> on {formatDate(i.reviewedAt)}
                </p>
              )}
              {i.reviewComment && <blockquote className="rounded-lg bg-page px-3 py-2 text-ink">{i.reviewComment}</blockquote>}
              {i.canEdit && (
                <Link to={`/field/inspect/${i.sourceId}?inspection=${i.id}`} className="inline-flex items-center gap-1.5 pt-2 font-medium text-brand-700 hover:underline">
                  <PencilLine size={14} aria-hidden /> Correct and resend
                </Link>
              )}
            </div>
          ) : i.canReview ? (
            <div className="space-y-3">
              {hasGps && (i.distanceM ?? 0) > 50 && (
                <label className="flex items-start gap-2.5 rounded-lg bg-page px-3 py-2.5 text-sm text-ink">
                  <input type="checkbox" checked={moveLocation} onChange={(e) => setMoveLocation(e.target.checked)} className="mt-0.5 size-4 accent-brand-700" />
                  <span>
                    Move the registered location to the GPS position
                    <span className="block text-xs text-ink-3">Use this when the registered point is wrong ({formatDistance(i.distanceM ?? 0)} away).</span>
                  </span>
                </label>
              )}
              <label htmlFor="review-comment" className="block text-xs font-medium text-ink-2">
                Comment (required to return)
              </label>
              <textarea
                id="review-comment"
                rows={3}
                maxLength={1000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className={`${inputClass} ${borderFor()} h-auto py-2`}
              />
              {error && (
                <p role="alert" className="rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical-ink">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" className="flex-1" disabled={decide.isPending} onClick={() => (setError(null), decide.mutate('approve'))}>
                  <Check size={16} aria-hidden /> Approve
                </Button>
                <Button
                  className="flex-1 text-critical-ink"
                  disabled={decide.isPending}
                  onClick={() => {
                    setError(null);
                    if (!comment.trim()) return setError('Write what the inspector should correct.');
                    decide.mutate('return');
                  }}
                >
                  <RotateCcw size={16} aria-hidden /> Return
                </Button>
              </div>
              <p className="text-xs text-ink-3">Approving updates the record with the values found and marks it verified in the field.</p>
            </div>
          ) : (
            <p className="flex gap-2 text-sm text-ink-2">
              <Info size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              {i.reviewBlockedReason}
            </p>
          )}
        </Card>
      </aside>

      <Dialog open={Boolean(photo)} onClose={() => setPhoto(null)} title={photo?.caption ?? 'Photo'} size="lg">
        {photo && <img src={photo.url} alt={photo.caption ?? 'Inspection photo'} className="w-full rounded-lg" />}
      </Dialog>
    </div>
  );
}
