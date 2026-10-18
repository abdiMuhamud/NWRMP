import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import { regionScope, type AuthUser } from '../auth/roles';
import { validated } from '../common/validation';
import { ListSourcesQuery, NearbyQuery, SourceFilterQuery } from './sources.dto';
import { SourcesService } from './sources.service';

@Controller('sources')
@RequirePermission('sources.view')
export class SourcesController {
  constructor(
    @Inject(SourcesService) private readonly sources: SourcesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(validated(ListSourcesQuery)) query: ListSourcesQuery) {
    return this.sources.list(withScope(query, user));
  }

  /** All matching sources as GeoJSON points, for the map. */
  @Get('geojson')
  geojson(@CurrentUser() user: AuthUser, @Query(validated(SourceFilterQuery)) query: SourceFilterQuery) {
    return this.sources.geojson(withScope(query, user));
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sources.findOne(id, regionScope(user));
  }

  /** Other sources within a radius, measured on the earth's surface (PostGIS geography). */
  @Get(':id/nearby')
  nearby(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query(validated(NearbyQuery)) query: NearbyQuery) {
    return this.sources.nearby(id, query.radiusKm, regionScope(user));
  }

  /** Approved changes to this source: who changed what, and when. */
  @Get(':id/history')
  async history(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.sources.assertVisible(id, regionScope(user));
    return this.audit.history('water_source', id);
  }
}

/** Users limited to one region always see only that region, whatever filter they send. */
function withScope<T extends SourceFilterQuery>(query: T, user: AuthUser): T {
  const scope = regionScope(user);
  return scope ? { ...query, region: scope } : query;
}
