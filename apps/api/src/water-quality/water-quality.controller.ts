import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, RequestMeta, RequirePermission, type RequestMetaValue } from '../auth/decorators';
import type { AuthUser } from '../auth/roles';
import { validated } from '../common/validation';
import { CancelTestDto, ListTestsQuery, ParameterDto, RecordTestDto, RequestTestDto } from './water-quality.dto';
import { WaterQualityService } from './water-quality.service';

/** Water-quality laboratory results. Everyone who can see sources can see results. */
@Controller('water-quality')
@RequirePermission('sources.view')
export class WaterQualityController {
  constructor(@Inject(WaterQualityService) private readonly wq: WaterQualityService) {}

  @Get('parameters')
  parameters() {
    return this.wq.parameters();
  }

  @Post('parameters')
  @RequirePermission('lab.standards')
  addParameter(@CurrentUser() user: AuthUser, @Body(validated(ParameterDto)) dto: ParameterDto, @RequestMeta() meta: RequestMetaValue) {
    return this.wq.addParameter(user, dto, meta.ip);
  }

  @Patch('parameters/:code')
  @RequirePermission('lab.standards')
  updateParameter(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Body(validated(ParameterDto)) dto: ParameterDto,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    return this.wq.updateParameter(user, code, dto, meta.ip);
  }

  @Get('counts')
  counts(@CurrentUser() user: AuthUser) {
    return this.wq.counts(user);
  }

  @Get('sources/:sourceId')
  forSource(@CurrentUser() user: AuthUser, @Param('sourceId', ParseUUIDPipe) sourceId: string) {
    return this.wq.forSource(user, sourceId);
  }

  @Get('tests')
  list(@CurrentUser() user: AuthUser, @Query(validated(ListTestsQuery)) q: ListTestsQuery) {
    return this.wq.list(user, q.box, q.outcome);
  }

  @Get('tests/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.wq.get(user, id);
  }

  @Post('tests')
  @RequirePermission('lab.request')
  request(@CurrentUser() user: AuthUser, @Body(validated(RequestTestDto)) dto: RequestTestDto, @RequestMeta() meta: RequestMetaValue) {
    return this.wq.request(user, dto, meta.ip);
  }

  /** A test recorded directly by the lab, without a request. */
  @Post('tests/record')
  @RequirePermission('lab.record')
  recordDirect(@CurrentUser() user: AuthUser, @Body(validated(RecordTestDto)) dto: RecordTestDto, @RequestMeta() meta: RequestMetaValue) {
    return this.wq.record(user, null, dto, meta.ip);
  }

  /** Results of a requested test, or a correction of recorded results. */
  @Post('tests/:id/results')
  @HttpCode(200)
  @RequirePermission('lab.record')
  record(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validated(RecordTestDto)) dto: RecordTestDto,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    return this.wq.record(user, id, dto, meta.ip);
  }

  @Post('tests/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validated(CancelTestDto)) dto: CancelTestDto,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    return this.wq.cancel(user, id, dto.reason, meta.ip);
  }
}
