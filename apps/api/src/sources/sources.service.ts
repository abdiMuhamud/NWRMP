import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { camelize } from '../common/case';
import { DB, type Db } from '../database/db';
import { SOURCE_FROM, sourceWhere } from './source-filters';
import type { ListSourcesQuery, SourceFilterQuery, SourceSort } from './sources.dto';

const SORT_COLUMNS: Record<SourceSort, string> = {
  code: 's.code',
  name: 's.name',
  type: 's.type',
  region: 'r.name',
  status: 's.status',
  people: 's.people_served',
  inspected: 'li.inspected_on',
};

const LAST_INSPECTION = `
  LEFT JOIN LATERAL (
    SELECT max(i.inspected_on) AS inspected_on FROM inspections i WHERE i.source_id = s.id AND i.state = 'approved'
  ) li ON true`;

@Injectable()
export class SourcesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(query: ListSourcesQuery) {
    const params: unknown[] = [];
    const where = sourceWhere(query, params);
    const [{ total }] = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total ${SOURCE_FROM} ${where}`,
      params,
    );

    const order = `${SORT_COLUMNS[query.sort]} ${query.order === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, s.code`;
    const pageParams = [...params, query.pageSize, (query.page - 1) * query.pageSize];
    const items = await this.db.query(
      `SELECT s.id, s.code, s.name, s.type, s.status, s.verification, s.settlement,
              s.people_served AS "peopleServed",
              r.id AS "regionId", r.name AS region, d.name AS district,
              ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng,
              li.inspected_on::text AS "lastInspectedOn"
       ${SOURCE_FROM} ${LAST_INSPECTION}
       ${where}
       ORDER BY ${order}
       LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams,
    );

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async geojson(filters: SourceFilterQuery) {
    const params: unknown[] = [];
    const rows = await this.db.query<{ lng: number; lat: number } & Record<string, unknown>>(
      `SELECT s.id, s.code, s.name, s.type, s.status, s.verification,
              r.name AS region, d.name AS district, s.people_served AS "peopleServed", q.outcome AS quality,
              ST_X(s.location::geometry) AS lng, ST_Y(s.location::geometry) AS lat
       ${SOURCE_FROM}
       -- Latest laboratory result, for colouring the map by water quality
       LEFT JOIN LATERAL (
         SELECT t.outcome FROM wq_tests t
          WHERE t.source_id = s.id AND t.state = 'completed'
          ORDER BY t.sampled_on DESC, t.recorded_at DESC LIMIT 1
       ) q ON true
       ${sourceWhere(filters, params)}`,
      params,
    );
    return {
      type: 'FeatureCollection',
      features: rows.map(({ lng, lat, ...properties }) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties,
      })),
    };
  }

  async findOne(id: string, scope: number | null) {
    const [row] = await this.db.query<{ source: Record<string, unknown> } & Record<string, unknown>>(
      `SELECT to_jsonb(s) - 'location' AS source,
              ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng,
              r.name AS region, r.code AS "regionCode", d.name AS district, u.full_name AS "updatedByName"
       ${SOURCE_FROM}
       LEFT JOIN users u ON u.id = s.updated_by
       WHERE s.id = $1 AND ($2::smallint IS NULL OR s.region_id = $2)`,
      [id, scope],
    );
    if (!row) throw new NotFoundException('Water source not found');

    const [inspections, interventions, issues] = await Promise.all([
      this.db.query(
        `SELECT i.id, i.inspected_on::text AS "inspectedOn", i.agency, i.status, i.notes, i.state,
                u.full_name AS inspector, (i.inspector_id IS NOT NULL) AS "isFieldInspection",
                (SELECT count(*) FROM inspection_photos p WHERE p.inspection_id = i.id)::int AS "photoCount"
           FROM inspections i LEFT JOIN users u ON u.id = i.inspector_id
          WHERE i.source_id = $1 AND i.state <> 'draft'
          ORDER BY i.inspected_on DESC, i.created_at DESC`,
        [id],
      ),
      this.db.query(
        `SELECT id, performed_on::text AS "performedOn", agency, description
           FROM interventions WHERE source_id = $1 ORDER BY performed_on DESC NULLS LAST`,
        [id],
      ),
      this.db.query(
        `SELECT id, severity, field, message, original_value AS "originalValue", sheet, row_number AS "rowNumber"
           FROM import_issues WHERE source_id = $1
          ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, id`,
        [id],
      ),
    ]);

    const { source, ...rest } = row;
    return { ...camelize(source), ...rest, inspections, interventions, issues };
  }

  async nearby(id: string, radiusKm: number, scope: number | null) {
    await this.assertVisible(id, scope);
    return this.db.query(
      `SELECT s.id, s.code, s.name, s.type, s.status,
              ST_Distance(s.location, o.location) / 1000 AS "distanceKm"
         FROM water_sources s, (SELECT location FROM water_sources WHERE id = $1) o
        WHERE s.id <> $1 AND ST_DWithin(s.location, o.location, $2)
          AND ($3::smallint IS NULL OR s.region_id = $3)
        ORDER BY "distanceKm"
        LIMIT 20`,
      [id, radiusKm * 1000, scope],
    );
  }

  /** 404 unless the source exists and is inside the user's region (when they have one). */
  async assertVisible(id: string, scope: number | null) {
    const [row] = await this.db.query('SELECT 1 FROM water_sources WHERE id = $1 AND ($2::smallint IS NULL OR region_id = $2)', [id, scope]);
    if (!row) throw new NotFoundException('Water source not found');
  }
}
