import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from './auth/decorators';
import { DB, type Db } from './database/db';

@Controller()
@Public()
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  index() {
    return { name: 'NWRMP API', version: '0.1.0', docs: '/api/health' };
  }

  @Get('health')
  async health() {
    const [row] = await this.db.query<{ sources: number }>('SELECT count(*)::int AS sources FROM water_sources');
    return { status: 'ok', database: this.db.kind, sources: row.sources, time: new Date().toISOString() };
  }
}
