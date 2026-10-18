import ExcelJS from 'exceljs';
import type { Db } from '../database/db';
import {
  SOURCE_TYPE_DEFS,
  resolveSourceType,
  type FunctionalStatus,
  type SourceType,
} from '../reference/source-types';
import { codePrefix, formatCode } from '../sources/codes';
import { findInconsistencies } from '../sources/consistency';
import { FIELD_MAP, normalizeHeader, type Special, type Target } from './field-map';
import {
  isBlank,
  parseBoolean,
  parseDate,
  parseInteger,
  parseNumber,
  parseText,
  type Cell,
  type Parsed,
} from './parse';

type Severity = 'info' | 'warning' | 'error';

interface Issue {
  sheet: string;
  row: number | null;
  field: string | null;
  severity: Severity;
  message: string;
  original: string | null;
  sourceId?: string;
}

export interface ImportSummary {
  batch: string;
  sheets: { sheet: string; type: SourceType | null; rows: number; imported: number; skipped: number }[];
  imported: number;
  skipped: number;
  possibleDuplicates: number;
  issues: Record<Severity, number>;
}

export interface ImportOptions {
  batch?: string;
  /** Stored on each record so its origin stays traceable, e.g. "SWALIM legacy dataset" */
  dataSource?: string;
}

interface Column {
  index: number;
  header: string;
  key: string;
  target: Target | null;
}

interface RegionRow {
  id: number;
  code: string;
  name: string;
  aliases: string[];
}

// Rough extent of the area covered by the Ministry's national water-source map.
const EXTENT = { minLat: 7.5, maxLat: 11.8, minLng: 42.5, maxLng: 49.5 };
// Same-type sources closer than this are flagged as possible duplicates.
const DUPLICATE_RADIUS_M = 100;

const compact = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

export async function importWorkbook(db: Db, file: string | Buffer, options: ImportOptions = {}): Promise<ImportSummary> {
  const workbook = new ExcelJS.Workbook();
  if (typeof file === 'string') await workbook.xlsx.readFile(file);
  else await workbook.xlsx.load(file as unknown as ArrayBuffer);

  const batch = options.batch ?? `import-${new Date().toISOString()}`;
  const dataSource = options.dataSource ?? 'Spreadsheet import';

  return db.transaction(async (tx) => {
    const regions = await tx.query<RegionRow>('SELECT id, code, name, aliases FROM regions');
    const regionByName = new Map<string, RegionRow>();
    for (const r of regions) {
      regionByName.set(compact(r.name), r);
      for (const alias of r.aliases) regionByName.set(compact(alias), r);
    }

    const codeCounters = await loadCodeCounters(tx);
    const districtIds = new Map<string, number>();
    const getDistrictId = async (regionId: number, name: string): Promise<number> => {
      const key = `${regionId}|${name.toLowerCase()}`;
      const cached = districtIds.get(key);
      if (cached) return cached;
      const [row] = await tx.query<{ id: number }>(
        `INSERT INTO districts (region_id, name) VALUES ($1, $2)
         ON CONFLICT (region_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [regionId, name],
      );
      districtIds.set(key, row.id);
      return row.id;
    };

    const issues: Issue[] = [];
    const summary: ImportSummary = {
      batch,
      sheets: [],
      imported: 0,
      skipped: 0,
      possibleDuplicates: 0,
      issues: { info: 0, warning: 0, error: 0 },
    };
    const insertedIds: string[] = [];

    for (const ws of workbook.worksheets) {
      const sheet = ws.name;
      const sheetType = resolveSourceType(sheet);
      const sheetSummary = { sheet, type: sheetType, rows: 0, imported: 0, skipped: 0 };
      summary.sheets.push(sheetSummary);

      const columns = readHeader(ws, sheet, issues);
      if (columns.length === 0) continue;

      for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber++) {
        const row = ws.getRow(rowNumber);
        const cells = columns.map((c) => cellValue(row.getCell(c.index).value));
        if (cells.every(isBlank)) continue;
        sheetSummary.rows++;

        const rowIssues: Issue[] = [];
        const note = (severity: Severity, field: string | null, message: string, original?: Cell) =>
          rowIssues.push({
            sheet,
            row: rowNumber,
            field,
            severity,
            message,
            original: original === undefined || original === null ? null : String(original),
          });

        const record = readRow(columns, cells, note);

        // --- Source type
        const type = resolveSourceType(record.special.type as string | null) ?? sheetType;
        if (!type) {
          note('error', 'water_source_type', 'Unknown water source type; row skipped', record.special.type as string);
        }

        // --- Region and district
        const regionName = record.special.region as string | null;
        const region = regionName ? regionByName.get(compact(regionName)) : undefined;
        if (!region) {
          note('error', 'region', regionName ? 'Unknown region; row skipped' : 'Region missing; row skipped', regionName);
        } else if (regionName && compact(regionName) !== compact(region.name)) {
          note('info', 'region', `Region "${regionName}" recorded as "${region.name}"`, regionName);
        }

        // --- Coordinates
        let lat = record.special.lat as number | null;
        let lng = record.special.lng as number | null;
        if (lat === null || lng === null) {
          note('error', 'latitude/longitude', 'Coordinates missing; row skipped');
        } else {
          const inExtent = (la: number, ln: number) =>
            la >= EXTENT.minLat && la <= EXTENT.maxLat && ln >= EXTENT.minLng && ln <= EXTENT.maxLng;
          if (!inExtent(lat, lng) && inExtent(lng, lat)) {
            note('warning', 'latitude/longitude', 'Latitude and longitude appear swapped; corrected', `${lat}, ${lng}`);
            [lat, lng] = [lng, lat];
          } else if (!inExtent(lat, lng)) {
            note('warning', 'latitude/longitude', 'Location is outside the national map extent', `${lat}, ${lng}`);
          }
        }

        if (!type || !region || lat === null || lng === null) {
          sheetSummary.skipped++;
          summary.skipped++;
          issues.push(...rowIssues);
          continue;
        }

        // --- Status and permanence
        const status = deriveStatus(record.special, note);
        const permanence = derivePermanence(record.special, note);

        const values = record.columns;
        if (!values.name) {
          values.name = `Unnamed ${SOURCE_TYPE_DEFS[type].label.toLowerCase()}`;
          note('warning', 'source_name', 'Source name missing');
        }
        checkConsistency(values, note);

        const districtName = record.special.district as string | null;
        const code = nextCode(codeCounters, type, region.code);
        const legacyId = record.special.legacy_id;

        const insert: Record<string, unknown> = {
          ...values,
          code,
          type,
          region_id: region.id,
          district_id: districtName ? await getDistrictId(region.id, districtName) : null,
          status: status.status,
          status_reason: status.reason,
          permanence,
          details: JSON.stringify(record.details),
          data_source: dataSource,
          legacy_ref: legacyId === null || legacyId === undefined ? `${sheet}, row ${rowNumber}` : `${sheet} #${legacyId}`,
        };
        const sourceId = await insertSource(tx, insert, lng, lat);
        insertedIds.push(sourceId);

        const inspectionDate = record.special.inspection_date as string | null;
        if (inspectionDate) {
          await tx.query(
            `INSERT INTO inspections (source_id, inspected_on, agency, status, notes) VALUES ($1, $2, $3, $4, $5)`,
            [sourceId, inspectionDate, record.special.inspection_agency, status.status, 'Imported from spreadsheet'],
          );
        }
        const interventionDescription = record.special.intervention_description as string | null;
        const interventionDate = record.special.intervention_date as string | null;
        if (interventionDescription || interventionDate) {
          await tx.query(
            `INSERT INTO interventions (source_id, performed_on, agency, description) VALUES ($1, $2, $3, $4)`,
            [sourceId, interventionDate, record.special.intervention_agency, interventionDescription],
          );
        }

        for (const issue of rowIssues) issue.sourceId = sourceId;
        issues.push(...rowIssues);
        sheetSummary.imported++;
        summary.imported++;
      }
    }

    summary.possibleDuplicates = await flagPossibleDuplicates(tx, insertedIds, issues);

    for (const issue of issues) summary.issues[issue.severity]++;
    await insertIssues(tx, batch, issues);
    return summary;
  });
}

function readHeader(ws: ExcelJS.Worksheet, sheet: string, issues: Issue[]): Column[] {
  const header = ws.getRow(1);
  const columns: Column[] = [];
  const seen = new Set<string>();
  for (let index = 1; index <= ws.columnCount; index++) {
    const raw = parseText(cellValue(header.getCell(index).value)).value;
    if (!raw) continue;
    const key = normalizeHeader(raw);
    const target = FIELD_MAP[key] ?? null;
    const headerIssue = (severity: Severity, message: string) =>
      issues.push({ sheet, row: 1, field: raw, severity, message, original: raw });

    if (seen.has(key)) headerIssue('warning', `Column "${raw}" appears more than once`);
    seen.add(key);
    if (!target) headerIssue('info', `Column "${raw}" is not in the standard template; kept as an extra detail`);
    else if (target.note) headerIssue('info', target.note);
    columns.push({ index, header: raw, key, target });
  }
  return columns;
}

interface RowRecord {
  columns: Record<string, unknown>;
  details: Record<string, unknown>;
  special: Partial<Record<Special, unknown>>;
}

type Note = (severity: Severity, field: string | null, message: string, original?: Cell) => void;

const SPECIAL_PARSERS: Partial<Record<Special, (cell: Cell) => Parsed<unknown>>> = {
  lat: (c) => parseNumber(c),
  lng: (c) => parseNumber(c),
  legacy_id: (c) => parseText(c),
  functioning: parseBoolean,
  abandoned: parseBoolean,
  permanent: parseBoolean,
  seasonal: parseBoolean,
  inspection_date: parseDate,
  intervention_date: parseDate,
};

function readRow(columns: Column[], cells: Cell[], note: Note): RowRecord {
  const record: RowRecord = { columns: {}, details: {}, special: {} };

  columns.forEach((column, i) => {
    const cell = cells[i];
    const target = column.target;
    let bucket: Record<string, unknown>;
    let field: string;
    let parsed: Parsed<unknown>;

    if (!target) {
      bucket = record.details;
      field = column.key;
      parsed = parseText(cell);
    } else if ('special' in target) {
      bucket = record.special;
      field = target.special;
      parsed = (SPECIAL_PARSERS[target.special] ?? parseText)(cell);
    } else {
      bucket = 'column' in target ? record.columns : record.details;
      field = 'column' in target ? target.column : target.detail;
      parsed = parseByKind(target.kind, cell, target.units);
    }

    if (parsed.problem) note('warning', column.header, parsed.problem, cell);

    const existing = bucket[field];
    if (existing === undefined || existing === null) {
      bucket[field] = parsed.value;
    } else if (parsed.value !== null && parsed.value !== existing) {
      note('warning', column.header, `Duplicate column has a different value (kept "${existing}")`, cell);
    }
  });

  return record;
}

function parseByKind(kind: string, cell: Cell, units?: string[]): Parsed<unknown> {
  switch (kind) {
    case 'number':
      return parseNumber(cell, units);
    case 'integer':
      return parseInteger(cell);
    case 'boolean':
      return parseBoolean(cell);
    case 'date':
      return parseDate(cell);
    default:
      return parseText(cell);
  }
}

function deriveStatus(special: RowRecord['special'], note: Note): { status: FunctionalStatus; reason: string | null } {
  const functioning = special.functioning as boolean | null | undefined;
  const abandoned = special.abandoned as boolean | null | undefined;
  const nonFunctioningReason = (special.non_functioning_reason as string | null | undefined) ?? null;
  const abandonedReason = (special.abandoned_reason as string | null | undefined) ?? null;

  if (abandoned === true) {
    if (functioning === true) note('warning', 'functioning', 'Marked both functioning and abandoned; recorded as abandoned');
    return { status: 'abandoned', reason: abandonedReason ?? nonFunctioningReason };
  }
  if (functioning === true) {
    if (nonFunctioningReason) {
      note('warning', 'reason_for_non_functioning', 'Marked functioning but a reason for non-functioning is given', nonFunctioningReason);
    }
    return { status: 'functioning', reason: null };
  }
  if (functioning === false) {
    if (!nonFunctioningReason) note('info', 'reason_for_non_functioning', 'No reason given for non-functioning');
    return { status: 'non_functioning', reason: nonFunctioningReason };
  }
  note('warning', 'functioning', 'Functioning status not recorded');
  return { status: 'unknown', reason: null };
}

function derivePermanence(special: RowRecord['special'], note: Note): 'permanent' | 'seasonal' | null {
  const permanent = special.permanent as boolean | null | undefined;
  const seasonal = special.seasonal as boolean | null | undefined;
  if (permanent === true && seasonal === true) {
    note('warning', 'permanent/seasonal', 'Marked both permanent and seasonal');
    return null;
  }
  if (permanent === true || seasonal === false) return 'permanent';
  if (seasonal === true || permanent === false) return 'seasonal';
  return null;
}

function checkConsistency(v: Record<string, unknown>, note: Note) {
  for (const issue of findInconsistencies(v)) {
    const value = v[issue.field];
    note('warning', issue.field, issue.message, value === null || value === undefined ? null : String(value));
  }
  const ph = typeof v.ph === 'number' ? v.ph : null;
  if (ph !== null && (ph < 0 || ph > 14)) {
    note('warning', 'ph', 'pH must be between 0 and 14; value removed', ph);
    v.ph = null;
  }
}

async function loadCodeCounters(db: Db): Promise<Map<string, number>> {
  const rows = await db.query<{ code: string }>('SELECT code FROM water_sources');
  const counters = new Map<string, number>();
  for (const { code } of rows) {
    const m = code.match(/^([A-Z]+-[A-Z]+)-(\d+)$/);
    if (m) counters.set(m[1], Math.max(counters.get(m[1]) ?? 0, Number(m[2])));
  }
  return counters;
}

function nextCode(counters: Map<string, number>, type: SourceType, regionCode: string): string {
  const prefix = codePrefix(type, regionCode);
  const n = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, n);
  return formatCode(prefix, n);
}

async function insertSource(db: Db, values: Record<string, unknown>, lng: number, lat: number): Promise<string> {
  const columns = Object.keys(values);
  const params = columns.map((c) => values[c]);
  // Column names come from FIELD_MAP constants, never from spreadsheet headers.
  const placeholders = columns.map((c, i) => (c === 'details' ? `$${i + 1}::jsonb` : `$${i + 1}`));
  params.push(lng, lat);
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO water_sources (${columns.join(', ')}, location)
     VALUES (${placeholders.join(', ')}, ST_SetSRID(ST_MakePoint($${params.length - 1}, $${params.length}), 4326)::geography)
     RETURNING id`,
    params,
  );
  return row.id;
}

async function flagPossibleDuplicates(db: Db, ids: string[], issues: Issue[]): Promise<number> {
  if (ids.length === 0) return 0;
  const pairs = await db.query<{ aId: string; bCode: string; meters: number }>(
    `SELECT a.id AS "aId", b.code AS "bCode", round(ST_Distance(a.location, b.location))::int AS meters
       FROM water_sources a
       JOIN water_sources b
         ON a.type = b.type AND a.id <> b.id AND ST_DWithin(a.location, b.location, $2)
      WHERE a.id = ANY($1::uuid[])
        AND (b.id <> ALL($1::uuid[]) OR a.code < b.code)`,
    [`{${ids.join(',')}}`, DUPLICATE_RADIUS_M],
  );
  for (const p of pairs) {
    issues.push({
      sheet: '',
      row: null,
      field: 'location',
      severity: 'warning',
      message: `Possible duplicate of ${p.bCode} (same type, ${p.meters} m away)`,
      original: null,
      sourceId: p.aId,
    });
  }
  return pairs.length;
}

async function insertIssues(db: Db, batch: string, issues: Issue[]) {
  const CHUNK = 200;
  for (let i = 0; i < issues.length; i += CHUNK) {
    const chunk = issues.slice(i, i + CHUNK);
    const params: unknown[] = [];
    const rows = chunk.map((issue) => {
      params.push(batch, issue.sheet || null, issue.row, issue.sourceId ?? null, issue.field, issue.severity, issue.message, issue.original);
      const base = params.length - 8;
      return `(${Array.from({ length: 8 }, (_, k) => `$${base + k + 1}`).join(', ')})`;
    });
    await db.query(
      `INSERT INTO import_issues (batch, sheet, row_number, source_id, field, severity, message, original_value)
       VALUES ${rows.join(', ')}`,
      params,
    );
  }
}

function cellValue(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((t) => t.text).join('');
    if ('result' in value) return cellValue((value.result ?? null) as ExcelJS.CellValue);
    if ('text' in value) return String(value.text);
    return null;
  }
  return value as Cell;
}
