// Judging laboratory results against the water-quality limits.

export type ParameterKind = 'health' | 'aesthetic' | 'info';
export type ResultFlag = 'ok' | 'low' | 'high';
export type TestOutcome = 'meets' | 'concern' | 'unsafe';

export const OUTCOME_LABELS: Record<TestOutcome, string> = {
  meets: 'Meets standards',
  concern: 'Taste or appearance concern',
  unsafe: 'Unsafe for drinking',
};

export interface Limit {
  min: number | null;
  max: number | null;
  kind: ParameterKind;
}

/** Below the minimum or above the maximum; parameters recorded for information are never flagged. */
export function flagFor(value: number, limit: Limit): ResultFlag {
  if (limit.kind === 'info') return 'ok';
  if (limit.min !== null && value < limit.min) return 'low';
  if (limit.max !== null && value > limit.max) return 'high';
  return 'ok';
}

/** Any health limit exceeded makes the water unsafe; otherwise any taste/appearance limit is a concern. */
export function outcomeFor(results: { kind: ParameterKind; flag: ResultFlag }[]): TestOutcome {
  const flagged = results.filter((r) => r.flag !== 'ok');
  if (flagged.some((r) => r.kind === 'health')) return 'unsafe';
  if (flagged.length) return 'concern';
  return 'meets';
}

/** "Fluoride 2.4 mg/L (limit 1.5)", for summaries and the audit log. */
export function describeExceedance(r: { label: string; unit: string; value: number; flag: ResultFlag; min: number | null; max: number | null }) {
  const unit = r.unit ? ` ${r.unit}` : '';
  const limit = r.flag === 'low' ? `minimum ${r.min}` : `limit ${r.max}`;
  return `${r.label} ${r.value}${unit} (${limit})`;
}
