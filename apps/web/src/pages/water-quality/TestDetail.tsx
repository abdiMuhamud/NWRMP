import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Ban, FlaskConical, MessageSquareText, PencilLine } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { StatusBadge, TypeLabel } from '../../components/ui/Badges';
import { Card } from '../../components/ui/Card';
import { Button, borderFor, inputClass } from '../../components/ui/Controls';
import { Dialog } from '../../components/ui/Dialog';
import { FactList } from '../../components/ui/FactList';
import { OutcomeBadge } from '../../components/ui/StateBadges';
import { ErrorState, LoadingBlock } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { ApiError, apiPost } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { KIND_LABELS, limitText, num } from '../../lib/quality';
import { useTest } from '../../lib/queries';
import type { TestDetail as Detail } from '../../lib/types';
import { FlagChip } from './TestForm';

export function TestDetail() {
  const { id } = useParams();
  const test = useTest(id);
  return (
    <>
      <Link to="/water-quality" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> Water quality
      </Link>
      {test.isError ? (
        <Card>
          <ErrorState error={test.error} onRetry={() => test.refetch()} />
        </Card>
      ) : !test.data ? (
        <Card>
          <LoadingBlock rows={8} />
        </Card>
      ) : (
        <TestView t={test.data} />
      )}
    </>
  );
}

function TestView({ t }: { t: Detail }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <section className="rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6">
          {t.state === 'completed' ? (
            <OutcomeBadge outcome={t.outcome} />
          ) : (
            <span className="inline-flex rounded-full bg-gold-100 px-2.5 py-1 text-[13px] font-medium text-gold-800">
              {t.state === 'requested' ? 'Waiting for the lab' : 'Request cancelled'}
            </span>
          )}
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Water test: {t.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
            <TypeLabel type={t.type} />
            <span>{t.region}</span>
            <Link to={`/sources/${t.sourceId}`} className="inline-flex items-center gap-1 font-mono text-xs text-brand-700 hover:underline">
              {t.code} <ArrowRight size={12} aria-hidden />
            </Link>
            <StatusBadge status={t.sourceStatus} size="sm" />
          </div>
          {t.requestNote && (
            <blockquote className="mt-4 flex gap-2.5 rounded-lg bg-page px-4 py-3 text-sm text-ink">
              <MessageSquareText size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              <span>
                {t.requestNote}
                <span className="mt-0.5 block text-xs text-ink-3">
                  {t.requestedBy}, {formatDate(t.requestedAt)}
                </span>
              </span>
            </blockquote>
          )}
          {t.state === 'cancelled' && t.cancelledReason && <p className="mt-3 text-sm text-ink-2">Cancelled: {t.cancelledReason}</p>}
        </section>

        {t.state === 'completed' && (
          <Card title="Results" subtitle={`${t.exceedances.length} of ${t.results.length} outside the limit`} bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
                    <th className="px-5 py-2.5 font-medium">Parameter</th>
                    <th className="px-5 py-2.5 font-medium">Result</th>
                    <th className="px-5 py-2.5 font-medium">Limit</th>
                    <th className="px-5 py-2.5 font-medium">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {t.results.map((r) => (
                    <tr key={r.code} className="border-b border-line align-top last:border-0">
                      <td className="px-5 py-3">
                        <div className="font-medium text-ink">{r.label}</div>
                        <div className="text-xs text-ink-3">{KIND_LABELS[r.kind]}</div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 tabular font-medium text-ink">
                        {num(r.value)} <span className="font-normal text-ink-3">{r.unit}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 tabular text-ink-2">{limitText(r, r.unit)}</td>
                      <td className="px-5 py-3">
                        <FlagChip flag={r.flag} kind={r.kind} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <aside className="space-y-6">
        <Card title="Sample">
          <FactList
            columns={1}
            facts={[
              { label: 'Taken on', value: t.sampledOn ? formatDate(t.sampledOn) : null },
              { label: 'Taken by', value: t.sampledBy },
              { label: 'Sampling point', value: t.samplePoint },
              { label: 'Laboratory', value: t.lab },
              { label: 'Analysed on', value: t.analysedOn ? formatDate(t.analysedOn) : null },
              { label: 'Recorded by', value: t.recordedBy ? `${t.recordedBy}, ${formatDate(t.recordedAt)}` : null },
              { label: 'Notes', value: t.notes },
            ]}
          />
        </Card>
        {(t.canRecord || t.canCorrect || t.canCancel) && (
          <Card title="Actions">
            <div className="flex flex-col gap-2">
              {t.canRecord && (
                <Link
                  to={`/water-quality/record?test=${t.id}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-700 px-3.5 text-sm font-medium text-white shadow-card hover:bg-brand-800"
                >
                  <FlaskConical size={16} aria-hidden /> Enter results
                </Link>
              )}
              {t.canCorrect && (
                <Link
                  to={`/water-quality/record?test=${t.id}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-page"
                >
                  <PencilLine size={16} aria-hidden /> Correct results
                </Link>
              )}
              {t.canCancel && (
                <Button className="text-critical-ink" onClick={() => setCancelOpen(true)}>
                  <Ban size={16} aria-hidden /> Cancel request
                </Button>
              )}
            </div>
          </Card>
        )}
      </aside>
      {cancelOpen && <CancelDialog t={t} onClose={() => setCancelOpen(false)} />}
    </div>
  );
}

function CancelDialog({ t, onClose }: { t: Detail; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cancel = useMutation({
    mutationFn: () => apiPost(`/water-quality/tests/${t.id}/cancel`, { reason }),
    onSuccess: () => {
      for (const key of ['wq-tests', 'wq-test', 'wq-source']) queryClient.invalidateQueries({ queryKey: [key] });
      toast('Request cancelled');
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not cancel'),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Cancel the request"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Keep it</Button>
          <Button
            variant="primary"
            disabled={cancel.isPending}
            onClick={() => (reason.trim().length < 3 ? setError('Give a reason') : (setError(null), cancel.mutate()))}
          >
            Cancel request
          </Button>
        </>
      }
    >
      <label htmlFor="cancel-reason" className="mb-1 block text-xs font-medium text-ink-2">
        Reason
      </label>
      <textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={`${inputClass} ${borderFor(error ?? undefined)} h-auto py-2`} />
      {error && <p className="mt-1 text-xs text-critical-ink">{error}</p>}
    </Dialog>
  );
}
