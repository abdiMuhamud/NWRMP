import { Controller, Get, Inject, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import type { AuthUser } from '../auth/roles';
import { validated } from '../common/validation';
import { RegionQuery, SourceFilterQuery } from '../sources/sources.dto';
import { DATASETS, ReportsService, type Dataset } from './reports.service';

/** Summary report and Excel exports, limited to the user's region for regional roles. */
@Controller()
@RequirePermission('sources.view')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get('reports/summary')
  summary(@CurrentUser() user: AuthUser, @Query(validated(RegionQuery)) q: RegionQuery) {
    return this.reports.summary(this.reports.scope(user, q.region));
  }

  /** Streams an .xlsx file; the filters apply to the water-source export. */
  @Get('exports/:dataset')
  async export(
    @CurrentUser() user: AuthUser,
    @Param('dataset') dataset: string,
    @Query(validated(SourceFilterQuery)) filters: SourceFilterQuery,
    @Res() res: Response,
  ) {
    if (!DATASETS.includes(dataset as Dataset)) throw new NotFoundException('Unknown export');
    const { buffer, filename } = await this.reports.export(user, dataset as Dataset, filters);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }
}
