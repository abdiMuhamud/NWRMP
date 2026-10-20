import type { ReactNode } from 'react';
import { OUTCOME_META, PRIORITY_META, WORK_ORDER_STATUS_META } from '../../lib/domain';
import type { TestOutcome, WorkOrderPriority, WorkOrderStatus } from '../../lib/types';

type Size = 'sm' | 'md';

function Pill({ size, wash, ink, children }: { size: Size; wash: string; ink: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-[13px]'}`}
      style={{ background: wash, color: ink }}
    >
      {children}
    </span>
  );
}

/** Laboratory test outcome; "untested" when a source has no result yet. */
export function OutcomeBadge({ outcome, size = 'md', short }: { outcome: TestOutcome | 'untested' | null; size?: Size; short?: boolean }) {
  const m = OUTCOME_META[outcome ?? 'untested'];
  const Icon = m.icon;
  return (
    <Pill size={size} wash={m.wash} ink={m.ink}>
      <Icon size={size === 'sm' ? 13 : 14} strokeWidth={2.25} style={{ color: m.color }} aria-hidden />
      {short ? m.short : m.label}
    </Pill>
  );
}

export function WorkOrderStatusBadge({ status, size = 'md' }: { status: WorkOrderStatus; size?: Size }) {
  const m = WORK_ORDER_STATUS_META[status];
  const Icon = m.icon;
  return (
    <Pill size={size} wash={m.wash} ink={m.ink}>
      <Icon size={size === 'sm' ? 13 : 14} strokeWidth={2.25} style={{ color: m.color }} aria-hidden />
      {m.label}
    </Pill>
  );
}

export function PriorityTag({ priority }: { priority: WorkOrderPriority }) {
  const m = PRIORITY_META[priority];
  return (
    <span className="inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ background: m.wash, color: m.ink }}>
      {m.label}
    </span>
  );
}
