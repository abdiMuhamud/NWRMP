import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditController } from '../audit/audit.controller';
import { AuditService } from '../audit/audit.service';
import { ChangesController } from '../changes/changes.controller';
import { ChangesService } from '../changes/changes.service';
import { InspectionsController } from '../inspections/inspections.controller';
import { ImportsController } from '../imports/imports.controller';
import { InspectionsService } from '../inspections/inspections.service';
import { MaintenanceController } from '../maintenance/maintenance.controller';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { ReportsController } from '../reports/reports.controller';
import { ReportsService } from '../reports/reports.service';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { WaterQualityController } from '../water-quality/water-quality.controller';
import { WaterQualityService } from '../water-quality/water-quality.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

/** Sign-in, users, the approval workflow, field inspections, lab results, maintenance, reports, imports and the audit log. */
@Global()
@Module({
  controllers: [
    AuthController,
    UsersController,
    ChangesController,
    AuditController,
    InspectionsController,
    WaterQualityController,
    MaintenanceController,
    ReportsController,
    ImportsController,
  ],
  providers: [
    AuthService,
    UsersService,
    ChangesService,
    AuditService,
    InspectionsService,
    WaterQualityService,
    MaintenanceService,
    ReportsService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuditService],
})
export class AuthModule {}
