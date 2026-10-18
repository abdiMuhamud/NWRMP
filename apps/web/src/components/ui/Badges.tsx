import { BadgeCheck, ShieldQuestion } from 'lucide-react';
import { SEVERITY_META, SHAPE_PATHS, STATUS_META, TYPE_META } from '../../lib/domain';
import type { FunctionalStatus, Severity, SourceType, Verification } from '../../lib/types';

/** Shape + colour marker matching the map symbol for a source type. */
export function TypeSwatch({ type, size = 14, color }: { type: SourceType; size?: number; color?: string }) {
  const meta = TYPE_META[type];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <path d={SHAPE_PATHS[meta.shape]} fill={color ?? meta.color} stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

export function TypeLabel({ type, className = '' }: { type: SourceType; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <TypeSwatch type={type} />
      {TYPE_META[type].label}
    </span>
  );
}

export function StatusBadge({ status, size = 'md' }: { status: FunctionalStatus; size?: 'sm' | 'md' }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-[13px]'
      }`}
      style={{ background: meta.wash, color: meta.ink }}
    >
      <Icon size={size === 'sm' ? 13 : 14} strokeWidth={2.25} style={{ color: meta.color }} aria-hidden />
      {meta.label}
    </span>
  );
}

export function VerificationBadge({ value }: { value: Verification }) {
  return value === 'verified' ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-good-ink">
      <BadgeCheck size={15} aria-hidden /> Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] text-ink-3">
      <ShieldQuestion size={15} aria-hidden /> Unverified
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const meta = SEVERITY_META[severity];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: meta.wash, color: meta.ink }}
    >
      <span className="size-1.5 rounded-full" style={{ background: meta.color }} aria-hidden />
      {meta.label}
    </span>
  );
}

export function SoonTag() {
  return (
    <span className="rounded-full bg-gold-400/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-gold-300">
      Soon
    </span>
  );
}
