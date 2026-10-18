import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ChevronRight, CircleAlert, CloudOff, CloudUpload, Inbox, MapPin, RotateCcw, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { TypeSwatch } from '../../components/ui/Badges';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Controls';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { useAuth } from '../../lib/auth';
import { TYPE_META } from '../../lib/domain';
import { formatDate } from '../../lib/format';
import { discardOutboxItem, syncOutbox, useOnline, useOutbox } from '../../lib/offline';
import { useInspections, useMyAssignments } from '../../lib/queries';
import type { Assignment } from '../../lib/types';

export function MyInspections() {
  const { me } = useAuth();
  const online = useOnline();
  const queryClient = useQueryClient();
  const assignments = useMyAssignments();
  const mine = useInspections('mine', online);
  const { items: outbox, syncing } = useOutbox();

  const refresh = () => {
    for (const key of ['assignments', 'inspections']) queryClient.invalidateQueries({ queryKey: [key] });
  };
  const returned = (mine.data ?? []).filter((i) => i.state === 'returned');
  const recent = (mine.data ?? []).filter((i) => i.state !== 'returned').slice(0, 8);
  const pendingIds = new Set(outbox.map((o) => o.assignmentId).filter(Boolean));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={me?.user.regionName ?? 'Field work'}
        title="My inspections"
        description="Sources assigned to you. Forms work without signal; finished inspections are sent automatically when you are back online."
        actions={
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              online ? 'bg-good-wash text-good-ink' : 'bg-muted-wash text-muted-ink'
            }`}
          >
            {online ? <span className="size-2 rounded-full bg-good" /> : <CloudOff size={13} aria-hidden />}
            {online ? 'Online' : 'Offline'}
          </span>
        }
      />

      <div className="space-y-6">
        {outbox.length > 0 && (
          <Card
            title="Waiting to send"
            subtitle={online ? 'These will be sent now.' : 'Saved on this phone. They will be sent when you have signal.'}
            action={
              <Button onClick={() => void syncOutbox(refresh)} disabled={!online || syncing} className="h-9">
                <CloudUpload size={15} aria-hidden /> {syncing ? 'Sending…' : 'Send now'}
              </Button>
            }
            bodyClassName="px-5 py-2"
          >
            <ul className="divide-y divide-line">
              {outbox.map((o) => (
                <li key={o.clientId} className="flex items-start gap-3 py-3">
                  <span className={`mt-0.5 ${o.status === 'needs_attention' ? 'text-critical-ink' : 'text-ink-3'}`}>
                    {o.status === 'needs_attention' ? <CircleAlert size={18} aria-hidden /> : <CloudUpload size={18} aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{o.sourceName}</div>
                    <div className="text-xs text-ink-3">
                      {o.sourceCode} · visit {formatDate(o.inspectedOn)} · {o.photos.length} photo{o.photos.length === 1 ? '' : 's'}
                    </div>
                    <div className={`mt-0.5 text-xs ${o.status === 'needs_attention' ? 'text-critical-ink' : 'text-ink-2'}`}>
                      {o.status === 'sending' ? 'Sending…' : o.status === 'needs_attention' ? o.error : o.error ?? 'Waiting for signal'}
                    </div>
                  </div>
                  {o.status === 'needs_attention' && (
                    <Button variant="ghost" className="h-8 px-2 text-xs text-critical-ink" onClick={() => void discardOutboxItem(o.clientId)}>
                      <Trash2 size={14} aria-hidden /> Discard
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {returned.length > 0 && (
          <Card title="Returned for correction" bodyClassName="px-5 py-2">
            <ul className="divide-y divide-line">
              {returned.map((i) => (
                <li key={i.id} className="py-3">
                  <Link to={`/field/inspect/${i.sourceId}?inspection=${i.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-page">
                    <RotateCcw size={18} className="shrink-0 text-warn-ink" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{i.name}</div>
                      <div className="text-xs text-ink-3">
                        Returned by {i.reviewer ?? 'reviewer'} · {formatDate(i.reviewedAt)}
                      </div>
                    </div>
                    <span className="text-sm font-medium text-brand-700">Correct</span>
                    <ChevronRight size={16} className="text-ink-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Assigned to me" subtitle={assignments.data ? `${assignments.data.filter((a) => a.status === 'open').length} to do` : undefined} bodyClassName="p-0">
          {assignments.isError ? (
            <ErrorState error={assignments.error} onRetry={() => assignments.refetch()} />
          ) : !assignments.data ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : assignments.data.length === 0 ? (
            <EmptyState title="Nothing assigned right now">
              Your coordinator assigns inspections here. You can also open any source in your region from{' '}
              <Link to="/sources" className="font-medium text-brand-700 hover:underline">
                Water sources
              </Link>{' '}
              and inspect it.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {assignments.data.map((a) => (
                <AssignmentRow key={a.id} a={a} pendingOnPhone={pendingIds.has(a.id)} today={today} />
              ))}
            </ul>
          )}
        </Card>

        {recent.length > 0 && (
          <Card title="Recently sent" bodyClassName="px-5 py-2">
            <ul className="divide-y divide-line">
              {recent.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <TypeSwatch type={i.type} />
                  <span className="min-w-0 flex-1 truncate text-ink">{i.name}</span>
                  <span className={`text-xs font-medium ${i.state === 'approved' ? 'text-good-ink' : 'text-warn-ink'}`}>
                    {i.state === 'approved' ? 'Approved' : 'Waiting for review'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {!online && !assignments.data && (
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <Inbox size={16} aria-hidden /> Open this page once with signal so your list is saved on the phone.
          </p>
        )}
      </div>
    </div>
  );
}

function AssignmentRow({ a, pendingOnPhone, today }: { a: Assignment; pendingOnPhone: boolean; today: string }) {
  const overdue = a.status === 'open' && a.dueOn !== null && a.dueOn < today;
  const waitingReview = a.status === 'submitted';
  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-1">
          <TypeSwatch type={a.type} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink">{a.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
            <span>
              {TYPE_META[a.type].label} · {a.code}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} aria-hidden />
              {[a.settlement, a.district].filter(Boolean).join(', ') || a.region}
            </span>
            {a.dueOn && (
              <span className={`inline-flex items-center gap-1 ${overdue ? 'font-medium text-critical-ink' : ''}`}>
                <CalendarClock size={12} aria-hidden /> {overdue ? 'Overdue · ' : 'Due '}
                {formatDate(a.dueOn)}
              </span>
            )}
          </div>
          {a.notes && <p className="mt-1.5 text-sm text-ink-2">{a.notes}</p>}
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        {waitingReview ? (
          <span className="text-sm font-medium text-warn-ink">Sent · waiting for review</span>
        ) : pendingOnPhone ? (
          <span className="text-sm font-medium text-ink-2">Saved on phone · waiting to send</span>
        ) : (
          <Link
            to={`/field/inspect/${a.sourceId}?assignment=${a.id}`}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
          >
            Start inspection <ChevronRight size={16} aria-hidden />
          </Link>
        )}
      </div>
    </li>
  );
}
