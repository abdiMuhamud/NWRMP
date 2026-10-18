// Applies database migrations to DATABASE_URL (or the local embedded database).
//   npm run db:migrate
import 'dotenv/config';
import { createDb } from '../src/database/db';
import { migrate } from '../src/database/migrate';

async function main() {
  const db = await createDb();
  try {
    const ran = await migrate(db);
    console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Database is up to date.');
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
