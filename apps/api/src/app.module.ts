import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { QualityController } from './quality/quality.controller';
import { ReferenceController } from './reference/reference.controller';
import { SourcesModule } from './sources/sources.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [DatabaseModule, SourcesModule, StatsModule],
  controllers: [HealthController, ReferenceController, QualityController],
})
export class AppModule {}
