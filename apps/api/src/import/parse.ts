// Parsers for spreadsheet cell values. Each returns the cleaned value and, when the
// input could not be read cleanly, a message describing why.

export type Cell = string | number | boolean | Date | null;

export interface Parsed<T> {
  value: T | null;
  problem?: string;
}

const EMPTY = new Set(['', '-', '--', 'n/a', 'na', 'nil', 'none', 'null']);

export function isBlank(cell: Cell): boolean {
  return cell === null || (typeof cell === 'string' && cell.trim() === '');
}

export function parseText(cell: Cell): Parsed<string> {
  if (cell === null) return { value: null };
  if (cell instanceof Date) return { value: toIsoDate(cell) };
  const s = String(cell).trim().replace(/\s+/g, ' ');
  return { value: EMPTY.has(s.toLowerCase()) ? null : s };
}

/**
 * Reads numbers that may carry a unit, e.g. "17 m3/hr", "6.0 km", "26 C".
 * `units` lists accepted unit spellings (lower case, without spaces); anything else is reported.
 */
export function parseNumber(cell: Cell, units: string[] = []): Parsed<number> {
  if (cell === null) return { value: null };
  if (typeof cell === 'number') return Number.isFinite(cell) ? { value: cell } : { value: null, problem: 'Not a number' };
  if (typeof cell === 'boolean' || cell instanceof Date) return { value: null, problem: 'Not a number' };

  const s = cell.trim();
  if (EMPTY.has(s.toLowerCase())) return { value: null };
  const m = s.replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return { value: null, problem: 'Not a number' };

  const value = Number(m[1]);
  const unit = m[2].toLowerCase().replace(/\s+/g, '').replace(/\.$/, '');
  if (unit && !units.includes(unit)) {
    return { value, problem: `Unexpected unit "${m[2].trim()}"` };
  }
  return { value };
}

export function parseInteger(cell: Cell): Parsed<number> {
  const parsed = parseNumber(cell);
  if (parsed.value === null || parsed.problem) return parsed;
  if (!Number.isInteger(parsed.value) || parsed.value < 0) {
    return { value: Math.max(0, Math.round(parsed.value)), problem: 'Expected a whole number' };
  }
  return parsed;
}

export function parseBoolean(cell: Cell): Parsed<boolean> {
  if (cell === null) return { value: null };
  if (typeof cell === 'boolean') return { value: cell };
  const s = String(cell).trim().toLowerCase();
  if (s === '') return { value: null };
  if (['yes', 'y', 'true', '1', 'haa'].includes(s)) return { value: true };
  if (['no', 'n', 'false', '0', 'maya'].includes(s)) return { value: false };
  return { value: null, problem: 'Expected Yes or No' };
}

/** Dates in the Ministry sheets are written day/month/year. Returns YYYY-MM-DD. */
export function parseDate(cell: Cell): Parsed<string> {
  if (cell === null) return { value: null };
  if (cell instanceof Date) return checkDate(toIsoDate(cell));
  if (typeof cell === 'number') {
    // Excel serial date
    const ms = Date.UTC(1899, 11, 30) + Math.round(cell) * 86_400_000;
    return checkDate(new Date(ms).toISOString().slice(0, 10));
  }
  const s = String(cell).trim();
  if (EMPTY.has(s.toLowerCase())) return { value: null };

  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return checkDate(isoFromParts(Number(m[3]), Number(m[2]), Number(m[1])));
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return checkDate(isoFromParts(Number(m[1]), Number(m[2]), Number(m[3])));
  m = s.match(/^(\d{4})$/);
  if (m) return { value: `${m[1]}-01-01`, problem: 'Only the year is known; recorded as 1 January' };
  return { value: null, problem: 'Unrecognised date' };
}

function isoFromParts(y: number, mo: number, d: number): string | null {
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

function checkDate(iso: string | null): Parsed<string> {
  if (!iso) return { value: null, problem: 'Invalid date' };
  const today = new Date().toISOString().slice(0, 10);
  if (iso > today) return { value: null, problem: 'Date is in the future' };
  if (iso < '1950-01-01') return { value: iso, problem: 'Date is before 1950' };
  return { value: iso };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
