import { formatNumber } from './format';
import type { ParameterKind, ResultFlag, TestOutcome } from './types';

// Mirrors apps/api/src/water-quality/evaluate.ts so results are flagged while the lab types;
// the server decides the stored outcome.

export interface Limit {
  minValue: number | null;
  maxValue: number | null;
  kind: ParameterKind;
}

export function flagFor(value: number, limit: Limit): ResultFlag {
  if (limit.kind === 'info') return 'ok';
  if (limit.minValue !== null && value < limit.minValue) return 'low';
  if (limit.maxValue !== null && value > limit.maxValue) return 'high';
  return 'ok';
}

export function outcomeFor(results: { kind: ParameterKind; flag: ResultFlag }[]): TestOutcome {
  const flagged = results.filter((r) => r.flag !== 'ok');
  if (flagged.some((r) => r.kind === 'health')) return 'unsafe';
  return flagged.length ? 'concern' : 'meets';
}

/** "≤ 1.5 mg/L", "6.5–8.5", "Recorded only". */
export function limitText(limit: Limit, unit = ''): string {
  if (limit.kind === 'info' || (limit.minValue === null && limit.maxValue === null)) return 'Recorded only';
  const u = unit ? ` ${unit}` : '';
  if (limit.minValue !== null && limit.maxValue !== null) return `${num(limit.minValue)}–${num(limit.maxValue)}${u}`;
  return limit.maxValue !== null ? `≤ ${num(limit.maxValue)}${u}` : `≥ ${num(limit.minValue!)}${u}`;
}

export function num(v: number): string {
  // Lab values can be small (arsenic 0.01 mg/L): keep up to 3 decimals, drop trailing zeros.
  return Math.abs(v) < 1 && v !== 0 ? String(Number(v.toFixed(3))) : formatNumber(v, Number.isInteger(v) ? 0 : 2);
}

export const KIND_LABELS: Record<ParameterKind, string> = {
  health: 'Health',
  aesthetic: 'Taste or appearance',
  info: 'Recorded for information',
};
