import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequestMeta, RequirePermission, type RequestMetaValue } from '../auth/decorators';
import type { AuthUser } from '../auth/roles';
import { validated } from '../common/validation';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
@RequirePermission('users.manage')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  /** Returns the new user and a temporary password, shown once to the administrator. */
  @Post()
  create(@Body(validated(CreateUserDto)) dto: CreateUserDto, @CurrentUser() actor: AuthUser, @RequestMeta() meta: RequestMetaValue) {
    return this.users.create(dto, actor, meta.ip);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validated(UpdateUserDto)) dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    return this.users.update(id, dto, actor, meta.ip);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser, @RequestMeta() meta: RequestMetaValue) {
    return this.users.resetPassword(id, actor, meta.ip);
  }
}
