import { Controller, Get, Inject, Query } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import { regionScope, type AuthUser } from '../auth/roles';
import { validated } from '../common/validation';
import { DB, type Db } from '../database/db';

class IssuesQuery {
  @IsOptional()
  @IsIn(['error', 'warning', 'info'])
  severity?: 'error' | 'warning' | 'info';
}

/** Problems found while importing spreadsheets, for data officers to review and correct. */
@Controller('data-quality')
@RequirePermission('quality.view')
export class QualityController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async issues(@CurrentUser() user: AuthUser, @Query(validated(IssuesQuery)) query: IssuesQuery) {
    // Regional users see only issues on sources in their region.
    const scope = regionScope(user);
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (query.severity) clauses.push(`i.severity = $${params.push(query.severity)}`);
    if (scope) clauses.push(`i.source_id IN (SELECT id FROM water_sources WHERE region_id = $${params.push(scope)})`);
    const severityFilter = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const scopeFilter = scope ? `WHERE source_id IN (SELECT id FROM water_sources WHERE region_id = ${Number(scope)})` : '';

    const [totals, byMessage, items] = await Promise.all([
      this.db.query(
        `SELECT count(*) FILTER (WHERE severity = 'error')::int AS error,
                count(*) FILTER (WHERE severity = 'warning')::int AS warning,
                count(*) FILTER (WHERE severity = 'info')::int AS info,
                count(DISTINCT source_id)::int AS "sourcesAffected"
           FROM import_issues ${scopeFilter}`,
      ),
      // Group similar messages ("Possible duplicate of BH-MJ-00003 ...") under one heading.
      this.db.query(
        `SELECT regexp_replace(regexp_replace(i.message, '"[^"]*"', '"…"', 'g'), '[A-Z]{2}-[A-Z]{2}-\\d+|\\d+(\\.\\d+)?', '#', 'g') AS pattern,
                i.severity, count(*)::int AS count
           FROM import_issues i ${severityFilter}
          GROUP BY 1, 2
          ORDER BY 3 DESC
          LIMIT 12`,
        params,
      ),
      this.db.query(
        `SELECT i.id, i.severity, i.sheet, i.row_number AS "rowNumber", i.field, i.message,
                i.original_value AS "originalValue", s.id AS "sourceId", s.code, s.name
           FROM import_issues i
           LEFT JOIN water_sources s ON s.id = i.source_id
          ${severityFilter}
          ORDER BY CASE i.severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, i.id
          LIMIT 500`,
        params,
      ),
    ]);

    return { totals: totals[0], byMessage, items };
  }
}
