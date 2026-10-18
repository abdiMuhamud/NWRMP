import { Inject, Injectable } from '@nestjs/common';
import { DB, type Db } from '../database/db';
import { SOURCE_TYPES } from '../reference/source-types';
import { SOURCE_FROM, sourceWhere } from '../sources/source-filters';

// Columns that can be grouped on; never interpolate anything outside this list.
const GROUPABLE = {
  power: { column: 's.power_source', empty: 'Not recorded' },
  quality: { column: 's.quality_issue', empty: 'No issue reported' },
  condition: { column: 's.supply_condition', empty: 'Not recorded' },
} as const;

@Injectable()
export class StatsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async summary(region?: number) {
    const filters = { region };
    const scoped = (sql: (where: string) => string) => {
      const params: unknown[] = [];
      return this.db.query(sql(sourceWhere(filters, params)), params);
    };

    const [totals, byType, byRegion, power, quality, condition, recentInspections] = await Promise.all([
      scoped(
        (where) => `
        SELECT count(*)::int AS sources,
               count(*) FILTER (WHERE s.status = 'functioning')::int AS functioning,
               count(*) FILTER (WHERE s.status = 'non_functioning')::int AS "nonFunctioning",
               count(*) FILTER (WHERE s.status = 'abandoned')::int AS abandoned,
               count(*) FILTER (WHERE s.status = 'unknown')::int AS unknown,
               count(*) FILTER (WHERE s.verification = 'unverified')::int AS unverified,
               count(*) FILTER (WHERE s.data_source ILIKE 'sample%')::int AS "sampleRecords",
               coalesce(sum(s.people_served), 0)::float8 AS "peopleServed",
               coalesce(sum(s.idps_served), 0)::float8 AS "idpsServed",
               coalesce(sum(coalesce(s.camels, 0) + coalesce(s.cattle, 0) + coalesce(s.shoats, 0)), 0)::float8 AS livestock,
               max(s.updated_at) AS "lastUpdated"
        ${SOURCE_FROM} ${where}`,
      ),
      scoped(
        (where) => `
        SELECT s.type, count(*)::int AS total,
               count(*) FILTER (WHERE s.status = 'functioning')::int AS functioning
        ${SOURCE_FROM} ${where}
        GROUP BY s.type`,
      ),
      this.db.query(
        `SELECT r.id, r.code, r.name,
                count(s.id)::int AS total,
                count(s.id) FILTER (WHERE s.status = 'functioning')::int AS functioning,
                count(s.id) FILTER (WHERE s.status = 'non_functioning')::int AS "nonFunctioning",
                count(s.id) FILTER (WHERE s.status = 'abandoned')::int AS abandoned,
                count(s.id) FILTER (WHERE s.status = 'unknown')::int AS unknown
           FROM regions r
           LEFT JOIN water_sources s ON s.region_id = r.id
          ${region ? 'WHERE r.id = $1' : ''}
          GROUP BY r.id, r.code, r.name
          ORDER BY total DESC, r.name`,
        region ? [region] : [],
      ),
      this.groupCount('power', region),
      this.groupCount('quality', region),
      this.groupCount('condition', region),
      this.db.query(
        `SELECT i.id, i.inspected_on::text AS "inspectedOn", i.agency, i.status,
                s.id AS "sourceId", s.code, s.name, s.type
           FROM inspections i
           JOIN water_sources s ON s.id = i.source_id
          WHERE i.state = 'approved' ${region ? 'AND s.region_id = $1' : ''}
          ORDER BY i.inspected_on DESC
          LIMIT 6`,
        region ? [region] : [],
      ),
    ]);

    // Always return every source type, in the fixed display order.
    const typeCounts = new Map(byType.map((t) => [t.type as string, t]));
    return {
      totals: totals[0],
      byType: SOURCE_TYPES.map((type) => ({
        type,
        total: (typeCounts.get(type)?.total as number) ?? 0,
        functioning: (typeCounts.get(type)?.functioning as number) ?? 0,
      })),
      byRegion,
      byPower: power,
      byQuality: quality,
      byCondition: condition,
      recentInspections,
    };
  }

  private groupCount(group: keyof typeof GROUPABLE, region?: number) {
    const { column, empty } = GROUPABLE[group];
    const params: unknown[] = [empty];
    const where = sourceWhere({ region }, params);
    return this.db.query<{ label: string; count: number }>(
      `SELECT coalesce(${column}, $1) AS label, count(*)::int AS count
       ${SOURCE_FROM} ${where}
       GROUP BY 1
       ORDER BY 2 DESC, 1`,
      params,
    );
  }
}
