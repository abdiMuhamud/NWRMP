import type { SourceFilterQuery } from './sources.dto';

/** Joins every water-source query uses, so filters can reference region (r) and district (d). */
export const SOURCE_FROM = `
  FROM water_sources s
  JOIN regions r ON r.id = s.region_id
  LEFT JOIN districts d ON d.id = s.district_id`;

/** Builds a parameterised WHERE clause. Appends to `params` and returns the clause. */
export function sourceWhere(filters: SourceFilterQuery, params: unknown[]): string {
  const clauses: string[] = [];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.type) clauses.push(`s.type = ${bind(filters.type)}`);
  if (filters.region) clauses.push(`s.region_id = ${bind(filters.region)}`);
  if (filters.status) clauses.push(`s.status = ${bind(filters.status)}`);
  if (filters.verification) clauses.push(`s.verification = ${bind(filters.verification)}`);

  const q = filters.q?.trim();
  if (q) {
    const p = bind(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    clauses.push(`(s.name ILIKE ${p} OR s.code ILIKE ${p} OR s.settlement ILIKE ${p} OR d.name ILIKE ${p})`);
  }

  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}
