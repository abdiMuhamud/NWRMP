import type { Db } from '../database/db';
import { SOURCE_TYPE_DEFS, type SourceType } from '../reference/source-types';

/** National code prefix, e.g. "BH-MJ" for a borehole in Maroodi Jeex. */
export function codePrefix(type: SourceType, regionCode: string): string {
  return `${SOURCE_TYPE_DEFS[type].prefix}-${regionCode}`;
}

export function formatCode(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(5, '0')}`;
}

/** Next free code for a type and region. Call inside a transaction. */
export async function allocateCode(tx: Db, type: SourceType, regionCode: string): Promise<string> {
  const prefix = codePrefix(type, regionCode);
  if (tx.kind === 'postgres') await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [prefix]);
  const [row] = await tx.query<{ n: number | null }>(
    `SELECT max(split_part(code, '-', 3)::int) AS n FROM water_sources WHERE code LIKE $1`,
    [`${prefix}-%`],
  );
  return formatCode(prefix, (row?.n ?? 0) + 1);
}
