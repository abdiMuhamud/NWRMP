import { CircleCheck, CircleSlash, CircleX, Clock } from 'lucide-react';
import type { ChangeStatus } from '../../lib/types';

const META: Record<ChangeStatus, { label: string; ink: string; wash: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Waiting for review', ink: '#7a5200', wash: '#fff4dc', color: '#c98500', icon: Clock },
  approved: { label: 'Approved', ink: '#006300', wash: '#e6f5e6', color: '#0ca30c', icon: CircleCheck },
  rejected: { label: 'Rejected', ink: '#a32323', wash: '#fbeaea', color: '#d03b3b', icon: CircleX },
  withdrawn: { label: 'Withdrawn', ink: '#52514e', wash: '#efeeeb', color: '#898781', icon: CircleSlash },
};

export function ChangeStatusBadge({ status, size = 'md' }: { status: ChangeStatus; size?: 'sm' | 'md' }) {
  const m = META[status];
  const Icon = m.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-[13px]'}`}
      style={{ background: m.wash, color: m.ink }}
    >
      <Icon size={size === 'sm' ? 13 : 14} strokeWidth={2.25} style={{ color: m.color }} aria-hidden />
      {m.label}
    </span>
  );
}

export function KindBadge({ kind }: { kind: 'create' | 'update' }) {
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        kind === 'create' ? 'bg-brand-50 text-brand-700' : 'bg-water-50 text-water-700'
      }`}
    >
      {kind === 'create' ? 'New source' : 'Changes'}
    </span>
  );
}
