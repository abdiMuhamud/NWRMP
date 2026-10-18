import type { Db } from './db';
import * as m001 from './migrations/001-init';
import * as m002 from './migrations/002-regions';

// Ordered list. Never edit a migration that has been applied; add a new one.
const migrations: { id: string; sql: string }[] = [
  { id: '001-init', sql: m001.sql },
  { id: '002-regions', sql: m002.sql },
];

export async function migrate(db: Db): Promise<string[]> {
  return db.transaction(async (tx) => {
    // Serialise concurrent cold starts on a shared server.
    if (tx.kind === 'postgres') await tx.query('SELECT pg_advisory_xact_lock(727274)');

    await tx.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )`);
    const applied = new Set((await tx.query<{ id: string }>('SELECT id FROM schema_migrations')).map((r) => r.id));

    const ran: string[] = [];
    for (const m of migrations) {
      if (applied.has(m.id)) continue;
      await tx.exec(m.sql);
      await tx.query('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
      ran.push(m.id);
    }
    return ran;
  });
}
