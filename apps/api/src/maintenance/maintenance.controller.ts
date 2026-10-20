import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, RequestMeta, RequirePermission, type RequestMetaValue } from '../auth/decorators';
import type { AuthUser } from '../auth/roles';
import { validated } from '../common/validation';
import { AssignWorkOrderDto, CommentDto, CompleteWorkOrderDto, ListWorkOrdersQuery, ReasonDto, ReportWorkOrderDto } from './maintenance.dto';
import { MaintenanceService } from './maintenance.service';

/** Maintenance work orders. Everyone who can see sources can follow them. */
@Controller('work-orders')
@RequirePermission('sources.view')
export class MaintenanceController {
  constructor(@Inject(MaintenanceService) private readonly maintenance: MaintenanceService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(validated(ListWorkOrdersQuery)) q: ListWorkOrdersQuery) {
    return this.maintenance.list(user, q.box, q.sourceId);
  }

  @Get('counts')
  counts(@CurrentUser() user: AuthUser) {
    return this.maintenance.counts(user);
  }

  @Get('technicians')
  @RequirePermission('maintenance.work')
  technicians() {
    return this.maintenance.technicians();
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.maintenance.get(user, id);
  }

  @Post()
  @RequirePermission('maintenance.report')
  report(@CurrentUser() user: AuthUser, @Body(validated(ReportWorkOrderDto)) dto: ReportWorkOrderDto, @RequestMeta() meta: RequestMetaValue) {
    return this.maintenance.report(user, dto, meta.ip);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermission('maintenance.work')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validated(AssignWorkOrderDto)) dto: AssignWorkOrderDto,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    return this.maintenance.assign(user, id, dto.userId, meta.ip);
  }

  @Post(':id/start')
  @HttpCode(200)
  @RequirePermission('maintenance.work')
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @RequestMeta() meta: RequestMetaValue) {
    return this.maintenance.start(user, id, meta.ip);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermission('maintenance.work')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validated(CompleteWorkOrderDto)) dto: CompleteWorkOrderDto,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    return this.maintenance.complete(user, id, dto, meta.ip);
  }

  @Post(':id/close')
  @HttpCode(200)
  @RequirePermission('maintenance.close')
  close(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validated(CommentDto)) dto: CommentDto,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    return this.maintenance.close(user, id, dto.comment, meta.ip);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @RequirePermission('maintenance.close')
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validated(CommentDto)) dto: CommentDto,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    return this.maintenance.reopen(user, id, dto.comment, meta.ip);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validated(ReasonDto)) dto: ReasonDto,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    return this.maintenance.cancel(user, id, dto.reason, meta.ip);
  }
}
