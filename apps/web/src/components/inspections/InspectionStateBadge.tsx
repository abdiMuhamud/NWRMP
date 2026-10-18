import { CircleCheck, Clock, PencilLine, RotateCcw } from 'lucide-react';
import type { InspectionState } from '../../lib/types';

const META: Record<InspectionState, { label: string; ink: string; wash: string; color: string; icon: typeof Clock }> = {
  draft: { label: 'Draft', ink: '#52514e', wash: '#efeeeb', color: '#898781', icon: PencilLine },
  submitted: { label: 'Waiting for review', ink: '#7a5200', wash: '#fff4dc', color: '#c98500', icon: Clock },
  approved: { label: 'Approved', ink: '#006300', wash: '#e6f5e6', color: '#0ca30c', icon: CircleCheck },
  returned: { label: 'Returned', ink: '#a32323', wash: '#fbeaea', color: '#d03b3b', icon: RotateCcw },
};

export function InspectionStateBadge({ state, size = 'md' }: { state: InspectionState; size?: 'sm' | 'md' }) {
  const m = META[state];
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
