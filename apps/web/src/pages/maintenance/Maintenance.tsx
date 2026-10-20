import { Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ReportBreakdownDialog } from '../../components/maintenance/ReportBreakdownDialog';
import { TypeLabel } from '../../components/ui/Badges';
import { Card } from '../../components/ui/Card';
import { Button, Segmented } from '../../components/ui/Controls';
import { PageHeader } from '../../components/ui/PageHeader';
import { PriorityTag, WorkOrderStatusBadge } from '../../components/ui/StateBadges';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { useReference, useWorkOrderCounts, useWorkOrders } from '../../lib/queries';

type Tab = 'active' | 'mine' | 'to_close' | 'closed';

export function Maintenance() {
  const { can, me } = useAuth();
  const [params, setParams] = useSearchParams();
  const counts = useWorkOrderCounts(Boolean(me));
  const [reportOpen, setReportOpen] = useState(false);
  const isTechnician = me?.user.role === 'maintenance_officer';

  const tabs: { value: Tab; label: string }[] = [
    ...(isTechnician ? [{ value: 'mine' as Tab, label: `My jobs${counts.data?.mine ? ` (${counts.data.mine})` : ''}` }] : []),
    { value: 'active', label: `Open${counts.data?.active ? ` (${counts.data.active})` : ''}` },
    ...(can('maintenance.close') ? [{ value: 'to_close' as Tab, label: `To close${counts.data?.toClose ? ` (${counts.data.toClose})` : ''}` }] : []),
    { value: 'closed', label: 'Closed' },
  ];
  const requested = params.get('tab') as Tab | null;
  // Technicians start on their own jobs, or on the open ones while they have none.
  const fallback: Tab = isTechnician && !counts.data?.mine ? 'active' : tabs[0].value;
  const tab: Tab = requested && tabs.some((t) => t.value === requested) ? requested : fallback;

  return (
    <>
      <PageHeader
        eyebrow="Operation and maintenance"
        title="Maintenance"
        description="Breakdowns reported from the field, the repairs done, and the coordinator's check that the source works again."
        actions={
          can('maintenance.report') && (
            <Button variant="primary" onClick={() => setReportOpen(true)}>
              <Wrench size={16} aria-hidden /> Report a breakdown
            </Button>
          )
        }
      />
      <Card
        bodyClassName="p-0"
        title={tabs.find((t) => t.value === tab)?.label.replace(/ \(\d+\)$/, '')}
        action={<Segmented label="Show" value={tab} options={tabs} onChange={(v) => setParams({ tab: v }, { replace: true })} />}
      >
        <WorkOrderTable box={tab} />
      </Card>
      {reportOpen && <ReportBreakdownDialog open onClose={() => setReportOpen(false)} />}
    </>
  );
}

function WorkOrderTable({ box }: { box: Tab }) {
  const list = useWorkOrders(box);
  const reference = useReference();
  const navigate = useNavigate();
  const categoryLabel = (code: string) => reference.data?.workOrderCategories.find((c) => c.code === code)?.label ?? code;

  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  if (!list.data) {
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }
  if (list.data.length === 0) {
    const titles: Record<Tab, string> = {
      active: 'No open work orders',
      mine: 'No jobs assigned to you',
      to_close: 'No repairs waiting to be closed',
      closed: 'No closed work orders yet',
    };
    return <EmptyState title={titles[box]}>{box === 'mine' && 'Take a job from “Open”, or wait for one to be assigned to you.'}</EmptyState>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
            <th className="px-4 py-3 font-medium">Work order</th>
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Reported</th>
            <th className="px-4 py-3 font-medium">Technician</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {list.data.map((w) => (
            <tr key={w.id} onClick={() => navigate(`/maintenance/${w.id}`)} className="cursor-pointer border-b border-line align-top last:border-0 hover:bg-brand-50/50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink-3">{w.ref}</span>
                  {w.status !== 'closed' && w.status !== 'cancelled' && <PriorityTag priority={w.priority} />}
                </div>
                <Link to={`/maintenance/${w.id}`} onClick={(e) => e.stopPropagation()} className="mt-0.5 block font-medium text-ink hover:text-brand-700 hover:underline">
                  {w.title}
                </Link>
                <div className="text-xs text-ink-3">{categoryLabel(w.category)}</div>
              </td>
              <td className="px-4 py-3">
                <div className="text-ink">{w.name}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                  <TypeLabel type={w.type} /> · {w.region}
                </div>
              </td>
              <td className="px-4 py-3 text-ink-2">
                {formatDate(w.reportedAt)}
                <div className="text-xs text-ink-3">by {w.reportedBy ?? '—'}</div>
              </td>
              <td className="px-4 py-3 text-ink-2">{w.assignedTo ?? <span className="text-ink-3">Not assigned</span>}</td>
              <td className="px-4 py-3">
                <WorkOrderStatusBadge status={w.status} size="sm" />
                {w.status === 'closed' && w.workingAfter === false && <div className="mt-1 text-xs text-critical-ink">Not repaired</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
