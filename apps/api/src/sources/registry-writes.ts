import type { Db } from '../database/db';
import { NON_COLUMN_KEYS } from '../reference/source-fields';
import type { SourceType } from '../reference/source-types';
import { allocateCode } from './codes';
import type { SourceValues } from './source-values';

export async function upsertDistrict(tx: Db, regionId: number, name: string): Promise<number> {
  const [row] = await tx.query<{ id: number }>(
    `INSERT INTO districts (region_id, name) VALUES ($1, $2)
     ON CONFLICT (region_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [regionId, name],
  );
  return row.id;
}

/**
 * Turns normalised values into column assignments. Column names come only from the
 * field definitions (NON_COLUMN_KEYS excluded), never from user input.
 */
async function toColumns(tx: Db, values: SourceValues, regionId: number) {
  const cols: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values.fields)) {
    if (!NON_COLUMN_KEYS.has(key)) cols[key] = value;
  }
  if ('district' in values.fields) {
    const name = values.fields.district as string | null;
    cols.district_id = name ? await upsertDistrict(tx, regionId, name) : null;
  }
  return cols;
}

/** Creates an approved new source. Call inside a transaction. */
export async function insertSource(tx: Db, type: SourceType, values: SourceValues, userId: string, dataSource: string) {
  const regionId = values.fields.region_id as number;
  const [region] = await tx.query<{ code: string }>('SELECT code FROM regions WHERE id = $1', [regionId]);
  const code = await allocateCode(tx, type, region.code);

  const cols = await toColumns(tx, values, regionId);
  Object.assign(cols, { code, type, updated_by: userId, data_source: dataSource, verification: 'unverified' });
  const names = Object.keys(cols);
  const params = names.map((n) => cols[n]);
  params.push(JSON.stringify(values.details), values.fields.lng, values.fields.lat);
  const p = params.length;

  const [row] = await tx.query<{ id: string; code: string }>(
    `INSERT INTO water_sources (${names.join(', ')}, details, location)
     VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}, $${p - 2}::jsonb,
             ST_SetSRID(ST_MakePoint($${p - 1}, $${p}), 4326)::geography)
     RETURNING id, code`,
    params,
  );
  return row;
}

/** Applies approved edits (only the changed values) to an existing source. */
export async function updateSource(tx: Db, id: string, values: SourceValues, regionId: number, userId: string) {
  const cols = await toColumns(tx, values, regionId);
  // Moving a source to another region keeps its district name, re-filed under the new region.
  if ('region_id' in values.fields && !('district' in values.fields)) {
    const [current] = await tx.query<{ name: string | null }>(
      'SELECT d.name FROM water_sources s LEFT JOIN districts d ON d.id = s.district_id WHERE s.id = $1',
      [id],
    );
    if (current?.name) cols.district_id = await upsertDistrict(tx, regionId, current.name);
  }
  const sets: string[] = [];
  const params: unknown[] = [id];
  const bind = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  for (const [name, value] of Object.entries(cols)) sets.push(`${name} = ${bind(value)}`);
  if ('lat' in values.fields && 'lng' in values.fields) {
    sets.push(`location = ST_SetSRID(ST_MakePoint(${bind(values.fields.lng)}, ${bind(values.fields.lat)}), 4326)::geography`);
  }
  if (Object.keys(values.details).length) sets.push(`details = details || ${bind(JSON.stringify(values.details))}::jsonb`);
  sets.push(`updated_by = ${bind(userId)}`, 'updated_at = now()');

  await tx.query(`UPDATE water_sources SET ${sets.join(', ')} WHERE id = $1`, params);
}
