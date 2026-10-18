import type { Db } from '../database/db';
import { FIELD_BY_KEY, SOURCE_FIELDS, type FieldDef } from '../reference/source-fields';
import { SOURCE_TYPE_DEFS, type DetailField, type SourceType } from '../reference/source-types';

export type Value = string | number | boolean | null;

/** Proposed or stored values, split into common fields and type-specific details. */
export interface SourceValues {
  fields: Record<string, Value>;
  details: Record<string, Value>;
}

export type FieldErrors = Record<string, string>;

const MAX_TEXT = 500;
const MAX_TEXTAREA = 4000;

/**
 * Validates and normalises submitted values against the field definitions.
 * `partial` allows a subset (edits); otherwise required fields must be present (new sources).
 */
export function normalizeValues(
  type: SourceType,
  input: { fields?: Record<string, unknown>; details?: Record<string, unknown> },
  partial: boolean,
): { values: SourceValues; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const values: SourceValues = { fields: {}, details: {} };

  for (const [key, raw] of Object.entries(input.fields ?? {})) {
    const def = FIELD_BY_KEY.get(key);
    if (!def) {
      errors[key] = 'Unknown field';
      continue;
    }
    const { value, error } = normalizeOne(def, raw);
    if (error) errors[key] = error;
    else values.fields[key] = value;
  }

  const detailDefs = new Map(SOURCE_TYPE_DEFS[type].detailFields.map((d) => [d.key, d]));
  for (const [key, raw] of Object.entries(input.details ?? {})) {
    const def = detailDefs.get(key);
    if (!def) {
      errors[`details.${key}`] = 'Unknown field for this source type';
      continue;
    }
    const { value, error } = normalizeOne(detailAsField(def), raw);
    if (error) errors[`details.${key}`] = error;
    else values.details[key] = value;
  }

  if (!partial) {
    for (const def of SOURCE_FIELDS) {
      if (def.required && (values.fields[def.key] === undefined || values.fields[def.key] === null) && !errors[def.key]) {
        errors[def.key] = `${def.label} is required`;
      }
    }
  } else {
    for (const def of SOURCE_FIELDS) {
      if (def.required && hasOwn(values.fields, def.key) && values.fields[def.key] === null) errors[def.key] = `${def.label} cannot be empty`;
    }
  }
  if (('lat' in values.fields) !== ('lng' in values.fields)) {
    errors[('lat' in values.fields ? 'lng' : 'lat')] = 'Give both latitude and longitude';
  }

  return { values, errors };
}

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function detailAsField(d: DetailField): FieldDef {
  return { key: d.key, label: d.label, section: 'technical', kind: d.kind, unit: d.unit, min: 0 };
}

function normalizeOne(def: FieldDef, raw: unknown): { value: Value; error?: string } {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return { value: null };

  switch (def.kind) {
    case 'number':
    case 'integer':
    case 'region': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
      if (!Number.isFinite(n)) return { value: null, error: 'Enter a number' };
      if ((def.kind === 'integer' || def.kind === 'region') && !Number.isInteger(n)) return { value: null, error: 'Enter a whole number' };
      if (def.min !== undefined && n < def.min) return { value: null, error: `Must be at least ${def.min}` };
      if (def.max !== undefined && n > def.max) return { value: null, error: `Must be at most ${def.max}` };
      return { value: n };
    }
    case 'boolean':
      if (typeof raw === 'boolean') return { value: raw };
      if (raw === 'true' || raw === 'false') return { value: raw === 'true' };
      return { value: null, error: 'Choose yes or no' };
    case 'date': {
      const s = String(raw);
      const d = new Date(`${s}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
        return { value: null, error: 'Enter a valid date' };
      }
      if (s > new Date().toISOString().slice(0, 10)) return { value: null, error: 'Date cannot be in the future' };
      if (s < '1900-01-01') return { value: null, error: 'Date is too early' };
      return { value: s };
    }
    case 'select': {
      const s = String(raw);
      if (!def.options?.some((o) => o.value === s)) return { value: null, error: 'Choose one of the options' };
      return { value: s };
    }
    default: {
      const s = String(raw).trim();
      const max = def.kind === 'textarea' ? MAX_TEXTAREA : MAX_TEXT;
      if (s.length > max) return { value: null, error: `Keep this under ${max} characters` };
      return { value: s };
    }
  }
}

/** Current values of a stored source, in the same shape as a submission. */
export async function loadCurrentValues(
  db: Db,
  id: string,
): Promise<{ type: SourceType; regionId: number; updatedAt: string; values: SourceValues } | null> {
  const [row] = await db.query<{ row: Record<string, unknown>; lat: number; lng: number; district: string | null; updated: string }>(
    `SELECT to_jsonb(s) - 'location' AS row, s.updated_at::text AS updated,
            ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng, d.name AS district
       FROM water_sources s
       LEFT JOIN districts d ON d.id = s.district_id
      WHERE s.id = $1`,
    [id],
  );
  if (!row) return null;

  const fields: Record<string, Value> = {};
  for (const def of SOURCE_FIELDS) {
    if (def.key === 'lat') fields.lat = row.lat;
    else if (def.key === 'lng') fields.lng = row.lng;
    else if (def.key === 'district') fields.district = row.district;
    else fields[def.key] = (row.row[def.key] ?? null) as Value;
  }
  return {
    type: row.row.type as SourceType,
    regionId: row.row.region_id as number,
    // Text form, comparable with change_requests.base_updated_at::text
    updatedAt: row.updated,
    values: { fields, details: (row.row.details ?? {}) as Record<string, Value> },
  };
}

const same = (a: Value | undefined, b: Value | undefined) => {
  const x = a ?? null;
  const y = b ?? null;
  if (typeof x === 'number' && typeof y === 'number') return Math.abs(x - y) < 1e-9;
  return x === y;
};

/** Keeps only proposed values that differ from the current ones, and records what they were. */
export function diffValues(current: SourceValues, proposed: SourceValues): { proposed: SourceValues; previous: SourceValues } {
  const out = { proposed: { fields: {}, details: {} } as SourceValues, previous: { fields: {}, details: {} } as SourceValues };
  for (const [k, v] of Object.entries(proposed.fields)) {
    if (!same(current.fields[k], v)) {
      out.proposed.fields[k] = v;
      out.previous.fields[k] = current.fields[k] ?? null;
    }
  }
  // Moving a point always records both coordinates.
  if ('lat' in out.proposed.fields || 'lng' in out.proposed.fields) {
    for (const k of ['lat', 'lng']) {
      out.proposed.fields[k] = proposed.fields[k] ?? current.fields[k];
      out.previous.fields[k] = current.fields[k];
    }
  }
  for (const [k, v] of Object.entries(proposed.details)) {
    if (!same(current.details[k], v)) {
      out.proposed.details[k] = v;
      out.previous.details[k] = current.details[k] ?? null;
    }
  }
  return out;
}

export function isEmptyChange(v: SourceValues): boolean {
  return Object.keys(v.fields).length === 0 && Object.keys(v.details).length === 0;
}
