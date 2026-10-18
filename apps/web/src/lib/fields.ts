import { formatDate, formatNumber } from './format';
import type { DetailField, FieldDef, FieldValue, Reference, SourceType, SourceValues } from './types';

/** All field definitions for one source type: common fields plus its technical details. */
export function fieldCatalog(reference: Reference | undefined, type: SourceType) {
  const fields = reference?.fields ?? [];
  const details = reference?.sourceTypes.find((t) => t.code === type)?.detailFields ?? [];
  return {
    fields,
    details,
    field: new Map(fields.map((f) => [f.key, f])),
    detail: new Map(details.map((d) => [d.key, d])),
  };
}

export function detailAsField(d: DetailField): FieldDef {
  return { key: d.key, label: d.label, section: 'technical', kind: d.kind, unit: d.unit, min: 0 };
}

/** Human-readable value for display in reviews and history. */
export function formatFieldValue(def: FieldDef | undefined, value: FieldValue | undefined, reference?: Reference): string {
  if (value === null || value === undefined || value === '') return '—';
  if (!def) return String(value);
  switch (def.kind) {
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'date':
      return formatDate(String(value));
    case 'region':
      return reference?.regions.find((r) => r.id === Number(value))?.name ?? String(value);
    case 'select':
      return def.options?.find((o) => o.value === value)?.label ?? String(value);
    case 'number':
    case 'integer': {
      const n = typeof value === 'number' ? formatNumber(value, def.key === 'lat' || def.key === 'lng' ? 6 : 2) : String(value);
      return def.unit ? `${n} ${def.unit}` : n;
    }
    default:
      return String(value);
  }
}

export interface ChangeRow {
  key: string;
  label: string;
  section: string;
  before: string;
  after: string;
}

/** Rows describing a set of proposed values, optionally against previous values, in form order. */
export function changeRows(
  reference: Reference | undefined,
  type: SourceType,
  proposed: SourceValues,
  previous: SourceValues | null,
): ChangeRow[] {
  const cat = fieldCatalog(reference, type);
  const rows: ChangeRow[] = [];
  for (const def of cat.fields) {
    if (!(def.key in proposed.fields)) continue;
    rows.push({
      key: def.key,
      label: def.unit ? `${def.label} (${def.unit})` : def.label,
      section: def.section,
      before: formatFieldValue({ ...def, unit: undefined }, previous?.fields[def.key], reference),
      after: formatFieldValue({ ...def, unit: undefined }, proposed.fields[def.key], reference),
    });
  }
  for (const d of cat.details) {
    if (!(d.key in proposed.details)) continue;
    const def = detailAsField(d);
    rows.push({
      key: `details.${d.key}`,
      label: d.unit ? `${d.label} (${d.unit})` : d.label,
      section: 'technical',
      before: formatFieldValue({ ...def, unit: undefined }, previous?.details[d.key], reference),
      after: formatFieldValue({ ...def, unit: undefined }, proposed.details[d.key], reference),
    });
  }
  return rows;
}
