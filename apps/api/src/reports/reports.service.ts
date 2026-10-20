import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { can, regionScope, type AuthUser } from '../auth/roles';
import { DB, type Db } from '../database/db';
import { categoryLabel, WORK_ORDER_CATEGORIES } from '../maintenance/work-order-options';
import { SOURCE_FIELDS } from '../reference/source-fields';
import { SOURCE_TYPE_DEFS, SOURCE_TYPES, type SourceType } from '../reference/source-types';
import type { SourceFilterQuery } from '../sources/sources.dto';
import { SOURCE_FROM, sourceWhere } from '../sources/source-filters';
import { OUTCOME_LABELS, type TestOutcome } from '../water-quality/evaluate';
import { buildWorkbook, type SheetColumn, type SheetSpec } from './xlsx';

export const DATASETS = ['summary', 'sources', 'inspections', 'lab-results', 'work-orders', 'audit'] as const;
export type Dataset = (typeof DATASETS)[number];

const STATUS_LABELS: Record<string, string> = {
  functioning: 'Functioning',
  non_functioning: 'Not functioning',
  abandoned: 'Abandoned',
  unknown: 'Status unknown',
};
const WORK_ORDER_STATUS_LABELS: Record<string, string> = {
  open: 'Waiting for a technician',
  assigned: 'Assigned',
  in_progress: 'Repair in progress',
  completed: 'Waiting for closure',
  closed: 'Closed',
  cancelled: 'Cancelled',
};
const typeLabel = (t: string) => SOURCE_TYPE_DEFS[t as SourceType]?.label ?? t;
const outcomeLabel = (o: string | null) => (o ? OUTCOME_LABELS[o as TestOutcome] : null);

// Latest completed laboratory test of each source.
const LATEST_TEST = `
  SELECT DISTINCT ON (t.source_id) t.id, t.source_id, t.outcome, t.sampled_on
    FROM wq_tests t
   WHERE t.state = 'completed'
   ORDER BY t.source_id, t.sampled_on DESC, t.recorded_at DESC`;

// Common fields shown first in the registry export; the rest of SOURCE_FIELDS follow.
const LEADING_FIELDS = new Set(['name', 'region_id', 'district', 'settlement', 'lat', 'lng', 'status', 'status_reason']);

/** The national (or regional) summary report and the Excel exports. */
@Injectable()
export class ReportsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Region the user may report on: their own for regional roles, otherwise the one asked for (or all). */
  scope(user: AuthUser, region?: number) {
    return regionScope(user) ?? region ?? null;
  }

  async summary(region: number | null) {
    const params = region ? [region] : [];
    const sourceRegion = region ? 'AND s.region_id = $1' : '';

    const [[totals], [regionRow], byRegion, byType, [lab], exceedances, maintenanceByCategory, [maintenance], [inspections]] = await Promise.all([
      this.db.query<Record<string, number>>(
        `SELECT count(*)::int AS sources,
                count(*) FILTER (WHERE s.status = 'functioning')::int AS functioning,
                count(*) FILTER (WHERE s.status = 'non_functioning')::int AS "nonFunctioning",
                count(*) FILTER (WHERE s.status = 'abandoned')::int AS abandoned,
                count(*) FILTER (WHERE s.status = 'unknown')::int AS unknown,
                count(*) FILTER (WHERE s.verification = 'verified')::int AS verified,
                count(*) FILTER (WHERE s.data_source ILIKE 'sample%')::int AS "sampleRecords",
                coalesce(sum(s.people_served), 0)::float8 AS "peopleServed",
                coalesce(sum(s.idps_served), 0)::float8 AS "idpsServed",
                coalesce(sum(coalesce(s.camels, 0) + coalesce(s.cattle, 0) + coalesce(s.shoats, 0)), 0)::float8 AS livestock
           FROM water_sources s WHERE true ${sourceRegion}`,
        params,
      ),
      region ? this.db.query<{ name: string }>('SELECT name FROM regions WHERE id = $1', [region]) : Promise.resolve([{ name: null }]),
      this.db.query(
        `WITH latest AS (${LATEST_TEST}),
              open_orders AS (SELECT source_id, count(*) AS n FROM work_orders WHERE status NOT IN ('closed', 'cancelled') GROUP BY source_id)
         SELECT r.id, r.code, r.name,
                count(s.id)::int AS total,
                count(s.id) FILTER (WHERE s.status = 'functioning')::int AS functioning,
                count(s.id) FILTER (WHERE s.status = 'non_functioning')::int AS "nonFunctioning",
                count(s.id) FILTER (WHERE s.status = 'abandoned')::int AS abandoned,
                count(s.id) FILTER (WHERE s.status = 'unknown')::int AS unknown,
                coalesce(sum(s.people_served), 0)::float8 AS "peopleServed",
                count(l.source_id)::int AS tested,
                count(l.source_id) FILTER (WHERE l.outcome = 'unsafe')::int AS unsafe,
                coalesce(sum(o.n), 0)::int AS "openWorkOrders"
           FROM regions r
           LEFT JOIN water_sources s ON s.region_id = r.id
           LEFT JOIN latest l ON l.source_id = s.id
           LEFT JOIN open_orders o ON o.source_id = s.id
          ${region ? 'WHERE r.id = $1' : ''}
          GROUP BY r.id, r.code, r.name
          ORDER BY total DESC, r.name`,
        params,
      ),
      this.db.query<{ type: string } & Record<string, number>>(
        `SELECT s.type, count(*)::int AS total,
                count(*) FILTER (WHERE s.status = 'functioning')::int AS functioning,
                count(*) FILTER (WHERE s.status = 'non_functioning')::int AS "nonFunctioning",
                count(*) FILTER (WHERE s.status = 'abandoned')::int AS abandoned,
                count(*) FILTER (WHERE s.status = 'unknown')::int AS unknown,
                coalesce(sum(s.people_served), 0)::float8 AS "peopleServed"
           FROM water_sources s WHERE true ${sourceRegion}
          GROUP BY s.type`,
        params,
      ),
      this.db.query<{ tested: number; meets: number; concern: number; unsafe: number }>(
        `SELECT count(*)::int AS tested,
                count(*) FILTER (WHERE l.outcome = 'meets')::int AS meets,
                count(*) FILTER (WHERE l.outcome = 'concern')::int AS concern,
                count(*) FILTER (WHERE l.outcome = 'unsafe')::int AS unsafe
           FROM (${LATEST_TEST}) l JOIN water_sources s ON s.id = l.source_id
          WHERE true ${sourceRegion}`,
        params,
      ),
      this.db.query(
        `SELECT p.label, p.unit, x.kind, count(*)::int AS sources
           FROM (${LATEST_TEST}) l
           JOIN water_sources s ON s.id = l.source_id
           JOIN wq_results x ON x.test_id = l.id
           JOIN wq_parameters p ON p.code = x.parameter
          WHERE x.flag <> 'ok' ${sourceRegion}
          GROUP BY p.label, p.unit, x.kind, p.sort_order
          ORDER BY sources DESC, p.sort_order`,
        params,
      ),
      this.db.query<{ category: string } & Record<string, number | null>>(
        `SELECT w.category,
                count(*) FILTER (WHERE w.status NOT IN ('closed', 'cancelled'))::int AS open,
                count(*) FILTER (WHERE w.status = 'closed' AND w.closed_at > now() - interval '12 months')::int AS "closed12m",
                (avg(extract(epoch FROM (w.closed_at - w.reported_at)) / 86400)
                   FILTER (WHERE w.status = 'closed' AND w.closed_at > now() - interval '12 months'))::float8 AS "avgRepairDays",
                coalesce(sum(w.cost_usd) FILTER (WHERE w.status = 'closed' AND w.closed_at > now() - interval '12 months'), 0)::float8 AS "cost12m"
           FROM work_orders w JOIN water_sources s ON s.id = w.source_id
          WHERE true ${sourceRegion}
          GROUP BY w.category`,
        params,
      ),
      this.db.query<{ open: number; urgent: number; closed12m: number; avgRepairDays: number | null; cost12m: number; brokenWithoutOrder: number }>(
        `SELECT count(*) FILTER (WHERE w.status NOT IN ('closed', 'cancelled'))::int AS open,
                count(*) FILTER (WHERE w.status NOT IN ('closed', 'cancelled') AND w.priority = 'urgent')::int AS urgent,
                count(*) FILTER (WHERE w.status = 'closed' AND w.closed_at > now() - interval '12 months')::int AS "closed12m",
                (avg(extract(epoch FROM (w.closed_at - w.reported_at)) / 86400)
                   FILTER (WHERE w.status = 'closed' AND w.closed_at > now() - interval '12 months'))::float8 AS "avgRepairDays",
                coalesce(sum(w.cost_usd) FILTER (WHERE w.status = 'closed' AND w.closed_at > now() - interval '12 months'), 0)::float8 AS "cost12m",
                (SELECT count(*) FROM water_sources s
                  WHERE s.status = 'non_functioning' ${sourceRegion}
                    AND NOT EXISTS (SELECT 1 FROM work_orders o WHERE o.source_id = s.id AND o.status NOT IN ('closed', 'cancelled')))::int AS "brokenWithoutOrder"
           FROM work_orders w JOIN water_sources s ON s.id = w.source_id
          WHERE true ${sourceRegion}`,
        params,
      ),
      this.db.query<Record<string, number>>(
        `SELECT count(*) FILTER (WHERE i.inspector_id IS NOT NULL AND i.state = 'approved' AND i.inspected_on > current_date - 365)::int AS "fieldInspections12m",
                count(DISTINCT i.source_id) FILTER (WHERE i.state = 'approved' AND i.inspected_on > current_date - 365)::int AS "sourcesVisited12m"
           FROM inspections i JOIN water_sources s ON s.id = i.source_id
          WHERE true ${sourceRegion}`,
        params,
      ),
    ]);

    const types = new Map(byType.map((t) => [t.type, t]));
    const categories = new Map(maintenanceByCategory.map((c) => [c.category, c]));
    return {
      generatedAt: new Date().toISOString(),
      region: region ? { id: region, name: regionRow?.name ?? null } : null,
      totals,
      byRegion,
      byType: SOURCE_TYPES.map((type) => ({
        type,
        label: SOURCE_TYPE_DEFS[type].label,
        total: types.get(type)?.total ?? 0,
        functioning: types.get(type)?.functioning ?? 0,
        nonFunctioning: types.get(type)?.nonFunctioning ?? 0,
        abandoned: types.get(type)?.abandoned ?? 0,
        unknown: types.get(type)?.unknown ?? 0,
        peopleServed: types.get(type)?.peopleServed ?? 0,
      })),
      waterQuality: { ...lab, exceedances },
      maintenance: {
        ...maintenance,
        byCategory: WORK_ORDER_CATEGORIES.map((c) => ({
          category: c.code,
          label: c.label,
          open: categories.get(c.code)?.open ?? 0,
          closed12m: categories.get(c.code)?.closed12m ?? 0,
          avgRepairDays: categories.get(c.code)?.avgRepairDays ?? null,
          cost12m: categories.get(c.code)?.cost12m ?? 0,
        })),
      },
      inspections,
    };
  }

  // ---------------------------------------------------------------- Excel exports

  async export(user: AuthUser, dataset: Dataset, filters: SourceFilterQuery): Promise<{ buffer: Buffer; filename: string }> {
    const region = this.scope(user, filters.region);
    const regionName = region ? (await this.db.query<{ name: string }>('SELECT name FROM regions WHERE id = $1', [region]))[0]?.name : null;
    const stamp = new Date();
    const heading = (title: string) => [
      `NWRMP · ${title}`,
      `${regionName ?? 'All regions'} · generated ${stamp.toISOString().slice(0, 16).replace('T', ' ')} UTC by ${user.fullName}`,
    ];

    let sheets: SheetSpec[];
    switch (dataset) {
      case 'summary':
        sheets = await this.summarySheets(region, heading);
        break;
      case 'sources':
        sheets = [await this.sourcesSheet({ ...filters, region: region ?? undefined }, heading('Water sources'))];
        break;
      case 'inspections':
        sheets = [await this.inspectionsSheet(region, heading('Inspections'))];
        break;
      case 'lab-results':
        sheets = [await this.labSheet(region, heading('Water quality results'))];
        break;
      case 'work-orders':
        sheets = [await this.workOrdersSheet(region, heading('Maintenance work orders'))];
        break;
      case 'audit':
        if (!can(user, 'audit.view')) throw new ForbiddenException('Only administrators can export the audit log');
        sheets = [await this.auditSheet(heading('Audit log'))];
        break;
      default:
        throw new NotFoundException('Unknown export');
    }
    const buffer = await buildWorkbook(sheets, `NWRMP ${dataset}`);
    const slug = regionName ? `-${regionName.toLowerCase().replace(/[^a-z]+/g, '-')}` : '';
    return { buffer, filename: `nwrmp-${dataset}${slug}-${stamp.toISOString().slice(0, 10)}.xlsx` };
  }

  private async summarySheets(region: number | null, heading: (t: string) => string[]): Promise<SheetSpec[]> {
    const s = await this.summary(region);
    const t = s.totals;
    const pct = (part: number, whole: number) => (whole ? part / whole : null);
    return [
      {
        name: 'Summary',
        heading: heading('Summary report'),
        columns: [
          { header: 'Indicator', key: 'label', width: 46 },
          { header: 'Value', key: 'value', kind: 'number', width: 16 },
        ],
        rows: [
          { label: 'Registered water sources', value: t.sources },
          { label: 'Functioning', value: t.functioning },
          { label: 'Not functioning', value: t.nonFunctioning },
          { label: 'Abandoned', value: t.abandoned },
          { label: 'Status unknown', value: t.unknown },
          { label: 'Functioning rate (%)', value: t.sources ? Math.round((t.functioning / t.sources) * 1000) / 10 : null },
          { label: 'Verified in the field', value: t.verified },
          { label: 'People using sources (as reported)', value: t.peopleServed },
          { label: 'Of which IDPs', value: t.idpsServed },
          { label: 'Livestock watered (as reported)', value: t.livestock },
          { label: 'Field inspections in the last 12 months', value: s.inspections.fieldInspections12m },
          { label: 'Sources with a laboratory test', value: s.waterQuality.tested },
          { label: 'Unsafe for drinking at the latest test', value: s.waterQuality.unsafe },
          { label: 'Taste or appearance concern at the latest test', value: s.waterQuality.concern },
          { label: 'Open work orders', value: s.maintenance.open },
          { label: 'Of which urgent', value: s.maintenance.urgent },
          { label: 'Broken sources with no repair requested', value: s.maintenance.brokenWithoutOrder },
          { label: 'Repairs closed in the last 12 months', value: s.maintenance.closed12m },
          { label: 'Average days from report to closure', value: s.maintenance.avgRepairDays === null ? null : Math.round(s.maintenance.avgRepairDays * 10) / 10 },
          { label: 'Repair costs in the last 12 months (US$)', value: s.maintenance.cost12m },
          ...(t.sampleRecords ? [{ label: 'Sample (example) records included', value: t.sampleRecords }] : []),
        ],
      },
      {
        name: 'By region',
        heading: heading('Sources by region'),
        columns: [
          { header: 'Region', key: 'name' },
          { header: 'Sources', key: 'total', kind: 'integer' },
          { header: 'Functioning', key: 'functioning', kind: 'integer' },
          { header: 'Not functioning', key: 'nonFunctioning', kind: 'integer' },
          { header: 'Abandoned', key: 'abandoned', kind: 'integer' },
          { header: 'Status unknown', key: 'unknown', kind: 'integer' },
          { header: 'Functioning rate', key: 'rate', kind: 'percent' },
          { header: 'People served', key: 'peopleServed', kind: 'integer' },
          { header: 'Lab tested', key: 'tested', kind: 'integer' },
          { header: 'Unsafe', key: 'unsafe', kind: 'integer' },
          { header: 'Open work orders', key: 'openWorkOrders', kind: 'integer' },
        ],
        rows: s.byRegion.map((r) => ({ ...r, rate: pct(r.functioning as number, r.total as number) })),
      },
      {
        name: 'By type',
        heading: heading('Sources by type'),
        columns: [
          { header: 'Type', key: 'label' },
          { header: 'Sources', key: 'total', kind: 'integer' },
          { header: 'Functioning', key: 'functioning', kind: 'integer' },
          { header: 'Not functioning', key: 'nonFunctioning', kind: 'integer' },
          { header: 'Abandoned', key: 'abandoned', kind: 'integer' },
          { header: 'Status unknown', key: 'unknown', kind: 'integer' },
          { header: 'Functioning rate', key: 'rate', kind: 'percent' },
          { header: 'People served', key: 'peopleServed', kind: 'integer' },
        ],
        rows: s.byType.map((r) => ({ ...r, rate: pct(r.functioning, r.total) })),
      },
      {
        name: 'Water quality',
        heading: heading('Parameters outside the limit at the latest test'),
        columns: [
          { header: 'Parameter', key: 'label' },
          { header: 'Unit', key: 'unit' },
          { header: 'Limit type', key: 'kindLabel' },
          { header: 'Sources', key: 'sources', kind: 'integer' },
        ],
        rows: (s.waterQuality.exceedances as { kind: string }[]).map((e) => ({ ...e, kindLabel: e.kind === 'health' ? 'Health' : 'Taste or appearance' })),
      },
      {
        name: 'Maintenance',
        heading: heading('Work orders by type of problem'),
        columns: [
          { header: 'Type of problem', key: 'label' },
          { header: 'Open', key: 'open', kind: 'integer' },
          { header: 'Closed in 12 months', key: 'closed12m', kind: 'integer' },
          { header: 'Average days to repair', key: 'avgRepairDays', kind: 'number' },
          { header: 'Cost in 12 months (US$)', key: 'cost12m', kind: 'number' },
        ],
        rows: s.maintenance.byCategory,
      },
    ];
  }

  private async sourcesSheet(filters: SourceFilterQuery, heading: string[]): Promise<SheetSpec> {
    const params: unknown[] = [];
    const rows = await this.db.query<{ row: Record<string, unknown> } & Record<string, unknown>>(
      `SELECT to_jsonb(s) - 'location' AS row,
              ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng, r.name AS region, d.name AS district,
              q.outcome AS "labOutcome", q.sampled_on::text AS "labDate",
              (SELECT max(i.inspected_on)::text FROM inspections i WHERE i.source_id = s.id AND i.state = 'approved') AS "lastInspected",
              (SELECT count(*) FROM work_orders w WHERE w.source_id = s.id AND w.status NOT IN ('closed', 'cancelled'))::int AS "openWorkOrders"
       ${SOURCE_FROM}
       LEFT JOIN LATERAL (
         SELECT t.outcome, t.sampled_on FROM wq_tests t
          WHERE t.source_id = s.id AND t.state = 'completed'
          ORDER BY t.sampled_on DESC, t.recorded_at DESC LIMIT 1
       ) q ON true
       ${sourceWhere(filters, params)}
       ORDER BY s.code`,
      params,
    );

    const fieldColumns: SheetColumn[] = SOURCE_FIELDS.filter((f) => !LEADING_FIELDS.has(f.key)).map((f) => ({
      header: f.unit ? `${f.label} (${f.unit})` : f.label,
      key: `f.${f.key}`,
      kind: f.kind === 'number' ? 'number' : f.kind === 'integer' ? 'integer' : f.kind === 'date' ? 'date' : 'text',
    }));
    // Type-specific details (depth, yield, dimensions…), one column per field across all types.
    const detailDefs = new Map<string, { label: string; unit?: string; kind: string }>();
    for (const type of SOURCE_TYPES) for (const d of SOURCE_TYPE_DEFS[type].detailFields) if (!detailDefs.has(d.key)) detailDefs.set(d.key, d);
    const extraKeys = new Set<string>();
    for (const r of rows) for (const k of Object.keys((r.row.details as Record<string, unknown>) ?? {})) if (!detailDefs.has(k)) extraKeys.add(k);
    const detailColumns: SheetColumn[] = [
      ...[...detailDefs].map(([key, d]) => ({ header: d.unit ? `${d.label} (${d.unit})` : d.label, key: `d.${key}`, kind: (d.kind === 'number' ? 'number' : 'text') as SheetColumn['kind'] })),
      ...[...extraKeys].sort().map((key) => ({ header: key.replace(/_/g, ' '), key: `d.${key}` })),
    ];

    const columns: SheetColumn[] = [
      { header: 'Code', key: 'code' },
      { header: 'Name', key: 'name' },
      { header: 'Type', key: 'type' },
      { header: 'Region', key: 'region' },
      { header: 'District', key: 'district' },
      { header: 'Nearest settlement', key: 'settlement' },
      { header: 'Latitude', key: 'lat', kind: 'number', width: 12 },
      { header: 'Longitude', key: 'lng', kind: 'number', width: 12 },
      { header: 'Status', key: 'status' },
      { header: 'Status reason', key: 'statusReason' },
      { header: 'Verified', key: 'verification' },
      ...fieldColumns,
      ...detailColumns,
      { header: 'Latest lab result', key: 'labOutcome' },
      { header: 'Latest lab test', key: 'labDate', kind: 'date' },
      { header: 'Last inspected', key: 'lastInspected', kind: 'date' },
      { header: 'Open work orders', key: 'openWorkOrders', kind: 'integer' },
      { header: 'Data source', key: 'dataSource' },
      { header: 'Reference in source data', key: 'legacyRef' },
      { header: 'Last updated', key: 'updatedAt', kind: 'datetime' },
    ];
    return {
      name: 'Water sources',
      heading,
      columns,
      rows: rows.map((r) => {
        const row = r.row;
        const out: Record<string, unknown> = {
          code: row.code,
          name: row.name,
          type: typeLabel(row.type as string),
          region: r.region,
          district: r.district,
          settlement: row.settlement,
          lat: r.lat,
          lng: r.lng,
          status: STATUS_LABELS[row.status as string] ?? row.status,
          statusReason: row.status_reason,
          verification: row.verification === 'verified' ? 'Yes' : 'No',
          labOutcome: outcomeLabel(r.labOutcome as string | null),
          labDate: r.labDate,
          lastInspected: r.lastInspected,
          openWorkOrders: r.openWorkOrders,
          dataSource: row.data_source,
          legacyRef: row.legacy_ref,
          updatedAt: row.updated_at,
        };
        for (const f of SOURCE_FIELDS) if (!LEADING_FIELDS.has(f.key)) out[`f.${f.key}`] = row[f.key];
        const details = (row.details ?? {}) as Record<string, unknown>;
        for (const [k, v] of Object.entries(details)) out[`d.${k}`] = v;
        return out;
      }),
    };
  }

  private async inspectionsSheet(region: number | null, heading: string[]): Promise<SheetSpec> {
    const rows = await this.db.query(
      `SELECT i.inspected_on::text AS date, s.code, s.name, s.type, r.name AS region,
              CASE WHEN i.inspector_id IS NOT NULL THEN 'Field inspection' ELSE 'Imported visit' END AS kind,
              coalesce(u.full_name, i.agency) AS "by", i.status, i.state, i.notes,
              rv.full_name AS reviewer, i.reviewed_at AS "reviewedAt",
              (SELECT count(*) FROM inspection_photos p WHERE p.inspection_id = i.id)::int AS photos,
              CASE WHEN i.gps IS NULL THEN NULL ELSE round(ST_Distance(i.gps, s.location))::int END AS "gpsDistance"
         FROM inspections i
         JOIN water_sources s ON s.id = i.source_id
         JOIN regions r ON r.id = s.region_id
         LEFT JOIN users u ON u.id = i.inspector_id
         LEFT JOIN users rv ON rv.id = i.reviewed_by
        WHERE i.state <> 'draft' ${region ? 'AND s.region_id = $1' : ''}
        ORDER BY i.inspected_on DESC, i.created_at DESC
        LIMIT 50000`,
      region ? [region] : [],
    );
    const STATE: Record<string, string> = { submitted: 'Waiting for review', approved: 'Approved', returned: 'Returned' };
    return {
      name: 'Inspections',
      heading,
      columns: [
        { header: 'Visit date', key: 'date', kind: 'date' },
        { header: 'Source code', key: 'code' },
        { header: 'Source', key: 'name' },
        { header: 'Type', key: 'type' },
        { header: 'Region', key: 'region' },
        { header: 'Kind', key: 'kind' },
        { header: 'Inspector or agency', key: 'by' },
        { header: 'Status found', key: 'status' },
        { header: 'Review', key: 'state' },
        { header: 'Reviewed by', key: 'reviewer' },
        { header: 'Reviewed on', key: 'reviewedAt', kind: 'date' },
        { header: 'Photos', key: 'photos', kind: 'integer' },
        { header: 'GPS distance from record (m)', key: 'gpsDistance', kind: 'integer' },
        { header: 'Notes', key: 'notes', width: 50 },
      ],
      rows: rows.map((r) => ({
        ...r,
        type: typeLabel(r.type as string),
        status: r.status ? STATUS_LABELS[r.status as string] : null,
        state: STATE[r.state as string] ?? r.state,
      })),
    };
  }

  private async labSheet(region: number | null, heading: string[]): Promise<SheetSpec> {
    const [tests, parameters] = await Promise.all([
      this.db.query<{ values: Record<string, number> } & Record<string, unknown>>(
        `SELECT t.sampled_on::text AS "sampledOn", t.analysed_on::text AS "analysedOn", s.code, s.name, s.type, r.name AS region,
                t.sample_point AS "samplePoint", t.lab, t.outcome, rc.full_name AS "recordedBy",
                coalesce((SELECT json_object_agg(x.parameter, x.value) FROM wq_results x WHERE x.test_id = t.id), '{}'::json) AS values,
                (SELECT string_agg(p.label || ' ' || x.value || coalesce(' ' || nullif(p.unit, ''), ''), '; ' ORDER BY p.sort_order)
                   FROM wq_results x JOIN wq_parameters p ON p.code = x.parameter
                  WHERE x.test_id = t.id AND x.flag <> 'ok') AS outside
           FROM wq_tests t
           JOIN water_sources s ON s.id = t.source_id
           JOIN regions r ON r.id = s.region_id
           LEFT JOIN users rc ON rc.id = t.recorded_by
          WHERE t.state = 'completed' ${region ? 'AND s.region_id = $1' : ''}
          ORDER BY t.sampled_on DESC, t.recorded_at DESC`,
        region ? [region] : [],
      ),
      this.db.query<{ code: string; label: string; unit: string }>(
        `SELECT code, label, unit FROM wq_parameters
          WHERE active OR code IN (SELECT DISTINCT parameter FROM wq_results)
          ORDER BY sort_order, label`,
      ),
    ]);
    return {
      name: 'Water quality',
      heading,
      columns: [
        { header: 'Sample date', key: 'sampledOn', kind: 'date' },
        { header: 'Source code', key: 'code' },
        { header: 'Source', key: 'name' },
        { header: 'Type', key: 'type' },
        { header: 'Region', key: 'region' },
        { header: 'Sampling point', key: 'samplePoint' },
        { header: 'Laboratory', key: 'lab' },
        { header: 'Analysed on', key: 'analysedOn', kind: 'date' },
        { header: 'Outcome', key: 'outcome' },
        { header: 'Outside the limit', key: 'outside', width: 40 },
        ...parameters.map((p) => ({ header: p.unit ? `${p.label} (${p.unit})` : p.label, key: `p.${p.code}`, kind: 'number' as const })),
        { header: 'Recorded by', key: 'recordedBy' },
      ],
      rows: tests.map((t) => {
        const out: Record<string, unknown> = { ...t, type: typeLabel(t.type as string), outcome: outcomeLabel(t.outcome as string) };
        for (const [code, value] of Object.entries(t.values ?? {})) out[`p.${code}`] = value;
        return out;
      }),
    };
  }

  private async workOrdersSheet(region: number | null, heading: string[]): Promise<SheetSpec> {
    const rows = await this.db.query(
      `SELECT 'WO-' || lpad(w.ref_no::text, 5, '0') AS ref, w.status, w.priority, w.category, w.title, w.description,
              s.code, s.name, s.type, r.name AS region,
              rp.full_name AS "reportedBy", w.reported_at AS "reportedAt", asg.full_name AS technician,
              w.completed_on::text AS "completedOn", w.work_done AS "workDone", w.parts_used AS "partsUsed",
              w.cost_usd::float8 AS "costUsd", w.performed_by AS "performedBy", w.working_after AS "workingAfter",
              cl.full_name AS "closedBy", w.closed_at AS "closedAt",
              CASE WHEN w.status = 'closed' THEN round((extract(epoch FROM (w.closed_at - w.reported_at)) / 86400)::numeric, 1)::float8 END AS days
         FROM work_orders w
         JOIN water_sources s ON s.id = w.source_id
         JOIN regions r ON r.id = s.region_id
         LEFT JOIN users rp ON rp.id = w.reported_by
         LEFT JOIN users asg ON asg.id = w.assigned_to
         LEFT JOIN users cl ON cl.id = w.closed_by
        WHERE true ${region ? 'AND s.region_id = $1' : ''}
        ORDER BY w.reported_at DESC`,
      region ? [region] : [],
    );
    return {
      name: 'Work orders',
      heading,
      columns: [
        { header: 'Work order', key: 'ref' },
        { header: 'Status', key: 'status' },
        { header: 'Priority', key: 'priority' },
        { header: 'Type of problem', key: 'category' },
        { header: 'Problem', key: 'title', width: 40 },
        { header: 'Source code', key: 'code' },
        { header: 'Source', key: 'name' },
        { header: 'Type', key: 'type' },
        { header: 'Region', key: 'region' },
        { header: 'Reported by', key: 'reportedBy' },
        { header: 'Reported on', key: 'reportedAt', kind: 'date' },
        { header: 'Technician', key: 'technician' },
        { header: 'Completed on', key: 'completedOn', kind: 'date' },
        { header: 'Work done', key: 'workDone', width: 50 },
        { header: 'Parts used', key: 'partsUsed' },
        { header: 'Cost (US$)', key: 'costUsd', kind: 'number' },
        { header: 'Done by', key: 'performedBy' },
        { header: 'Working after repair', key: 'workingAfter' },
        { header: 'Closed by', key: 'closedBy' },
        { header: 'Closed on', key: 'closedAt', kind: 'date' },
        { header: 'Days from report to closure', key: 'days', kind: 'number' },
        { header: 'Details', key: 'description', width: 50 },
      ],
      rows: rows.map((r) => ({
        ...r,
        status: WORK_ORDER_STATUS_LABELS[r.status as string] ?? r.status,
        priority: String(r.priority).charAt(0).toUpperCase() + String(r.priority).slice(1),
        category: categoryLabel(r.category as string),
        type: typeLabel(r.type as string),
      })),
    };
  }

  private async auditSheet(heading: string[]): Promise<SheetSpec> {
    const rows = await this.db.query(
      `SELECT a.at, u.full_name AS "user", u.email, a.action, a.summary, a.entity_type AS "entityType", a.entity_id AS "entityId", a.ip
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.at DESC, a.id DESC
        LIMIT 50000`,
    );
    return {
      name: 'Audit log',
      heading,
      columns: [
        { header: 'When', key: 'at', kind: 'datetime' },
        { header: 'User', key: 'user' },
        { header: 'Email', key: 'email' },
        { header: 'Action', key: 'action' },
        { header: 'What happened', key: 'summary', width: 60 },
        { header: 'Record type', key: 'entityType' },
        { header: 'Record', key: 'entityId' },
        { header: 'IP address', key: 'ip' },
      ],
      rows,
    };
  }
}
