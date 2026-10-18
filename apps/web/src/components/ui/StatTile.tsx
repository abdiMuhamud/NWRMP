import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: LucideIcon;
  /** Ring colour behind the icon */
  tone?: 'brand' | 'water' | 'gold' | 'neutral';
}

const TONES = {
  brand: 'bg-brand-50 text-brand-700',
  water: 'bg-water-50 text-water-600',
  gold: 'bg-gold-100 text-gold-800',
  neutral: 'bg-page text-ink-2',
};

export function StatTile({ label, value, detail, icon: Icon, tone = 'neutral' }: StatTileProps) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] font-medium text-ink-2">{label}</div>
        {Icon && (
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${TONES[tone]}`}>
            <Icon size={17} strokeWidth={2} aria-hidden />
          </span>
        )}
      </div>
      <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-ink">{value}</div>
      {detail && <div className="mt-2 text-[13px] leading-snug text-ink-3">{detail}</div>}
    </div>
  );
}
