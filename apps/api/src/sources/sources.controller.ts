import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { validated } from '../common/validation';
import { ListSourcesQuery, NearbyQuery, SourceFilterQuery } from './sources.dto';
import { SourcesService } from './sources.service';

@Controller('sources')
export class SourcesController {
  constructor(@Inject(SourcesService) private readonly sources: SourcesService) {}

  @Get()
  list(@Query(validated(ListSourcesQuery)) query: ListSourcesQuery) {
    return this.sources.list(query);
  }

  /** All matching sources as GeoJSON points, for the map. */
  @Get('geojson')
  geojson(@Query(validated(SourceFilterQuery)) query: SourceFilterQuery) {
    return this.sources.geojson(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sources.findOne(id);
  }

  /** Other sources within a radius, measured on the earth's surface (PostGIS geography). */
  @Get(':id/nearby')
  nearby(@Param('id', ParseUUIDPipe) id: string, @Query(validated(NearbyQuery)) query: NearbyQuery) {
    return this.sources.nearby(id, query.radiusKm);
  }
}
