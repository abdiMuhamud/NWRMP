import { Controller, Get, Inject } from '@nestjs/common';
import { RequirePermission } from '../auth/decorators';
import { DEPARTMENT_SOURCE_TYPES, DEPARTMENTS, ROLE_LABELS, ROLES, REGION_SCOPED_ROLES } from '../auth/roles';
import { DB, type Db } from '../database/db';
import { SOURCE_FIELDS, SOURCE_SECTIONS } from './source-fields';
import { FUNCTIONAL_STATUSES, SOURCE_TYPE_DEFS, SOURCE_TYPES } from './source-types';

/** Lists and definitions used by forms and filters. */
@Controller('reference')
@RequirePermission('sources.view')
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
      sections: SOURCE_SECTIONS,
      fields: SOURCE_FIELDS,
      roles: ROLES.map((code) => ({ code, label: ROLE_LABELS[code], regionScoped: REGION_SCOPED_ROLES.includes(code) })),
      departments: DEPARTMENTS.map((d) => ({ ...d, approves: DEPARTMENT_SOURCE_TYPES[d.code] ?? [] })),
    };
  }
}
