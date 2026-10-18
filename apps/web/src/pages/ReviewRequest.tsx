import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Info, MessageSquareText, TriangleAlert, Undo2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { LocationPicker } from '../components/map/LocationPicker';
import { TypeLabel } from '../components/ui/Badges';
import { Card } from '../components/ui/Card';
import { ChangeStatusBadge, KindBadge } from '../components/ui/ChangeStatusBadge';
import { Button, borderFor, inputClass } from '../components/ui/Controls';
import { ErrorState, LoadingBlock } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';
import { ApiError, apiPost } from '../lib/api';
import { changeRows, type ChangeRow } from '../lib/fields';
import { formatDate } from '../lib/format';
import { useChangeRequest, useReference } from '../lib/queries';
import type { ChangeRequest } from '../lib/types';

export function ReviewRequest() {
  const { id } = useParams();
  const request = useChangeRequest(id);

  return (
    <>
      <Link to="/approvals" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> Approvals
      </Link>
      {request.isError ? (
        <Card>
          <ErrorState error={request.error} onRetry={() => request.refetch()} />
        </Card>
      ) : !request.data ? (
        <Card>
          <LoadingBlock rows={8} />
        </Card>
      ) : (
        <RequestView r={request.data} />
      )}
    </>
  );
}

function RequestView({ r }: { r: ChangeRequest }) {
  const reference = useReference();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => changeRows(reference.data, r.sourceType, r.proposed, r.previous), [reference.data, r]);
  const sections = reference.data?.sections ?? [];
  const department = reference.data?.departments.find((d) => d.approves.includes(r.sourceType));

  const proposedPoint =
    typeof r.proposed.fields.lat === 'number' && typeof r.proposed.fields.lng === 'number'
      ? { lat: r.proposed.fields.lat, lng: r.proposed.fields.lng }
      : r.current && typeof r.current.fields.lat === 'number'
        ? { lat: r.current.fields.lat as number, lng: r.current.fields.lng as number }
        : null;
  const previousPoint =
    r.previous && typeof r.previous.fields.lat === 'number' ? { lat: r.previous.fields.lat as number, lng: r.previous.fields.lng as number } : null;

  const decide = useMutation({
    mutationFn: (action: 'approve' | 'reject' | 'withdraw') => apiPost<{ status: string }>(`/change-requests/${r.id}/${action}`, action === 'withdraw' ? {} : { comment }),
    onSuccess: (result) => {
      // The registry, map, dashboard and badges may all have changed.
      for (const key of ['change', 'changes', 'sources', 'source', 'sources-geojson', 'summary', 'source-history', 'reference']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast(
        result.status === 'approved' ? 'Approved. The registry has been updated.' : result.status === 'rejected' ? 'Request rejected' : 'Request withdrawn',
      );
      setComment('');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const title = r.kind === 'create' ? r.sourceName ?? 'New water source' : `Changes to ${r.sourceName ?? 'water source'}`;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">
        <section className="rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind={r.kind} />
            <ChangeStatusBadge status={r.status} />
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
            <TypeLabel type={r.sourceType} />
            <span>{r.regionName}</span>
            {r.sourceCode && r.sourceId && (
              <Link to={`/sources/${r.sourceId}`} className="inline-flex items-center gap-1 font-mono text-xs text-brand-700 hover:underline">
                {r.sourceCode} <ArrowRight size={12} aria-hidden />
              </Link>
            )}
          </div>
          <p className="mt-4 text-sm text-ink-2">
            Submitted by <span className="font-medium text-ink">{r.requestedBy.name}</span> on {formatDate(r.requestedAt)}
          </p>
          {r.comment && (
            <blockquote className="mt-3 flex gap-2.5 rounded-lg bg-page px-4 py-3 text-sm text-ink">
              <MessageSquareText size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              <span>{r.comment}</span>
            </blockquote>
          )}
        </section>

        {r.stale && (
          <Notice tone="warn" icon={<TriangleAlert size={18} />}>
            The record was changed by someone else after this request was made. Compare with the current record before approving.
          </Notice>
        )}
        {r.warnings.length > 0 && r.status === 'pending' && (
          <Notice tone="warn" icon={<TriangleAlert size={18} />}>
            <span className="font-semibold">Please check:</span>
            <ul className="mt-1 list-disc pl-5">
              {r.warnings.map((w) => (
                <li key={w.field + w.message}>{w.message}</li>
              ))}
            </ul>
          </Notice>
        )}

        <Card title={r.kind === 'create' ? 'Proposed record' : 'What would change'} subtitle={r.kind === 'update' ? `${rows.length} field${rows.length === 1 ? '' : 's'}` : undefined} bodyClassName="p-0">
          {r.kind === 'update' ? <DiffTable rows={rows} /> : <CreateTable rows={rows} sections={sections} />}
        </Card>
      </div>

      <aside className="space-y-6">
        {proposedPoint && (
          <Card title="Location" subtitle={previousPoint ? 'Green: proposed · Grey: current' : undefined} bodyClassName="p-3">
            <LocationPicker value={proposedPoint} previous={previousPoint} readOnly className="h-60" label="Location of the source" />
          </Card>
        )}

        <Card title="Decision">
          {r.status !== 'pending' ? (
            <div className="space-y-2 text-sm">
              <ChangeStatusBadge status={r.status} />
              {r.reviewedBy && (
                <p className="text-ink-2">
                  By <span className="font-medium text-ink">{r.reviewedBy.name}</span> on {formatDate(r.reviewedAt)}
                </p>
              )}
              {r.reviewComment && <blockquote className="rounded-lg bg-page px-3 py-2 text-ink">{r.reviewComment}</blockquote>}
              {r.status === 'approved' && r.sourceId && (
                <Link to={`/sources/${r.sourceId}`} className="inline-flex items-center gap-1 pt-2 font-medium text-brand-700 hover:underline">
                  Open the water source <ArrowRight size={14} aria-hidden />
                </Link>
              )}
            </div>
          ) : r.canReview ? (
            <div className="space-y-3">
              <label htmlFor="review-comment" className="text-xs font-medium text-ink-2">
                Comment (required to reject)
              </label>
              <textarea
                id="review-comment"
                rows={3}
                value={comment}
                maxLength={1000}
                onChange={(e) => setComment(e.target.value)}
                className={`${inputClass} ${borderFor()} h-auto py-2`}
              />
              {error && (
                <p role="alert" className="rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical-ink">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => (setError(null), decide.mutate('approve'))} disabled={decide.isPending} className="flex-1">
                  <Check size={16} aria-hidden /> Approve
                </Button>
                <Button
                  onClick={() => {
                    setError(null);
                    if (!comment.trim()) return setError('Write a comment explaining why the change is rejected.');
                    decide.mutate('reject');
                  }}
                  disabled={decide.isPending}
                  className="flex-1 text-critical-ink"
                >
                  <X size={16} aria-hidden /> Reject
                </Button>
              </div>
              <p className="text-xs text-ink-3">Approving updates the registry immediately. Both outcomes are recorded in the audit log.</p>
            </div>
          ) : (
            <div className="space-y-3 text-sm text-ink-2">
              <p className="flex gap-2">
                <Info size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                <span>
                  Waiting for review by the <span className="font-medium text-ink">{department?.label ?? 'responsible'}</span> department.
                  {r.reviewBlockedReason && r.reviewBlockedReason !== 'Your role cannot approve changes' && <> {r.reviewBlockedReason}.</>}
                </span>
              </p>
              {r.canWithdraw && (
                <Button onClick={() => decide.mutate('withdraw')} disabled={decide.isPending}>
                  <Undo2 size={15} aria-hidden /> Withdraw request
                </Button>
              )}
              {error && <p className="text-critical-ink">{error}</p>}
            </div>
          )}
        </Card>
      </aside>
    </div>
  );
}

function DiffTable({ rows }: { rows: ChangeRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
            <th className="px-5 py-2.5 font-medium">Field</th>
            <th className="px-5 py-2.5 font-medium">Current</th>
            <th className="px-5 py-2.5 font-medium">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line align-top last:border-0">
              <td className="px-5 py-3 text-ink-2">{row.label}</td>
              <td className="px-5 py-3">
                <span className={row.before === '—' ? 'text-ink-3' : 'text-ink line-through decoration-critical/50'}>{row.before}</span>
              </td>
              <td className="px-5 py-3">
                <span className="rounded bg-good-wash px-1.5 py-0.5 font-medium text-good-ink">{row.after}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateTable({ rows, sections }: { rows: ChangeRow[]; sections: { id: string; label: string }[] }) {
  const filled = rows.filter((r) => r.after !== '—');
  return (
    <div className="divide-y divide-line">
      {sections.map((s) => {
        const items = filled.filter((r) => r.section === s.id);
        if (!items.length) return null;
        return (
          <div key={s.id} className="px-5 py-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">{s.label}</h3>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              {items.map((r) => (
                <div key={r.key}>
                  <dt className="text-xs text-ink-3">{r.label}</dt>
                  <dd className="text-sm text-ink">{r.after}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}

function Notice({ tone, icon, children }: { tone: 'warn'; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${tone === 'warn' ? 'border-gold-300/70 bg-gold-100/60 text-gold-800' : ''}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>{children}</div>
    </div>
  );
}
