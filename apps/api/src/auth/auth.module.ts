import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditController } from '../audit/audit.controller';
import { AuditService } from '../audit/audit.service';
import { ChangesController } from '../changes/changes.controller';
import { ChangesService } from '../changes/changes.service';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

/** Sign-in, users, the approval workflow and the audit log. */
@Global()
@Module({
  controllers: [AuthController, UsersController, ChangesController, AuditController],
  providers: [AuthService, UsersService, ChangesService, AuditService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuditService],
})
export class AuthModule {}
