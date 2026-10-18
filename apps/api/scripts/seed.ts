// Imports a water-source workbook (default: the sample in ./data) into the database.
//   npm run db:seed                      import the sample if the database is empty
//   npm run db:reset                     delete all water sources, then import the sample
//   npm run db:seed -- path/to/file.xlsx import another workbook
import 'dotenv/config';
import path from 'node:path';
import { createDb } from '../src/database/db';
import { migrate } from '../src/database/migrate';
import { importWorkbook } from '../src/import/excel-import';
import { describeImport, SAMPLE_WORKBOOK } from '../src/import/sample';

async function main() {
  const reset = process.argv.includes('--reset');
  const fileArg = process.argv.slice(2).find((a) => a.toLowerCase().endsWith('.xlsx'));
  const file = fileArg ? path.resolve(fileArg) : SAMPLE_WORKBOOK;

  const db = await createDb();
  try {
    await migrate(db);
    if (reset) {
      await db.exec('TRUNCATE water_sources, import_issues, districts RESTART IDENTITY CASCADE');
      console.log('Removed existing water sources.');
    }

    const [{ count }] = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM water_sources');
    if (count > 0 && !fileArg) {
      console.log(`Database already has ${count} water sources. Use "npm run db:reset" to reload the sample.`);
      return;
    }

    const summary = await importWorkbook(db, file, {
      batch: `${path.basename(file, '.xlsx')}-${new Date().toISOString().slice(0, 19)}`,
      dataSource: file === SAMPLE_WORKBOOK ? 'Sample workbook (example data)' : path.basename(file),
    });
    console.log(describeImport(summary));
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
