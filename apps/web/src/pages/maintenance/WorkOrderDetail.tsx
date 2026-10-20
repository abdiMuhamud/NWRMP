import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Ban, Check, CircleCheck, Hammer, Info, RotateCcw, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { StatusBadge, TypeLabel } from '../../components/ui/Badges';
import { Card } from '../../components/ui/Card';
import { Button, Field, Select, borderFor, inputClass } from '../../components/ui/Controls';
import { Dialog } from '../../components/ui/Dialog';
import { FactList } from '../../components/ui/FactList';
import { PriorityTag, WorkOrderStatusBadge } from '../../components/ui/StateBadges';
import { ErrorState, LoadingBlock } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { ApiError, apiPost } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, formatNumber } from '../../lib/format';
import { useTechnicians, useWorkOrder } from '../../lib/queries';
import type { WorkOrderDetail as Detail } from '../../lib/types';

const REFRESH = ['work-order', 'work-orders', 'source', 'sources', 'sources-geojson', 'summary', 'source-history'];

export function WorkOrderDetail() {
  const { id } = useParams();
  const wo = useWorkOrder(id);
  return (
    <>
      <Link to="/maintenance" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> Maintenance
      </Link>
      {wo.isError ? (
        <Card>
          <ErrorState error={wo.error} onRetry={() => wo.refetch()} />
        </Card>
      ) : !wo.data ? (
        <Card>
          <LoadingBlock rows={8} />
        </Card>
      ) : (
        <WorkOrderView w={wo.data} />
      )}
    </>
  );
}

function WorkOrderView({ w }: { w: Detail }) {
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const hasActions = w.canAssign || w.canTake || w.canStart || w.canComplete || w.canClose || w.canCancel || w.closeBlockedReason;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <section className="rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <WorkOrderStatusBadge status={w.status} />
            {w.status !== 'closed' && w.status !== 'cancelled' && <PriorityTag priority={w.priority} />}
            <span className="font-mono text-xs text-ink-3">{w.ref}</span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{w.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
            <span className="font-medium text-ink">{w.categoryLabel}</span>
            <Link to={`/sources/${w.sourceId}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline">
              {w.name} <ArrowRight size={12} aria-hidden />
            </Link>
            <TypeLabel type={w.type} />
            <span>{w.region}</span>
            <StatusBadge status={w.sourceStatus} size="sm" />
          </div>
          <p className="mt-4 text-sm text-ink-2">
            Reported by <span className="font-medium text-ink">{w.reportedBy}</span> on {formatDate(w.reportedAt)}
            {w.inspectionId && (
              <>
                {' '}
                ·{' '}
                <Link to={`/inspections/${w.inspectionId}`} className="text-brand-700 hover:underline">
                  from a field inspection
                </Link>
              </>
            )}
          </p>
          {w.description && <p className="mt-3 whitespace-pre-line rounded-lg bg-page px-4 py-3 text-sm text-ink">{w.description}</p>}
          {w.status === 'in_progress' && w.closeComment && (
            <div className="mt-3 flex gap-2.5 rounded-lg border border-gold-300/70 bg-gold-100/60 px-4 py-3 text-sm text-gold-800">
              <RotateCcw size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">Reopened:</span> {w.closeComment}
              </span>
            </div>
          )}
          {w.status === 'cancelled' && w.cancelledReason && <p className="mt-3 text-sm text-ink-2">Cancelled: {w.cancelledReason}</p>}
        </section>

        {(w.status === 'completed' || w.status === 'closed' || w.workDone) && (
          <Card title="Repair report" subtitle={w.completedBy ? `By ${w.completedBy}` : undefined}>
            <FactList
              facts={[
                { label: 'Work done', value: w.workDone },
                { label: 'Completed on', value: w.completedOn ? formatDate(w.completedOn) : null },
                { label: 'Done by', value: w.performedBy },
                { label: 'Parts used', value: w.partsUsed },
                { label: 'Cost', value: w.costUsd !== null ? `US$ ${formatNumber(w.costUsd, 2)}` : null },
                {
                  label: 'Source after the repair',
                  value:
                    w.workingAfter === null ? null : w.workingAfter ? (
                      <span className="font-medium text-good-ink">Working again</span>
                    ) : (
                      <span className="font-medium text-critical-ink">Still not working</span>
                    ),
                },
              ]}
            />
            {w.status === 'closed' && (
              <p className="mt-4 border-t border-line pt-3 text-sm text-ink-2">
                Closed by <span className="font-medium text-ink">{w.closedBy}</span> on {formatDate(w.closedAt)}
                {w.closeComment && <>: “{w.closeComment}”</>}
                <span className="mt-1 block text-xs text-ink-3">The source’s status and repair history were updated.</span>
              </p>
            )}
          </Card>
        )}

        <Card title="History" bodyClassName="px-5 py-4">
          <ol className="relative space-y-4 border-l border-line pl-5">
            {w.timeline.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[27px] top-1 grid size-[13px] place-items-center rounded-full bg-surface ring-2 ring-brand-600">
                  <span className="size-1.5 rounded-full bg-brand-600" />
                </span>
                <div className="text-sm text-ink">{e.summary}</div>
                <div className="text-xs text-ink-3">
                  {e.userName ?? 'Unknown'} · {formatDate(e.at)}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <aside className="space-y-6">
        {hasActions && (
          <Card title="Actions">
            <div className="space-y-4">
              {(w.canTake || w.canAssign) && <AssignBlock w={w} />}
              {w.canStart && <ActionButton w={w} action="start" icon={Hammer} label="Start work" primary done="Work started" />}
              {w.canComplete && (
                <Button variant="primary" className="w-full" onClick={() => setCompleteOpen(true)}>
                  <CircleCheck size={16} aria-hidden /> Complete the repair
                </Button>
              )}
              {(w.canClose || w.canReopen) && <CloseBlock w={w} />}
              {w.closeBlockedReason && (
                <p className="flex gap-2 text-sm text-ink-2">
                  <Info size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                  {w.closeBlockedReason}
                </p>
              )}
              {w.canCancel && (
                <Button className="w-full text-critical-ink" onClick={() => setCancelOpen(true)}>
                  <Ban size={16} aria-hidden /> Cancel work order
                </Button>
              )}
            </div>
          </Card>
        )}
        <Card title="Assignment">
          <FactList
            columns={1}
            facts={[
              { label: 'Technician', value: w.assignedTo },
              { label: 'Assigned on', value: w.assignedAt ? formatDate(w.assignedAt) : null },
              { label: 'Work started', value: w.startedAt ? formatDate(w.startedAt) : null },
            ]}
          />
        </Card>
      </aside>
      {completeOpen && <CompleteDialog w={w} onClose={() => setCompleteOpen(false)} />}
      {cancelOpen && <CancelDialog w={w} onClose={() => setCancelOpen(false)} />}
    </div>
  );
}

function useAction(w: Detail) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: unknown; done: string }) => apiPost(`/work-orders/${w.id}/${action}`, body ?? {}),
    onSuccess: (_r, vars) => {
      for (const key of REFRESH) queryClient.invalidateQueries({ queryKey: [key] });
      setError(null);
      toast(vars.done);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });
  return { mutation, error, setError };
}

function ActionButton({ w, action, icon: Icon, label, done, primary }: { w: Detail; action: string; icon: typeof Hammer; label: string; done: string; primary?: boolean }) {
  const { mutation, error } = useAction(w);
  return (
    <div>
      <Button variant={primary ? 'primary' : 'secondary'} className="w-full" disabled={mutation.isPending} onClick={() => mutation.mutate({ action, done })}>
        <Icon size={16} aria-hidden /> {label}
      </Button>
      {error && <p className="mt-1 text-xs text-critical-ink">{error}</p>}
    </div>
  );
}

function AssignBlock({ w }: { w: Detail }) {
  const { me } = useAuth();
  const technicians = useTechnicians(w.canAssign);
  const [userId, setUserId] = useState('');
  const { mutation, error, setError } = useAction(w);

  return (
    <div className="space-y-2">
      {w.canTake && me && (
        <Button
          variant="primary"
          className="w-full"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ action: 'assign', body: { userId: me.user.id }, done: 'The job is yours' })}
        >
          <UserPlus size={16} aria-hidden /> Take this job
        </Button>
      )}
      {w.canAssign && (
        <div className="flex items-end gap-2">
          <Select label={w.assignedTo ? 'Reassign to' : 'Assign to'} value={userId} onChange={setUserId} className="flex-1">
            <option value="">Choose a technician…</option>
            {technicians.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName} ({t.openJobs} open)
              </option>
            ))}
          </Select>
          <Button
            disabled={mutation.isPending}
            onClick={() => (userId ? mutation.mutate({ action: 'assign', body: { userId }, done: 'Assigned' }) : setError('Choose a technician'))}
          >
            Assign
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-critical-ink">{error}</p>}
    </div>
  );
}

function CloseBlock({ w }: { w: Detail }) {
  const [comment, setComment] = useState('');
  const { mutation, error, setError } = useAction(w);
  return (
    <div className="space-y-2 rounded-lg bg-page p-3">
      <p className="text-sm text-ink">
        {w.workingAfter ? 'The technician reports the source works again.' : 'The technician reports the source still does not work.'} Check with the
        community or on site, then close.
      </p>
      <label htmlFor="close-comment" className="block text-xs font-medium text-ink-2">
        Comment (required to reopen)
      </label>
      <textarea id="close-comment" rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} className={`${inputClass} ${borderFor()} h-auto py-2`} />
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ action: 'close', body: { comment }, done: w.workingAfter ? 'Closed. The source is marked functioning.' : 'Closed. The source stays not functioning.' })}
        >
          <Check size={16} aria-hidden /> Close
        </Button>
        <Button
          className="flex-1 text-critical-ink"
          disabled={mutation.isPending}
          onClick={() => (comment.trim() ? mutation.mutate({ action: 'reopen', body: { comment }, done: 'Reopened for the technician' }) : setError('Write what still needs to be done'))}
        >
          <RotateCcw size={16} aria-hidden /> Reopen
        </Button>
      </div>
      <p className="text-xs text-ink-3">Closing sets the source to {w.workingAfter ? 'functioning' : 'not functioning'} and adds the repair to its history.</p>
      {error && <p className="text-xs text-critical-ink">{error}</p>}
    </div>
  );
}

function CompleteDialog({ w, onClose }: { w: Detail; onClose: () => void }) {
  const { mutation, error } = useAction(w);
  const [form, setForm] = useState({ workDone: '', completedOn: new Date().toISOString().slice(0, 10), partsUsed: '', costUsd: '', performedBy: '', workingAfter: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.workDone.trim().length < 3) next.workDone = 'Describe the work done';
    if (!form.completedOn) next.completedOn = 'Enter the date';
    if (form.costUsd && !(Number(form.costUsd) >= 0)) next.costUsd = 'Enter an amount';
    if (!form.workingAfter) next.workingAfter = 'Say whether the source works now';
    setErrors(next);
    if (Object.keys(next).length) return;
    mutation.mutate(
      {
        action: 'complete',
        body: {
          workDone: form.workDone,
          completedOn: form.completedOn,
          partsUsed: form.partsUsed || undefined,
          costUsd: form.costUsd ? Number(form.costUsd) : undefined,
          performedBy: form.performedBy || undefined,
          workingAfter: form.workingAfter === 'yes',
        },
        done: 'Repair reported. The coordinator will check and close it.',
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Complete ${w.ref}`}
      description="The regional coordinator checks the repair and closes the work order."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="complete-form" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Send repair report'}
          </Button>
        </>
      }
    >
      <form id="complete-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Work done" htmlFor="c-work" required error={errors.workDone}>
          <textarea id="c-work" rows={3} value={form.workDone} onChange={set('workDone')} maxLength={4000} className={`${inputClass} ${borderFor(errors.workDone)} h-auto py-2`} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Completed on" htmlFor="c-date" required error={errors.completedOn}>
            <input id="c-date" type="date" max={new Date().toISOString().slice(0, 10)} value={form.completedOn} onChange={set('completedOn')} className={`${inputClass} ${borderFor(errors.completedOn)}`} />
          </Field>
          <Field label="Done by" htmlFor="c-by" hint="Team, agency or contractor">
            <input id="c-by" value={form.performedBy} onChange={set('performedBy')} maxLength={200} className={`${inputClass} ${borderFor()}`} />
          </Field>
        </div>
        <Field label="Parts used" htmlFor="c-parts">
          <input id="c-parts" value={form.partsUsed} onChange={set('partsUsed')} maxLength={2000} className={`${inputClass} ${borderFor()}`} />
        </Field>
        <Field label="Cost (US$)" htmlFor="c-cost" error={errors.costUsd}>
          <input id="c-cost" inputMode="decimal" value={form.costUsd} onChange={set('costUsd')} className={`${inputClass} ${borderFor(errors.costUsd)} sm:w-40`} />
        </Field>
        <fieldset>
          <legend className="text-xs font-medium text-ink-2">
            Does the source work now? <span className="text-critical-ink">*</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-ink">
            {[
              ['yes', 'Yes, working again'],
              ['no', 'No, still not working'],
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" name="working" value={value} checked={form.workingAfter === value} onChange={set('workingAfter')} className="size-4 accent-brand-700" />
                {label}
              </label>
            ))}
          </div>
          {errors.workingAfter && <p className="mt-1 text-xs text-critical-ink">{errors.workingAfter}</p>}
        </fieldset>
        {error && (
          <p role="alert" className="rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical-ink">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

function CancelDialog({ w, onClose }: { w: Detail; onClose: () => void }) {
  const { mutation, error, setError } = useAction(w);
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Cancel ${w.ref}`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Keep it</Button>
          <Button
            variant="primary"
            disabled={mutation.isPending}
            onClick={() => (reason.trim().length < 3 ? setError('Give a reason') : mutation.mutate({ action: 'cancel', body: { reason }, done: 'Work order cancelled' }, { onSuccess: onClose }))}
          >
            Cancel work order
          </Button>
        </>
      }
    >
      <label htmlFor="wo-cancel" className="mb-1 block text-xs font-medium text-ink-2">
        Reason
      </label>
      <textarea id="wo-cancel" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={`${inputClass} ${borderFor(error ?? undefined)} h-auto py-2`} />
      {error && <p className="mt-1 text-xs text-critical-ink">{error}</p>}
    </Dialog>
  );
}
