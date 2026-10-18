import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, RequestMeta, RequirePermission, type RequestMetaValue } from '../auth/decorators';
import type { AuthUser } from '../auth/roles';
import { validated } from '../common/validation';
import { ListChangesQuery, ReviewDto, SubmitChangeDto } from './changes.dto';
import { ChangesService } from './changes.service';

/** Approval workflow: every new source and every edit is a request reviewed by the responsible department. */
@Controller('change-requests')
@RequirePermission('sources.view')
export class ChangesController {
  constructor(@Inject(ChangesService) private readonly changes: ChangesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(validated(ListChangesQuery)) q: ListChangesQuery) {
    return this.changes.list(user, q);
  }

  /** Badge counts for the navigation. */
  @Get('counts')
  counts(@CurrentUser() user: AuthUser) {
    return this.changes.counts(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.changes.get(user, id);
  }

  @Post()
  @RequirePermission('sources.propose')
  submit(@CurrentUser() user: AuthUser, @Body(validated(SubmitChangeDto)) dto: SubmitChangeDto, @RequestMeta() meta: RequestMetaValue) {
    return this.changes.submit(user, dto, meta.ip);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('sources.approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validated(ReviewDto)) dto: ReviewDto,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    return this.changes.approve(user, id, dto.comment, meta.ip);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('sources.approve')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validated(ReviewDto)) dto: ReviewDto,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    return this.changes.reject(user, id, dto.comment, meta.ip);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  withdraw(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @RequestMeta() meta: RequestMetaValue) {
    return this.changes.withdraw(user, id, meta.ip);
  }
}
