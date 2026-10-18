const numberFmt = new Intl.NumberFormat('en-GB');
const compactFmt = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return digits ? value.toLocaleString('en-GB', { maximumFractionDigits: digits }) : numberFmt.format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value < 10_000 ? numberFmt.format(value) : compactFmt.format(value);
}

export function formatPercent(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

/** Formats a YYYY-MM-DD date (or ISO timestamp) as "17 Jul 2024". */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : dateFmt.format(date);
}

export function formatMeasure(value: number | null | undefined, unit?: string, digits = 1): string {
  if (value === null || value === undefined) return '—';
  const n = formatNumber(value, digits);
  return unit ? `${n} ${unit}` : n;
}

export function formatBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value ? 'Yes' : 'No';
}
