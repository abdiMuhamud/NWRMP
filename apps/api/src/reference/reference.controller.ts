import { Controller, Get, Inject } from '@nestjs/common';
import { DB, type Db } from '../database/db';
import { FUNCTIONAL_STATUSES, SOURCE_TYPE_DEFS, SOURCE_TYPES } from './source-types';

/** Lists used by forms and filters: regions with districts, source types and their technical fields. */
@Controller('reference')
export class ReferenceController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async reference() {
    const regions = await this.db.query(
      `SELECT r.id, r.code, r.name,
              coalesce(
                json_agg(json_build_object('id', d.id, 'name', d.name) ORDER BY d.name) FILTER (WHERE d.id IS NOT NULL),
                '[]'::json
              ) AS districts
         FROM regions r
         LEFT JOIN districts d ON d.region_id = r.id
        GROUP BY r.id, r.code, r.name
        ORDER BY r.name`,
    );

    return {
      regions,
      sourceTypes: SOURCE_TYPES.map((code) => {
        const { label, prefix, detailFields } = SOURCE_TYPE_DEFS[code];
        return { code, label, prefix, detailFields };
      }),
      statuses: FUNCTIONAL_STATUSES,
    };
  }
}
