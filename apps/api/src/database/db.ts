import path from 'node:path';
import { Pool, type PoolClient } from 'pg';

/**
 * Minimal database interface used across the API.
 *
 * Two drivers implement it:
 * - `postgres`: a real PostgreSQL + PostGIS server (Neon on Vercel, government servers in production)
 * - `pglite`:   an embedded PostgreSQL + PostGIS (WASM) for local development without installing anything
 */
export interface Db {
  readonly kind: 'postgres' | 'pglite';
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Run one or more SQL statements without parameters. */
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const DB = Symbol('DB');

export async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return createPostgresDb(url);
  return createPgliteDb(process.env.PGLITE_DIR ?? path.resolve(process.cwd(), '.pglite'));
}

function createPostgresDb(connectionString: string): Db {
  const pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
  });

  const wrapClient = (client: PoolClient): Db => ({
    kind: 'postgres',
    query: async <T>(text: string, params?: unknown[]) => (await client.query(text, params)).rows as T[],
    exec: async (sql: string) => {
      await client.query(sql);
    },
    transaction: (fn) => fn(wrapClient(client)),
    close: async () => {},
  });

  return {
    kind: 'postgres',
    query: async <T>(text: string, params?: unknown[]) => (await pool.query(text, params)).rows as T[],
    exec: async (sql: string) => {
      await pool.query(sql);
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrapClient(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

interface PgliteLike {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: PgliteLike) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

async function createPgliteDb(dataDir: string): Promise<Db> {
  // Loaded through variables so serverless bundlers do not pull the WASM build into production.
  const pgliteModule = '@electric-sql/pglite';
  const postgisModule = '@electric-sql/pglite-postgis';
  let PGlite: { create(dir: string, opts: unknown): Promise<PgliteLike> };
  let postgis: unknown;
  try {
    ({ PGlite } = await import(pgliteModule));
    ({ postgis } = await import(postgisModule));
  } catch {
    throw new Error(
      'DATABASE_URL is not set and the embedded database is not installed. ' +
        'Set DATABASE_URL to a PostgreSQL + PostGIS database, or run `npm install` (dev dependencies) in apps/api.',
    );
  }

  const pg = await PGlite.create(dataDir, { extensions: { postgis } });

  const wrap = (conn: PgliteLike, inTransaction: boolean): Db => {
    const db: Db = {
      kind: 'pglite',
      query: async <T>(text: string, params?: unknown[]) => (await conn.query<T>(text, params)).rows,
      exec: async (sql: string) => {
        await conn.exec(sql);
      },
      // Nested transactions reuse the open one.
      transaction: (fn) => (inTransaction ? fn(db) : conn.transaction((tx) => fn(wrap(tx, true)))),
      close: () => conn.close(),
    };
    return db;
  };

  return wrap(pg, false);
}
