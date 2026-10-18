import { Controller, Get, Inject, Query } from '@nestjs/common';
import { validated } from '../common/validation';
import { RegionQuery } from '../sources/sources.dto';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(@Inject(StatsService) private readonly stats: StatsService) {}

  @Get('summary')
  summary(@Query(validated(RegionQuery)) query: RegionQuery) {
    return this.stats.summary(query.region);
  }
}
