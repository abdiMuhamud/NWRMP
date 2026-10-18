import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardPlus, Images, MapPinned } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AssignDialog } from '../../components/inspections/AssignDialog';
import { InspectionStateBadge } from '../../components/inspections/InspectionStateBadge';
import { TypeLabel } from '../../components/ui/Badges';
import { Card } from '../../components/ui/Card';
import { Button, Segmented } from '../../components/ui/Controls';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { ApiError, apiPost } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDistance } from '../../lib/device';
import { formatDate } from '../../lib/format';
import { useInspectionCounts, useInspections, useTeamAssignments } from '../../lib/queries';
import type { InspectionListItem } from '../../lib/types';

type Tab = 'review' | 'assignments' | 'recent';

export function Inspections() {
  const { can, me } = useAuth();
  const [params, setParams] = useSearchParams();
  const [assignOpen, setAssignOpen] = useState(false);
  const canReview = can('inspections.review');
  const canAssign = can('inspections.assign');
  const counts = useInspectionCounts(Boolean(me));

  const tabs: { value: Tab; label: string }[] = [
    ...(canReview ? [{ value: 'review' as Tab, label: `To review${counts.data?.toReview ? ` (${counts.data.toReview})` : ''}` }] : []),
    ...(canAssign ? [{ value: 'assignments' as Tab, label: 'Assignments' }] : []),
    { value: 'recent', label: 'Recently reviewed' },
  ];
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = requested && tabs.some((t) => t.value === requested) ? requested : tabs[0].value;

  return (
    <>
      <PageHeader
        eyebrow="Field work"
        title="Inspections"
        description="Assign field visits, review what comes back from the field, and keep the registry verified."
        actions={
          canAssign && (
            <Button variant="primary" onClick={() => setAssignOpen(true)}>
              <ClipboardPlus size={16} aria-hidden /> Assign inspections
            </Button>
          )
        }
      />
      <Card
        bodyClassName="p-0"
        title={tabs.find((t) => t.value === tab)?.label.replace(/ \(\d+\)$/, '')}
        action={tabs.length > 1 && <Segmented label="Show" value={tab} options={tabs} onChange={(v) => setParams({ tab: v }, { replace: true })} />}
      >
        {tab === 'assignments' ? <AssignmentsTable /> : <InspectionTable box={tab} />}
      </Card>
      {assignOpen && <AssignDialog open onClose={() => setAssignOpen(false)} />}
    </>
  );
}

function InspectionTable({ box }: { box: 'review' | 'recent' }) {
  const list = useInspections(box);
  const navigate = useNavigate();
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  if (!list.data) return <LoadingRows />;
  if (list.data.length === 0) {
    return <EmptyState title={box === 'review' ? 'Nothing waiting for review' : 'No inspections reviewed yet'} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Inspector</th>
            <th className="px-4 py-3 font-medium">Visit</th>
            <th className="px-4 py-3 font-medium">Evidence</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {list.data.map((i) => (
            <tr key={i.id} onClick={() => navigate(`/inspections/${i.id}`)} className="cursor-pointer border-b border-line last:border-0 hover:bg-brand-50/50">
              <td className="px-4 py-3">
                <Link to={`/inspections/${i.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:text-brand-700 hover:underline">
                  {i.name}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                  <TypeLabel type={i.type} /> · {i.code} · {i.region}
                </div>
              </td>
              <td className="px-4 py-3 text-ink">{i.inspector}</td>
              <td className="px-4 py-3">
                <div className="text-ink">{formatDate(i.inspectedOn)}</div>
                <div className="text-xs text-ink-3">sent {formatDate(i.submittedAt)}</div>
              </td>
              <td className="px-4 py-3">
                <Evidence i={i} />
              </td>
              <td className="px-4 py-3">
                <InspectionStateBadge state={i.state} size="sm" />
                {i.reviewer && <div className="mt-1 text-xs text-ink-3">by {i.reviewer}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Evidence({ i }: { i: InspectionListItem }) {
  return (
    <div className="space-y-0.5 text-xs">
      <div className="inline-flex items-center gap-1 text-ink-2">
        <Images size={13} aria-hidden /> {i.photoCount} photo{i.photoCount === 1 ? '' : 's'}
      </div>
      <div className={`flex items-center gap-1 ${i.distanceM === null ? 'text-ink-3' : i.distanceM > 500 ? 'font-medium text-warn-ink' : 'text-ink-2'}`}>
        <MapPinned size={13} aria-hidden /> {i.distanceM === null ? 'No GPS' : `${formatDistance(i.distanceM)} from registered point`}
      </div>
    </div>
  );
}

function AssignmentsTable() {
  const list = useTeamAssignments();
  const toast = useToast();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const cancel = useMutation({
    mutationFn: (id: string) => apiPost(`/inspections/assignments/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      toast('Assignment cancelled');
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Could not cancel', 'error'),
  });

  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  if (!list.data) return <LoadingRows />;
  if (list.data.length === 0) return <EmptyState title="No open assignments">Use “Assign inspections” to send field officers to sources.</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Assigned to</th>
            <th className="px-4 py-3 font-medium">Due</th>
            <th className="px-4 py-3 font-medium">Progress</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {list.data.map((a) => {
            const overdue = a.status === 'open' && a.dueOn !== null && a.dueOn < today;
            return (
              <tr key={a.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <Link to={`/sources/${a.sourceId}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
                    {a.name}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                    <TypeLabel type={a.type} /> · {a.code}
                  </div>
                </td>
                <td className="px-4 py-3 text-ink">
                  {a.assignedTo}
                  <div className="text-xs text-ink-3">by {a.assignedBy}</div>
                </td>
                <td className={`whitespace-nowrap px-4 py-3 ${overdue ? 'font-medium text-critical-ink' : 'text-ink-2'}`}>
                  {a.dueOn ? `${overdue ? 'Overdue · ' : ''}${formatDate(a.dueOn)}` : '—'}
                </td>
                <td className="px-4 py-3">
                  {a.inspectionState === 'returned' ? (
                    <InspectionStateBadge state="returned" size="sm" />
                  ) : a.status === 'submitted' && a.inspectionId ? (
                    <Link to={`/inspections/${a.inspectionId}`} className="hover:underline">
                      <InspectionStateBadge state="submitted" size="sm" />
                    </Link>
                  ) : (
                    <span className="text-xs text-ink-2">Not visited yet</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {a.status === 'open' && a.inspectionState !== 'returned' && (
                    <Button variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => cancel.mutate(a.id)} disabled={cancel.isPending}>
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}
