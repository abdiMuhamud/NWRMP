import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDemoUsers, DEMO_CREDENTIALS_FILE } from '../auth/demo-users';
import { describeImport, seedIfEmpty } from '../import/sample';
import { createDb, DB, type Db } from './db';
import { migrate } from './migrate';

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: async (): Promise<Db> => {
        const logger = new Logger('Database');
        const db = await createDb();
        const ran = await migrate(db);
        logger.log(`Connected (${db.kind})${ran.length ? `, applied migrations: ${ran.join(', ')}` : ''}`);

        // The embedded local database starts empty; load the sample workbook and demo accounts.
        if (db.kind === 'pglite') {
          const summary = await seedIfEmpty(db);
          if (summary) logger.log(`\n${describeImport(summary)}`);
          const created = await createDemoUsers(db);
          if (created.length) logger.log(`Created ${created.length} demo accounts; sign-in details are in ${DEMO_CREDENTIALS_FILE}`);
        }
        return db;
      },
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Db) {}

  async onApplicationShutdown() {
    await this.db.close();
  }
}
