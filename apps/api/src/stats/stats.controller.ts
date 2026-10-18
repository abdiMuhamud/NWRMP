import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import { regionScope, type AuthUser } from '../auth/roles';
import { validated } from '../common/validation';
import { RegionQuery } from '../sources/sources.dto';
import { StatsService } from './stats.service';

@Controller('stats')
@RequirePermission('sources.view')
export class StatsController {
  constructor(@Inject(StatsService) private readonly stats: StatsService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query(validated(RegionQuery)) query: RegionQuery) {
    return this.stats.summary(regionScope(user) ?? query.region);
  }
}
