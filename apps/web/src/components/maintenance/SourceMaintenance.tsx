import { Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { useWorkOrders } from '../../lib/queries';
import type { SourceDetail } from '../../lib/types';
import { Card } from '../ui/Card';
import { PriorityTag, WorkOrderStatusBadge } from '../ui/StateBadges';
import { ReportBreakdownDialog } from './ReportBreakdownDialog';

/** Open work orders and past repairs of one source. */
export function SourceMaintenance({ s }: { s: SourceDetail }) {
  const { can } = useAuth();
  const orders = useWorkOrders('source', s.id);
  const [reportOpen, setReportOpen] = useState(false);
  const active = (orders.data ?? []).filter((w) => w.status !== 'closed' && w.status !== 'cancelled');

  return (
    <Card
      title="Maintenance"
      bodyClassName="px-5 py-4"
      action={
        can('maintenance.report') && (
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-xs font-medium text-ink hover:bg-page"
          >
            <Wrench size={13} aria-hidden /> Report breakdown
          </button>
        )
      }
    >
      {active.length > 0 && (
        <ul className="mb-4 space-y-2">
          {active.map((w) => (
            <li key={w.id}>
              <Link to={`/maintenance/${w.id}`} className="block rounded-lg border border-line px-3 py-2.5 hover:bg-page">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-ink-3">{w.ref}</span>
                  <PriorityTag priority={w.priority} />
                </div>
                <div className="mt-0.5 text-sm font-medium text-ink">{w.title}</div>
                <div className="mt-1.5">
                  <WorkOrderStatusBadge status={w.status} size="sm" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Repairs and interventions</h3>
      {s.interventions.length === 0 ? (
        <p className="text-sm text-ink-3">None recorded.</p>
      ) : (
        <ul className="space-y-3">
          {s.interventions.map((iv) => (
            <li key={iv.id} className="flex gap-3">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-water-50 text-water-600">
                <Wrench size={14} aria-hidden />
              </span>
              <div className="min-w-0 text-sm">
                <div className="font-medium text-ink">{iv.description ?? 'Intervention'}</div>
                <div className="text-xs text-ink-3">
                  {formatDate(iv.performedOn)} · {iv.agency ?? 'Agency not recorded'}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {reportOpen && <ReportBreakdownDialog open onClose={() => setReportOpen(false)} source={{ id: s.id, name: s.name, code: s.code }} />}
    </Card>
  );
}

/** Shown on a non-functioning source when nobody has reported the breakdown yet. */
export function UnreportedBreakdownBanner({ s }: { s: SourceDetail }) {
  const { can } = useAuth();
  const orders = useWorkOrders('source', s.id);
  const [reportOpen, setReportOpen] = useState(false);
  const hasActive = (orders.data ?? []).some((w) => w.status !== 'closed' && w.status !== 'cancelled');
  if (s.status !== 'non_functioning' || !orders.isSuccess || hasActive || !can('maintenance.report')) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-critical/25 bg-critical-wash px-4 py-3 text-sm text-critical-ink">
      <p className="flex gap-2.5">
        <Wrench size={18} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          <span className="font-semibold">Not functioning, and no repair has been requested.</span> Report the breakdown so the maintenance team can act.
        </span>
      </p>
      <button type="button" onClick={() => setReportOpen(true)} className="font-medium underline underline-offset-2 hover:no-underline">
        Report a breakdown
      </button>
      {reportOpen && <ReportBreakdownDialog open onClose={() => setReportOpen(false)} source={{ id: s.id, name: s.name, code: s.code }} />}
    </div>
  );
}
