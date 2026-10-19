// NWRMP administration commands. Compiled with the API, so they run on servers without dev tools.
//
//   Development:  npm run cli -- <command>        (tsx src/cli.ts)
//   Production:   node dist/cli.js <command>      (e.g. docker compose exec api node dist/cli.js users:create ...)
//
// Commands
//   migrate                                   Apply database migrations
//   seed [--reset] [file.xlsx]                Import the sample workbook (or another workbook in the Ministry template)
//   users:create --email E --name "N" --role R [--department D] [--region CODE]
//                                             Create one user with a temporary password (printed once)
//   users:import file.csv                     Create users from a CSV (full_name,email,role,department,region)
//   users:demo                                Create one demo account per role (password printed once)
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createDemoUsers } from './auth/demo-users';
import { generatePassword, hashPassword } from './auth/passwords';
import { DEPARTMENT_CODES, REGION_SCOPED_ROLES, ROLE_LABELS, ROLES, type Department, type Role } from './auth/roles';
import { createDb, type Db } from './database/db';
import { migrate } from './database/migrate';
import { importWorkbook } from './import/excel-import';
import { describeImport, SAMPLE_WORKBOOK } from './import/sample';

const USAGE = `Usage: cli <command>
  migrate
  seed [--reset] [file.xlsx]
  users:create --email <email> --name "<full name>" --role <role> [--department <code>] [--region <code>]
  users:import <file.csv>
  users:demo

Roles: ${ROLES.join(', ')}
Departments: ${DEPARTMENT_CODES.join(', ')}
Regions: AW, MJ, SX, SN, SL, TG`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  if (!command || command === 'help' || command === '--help') {
    console.log(USAGE);
    return;
  }

  const db = await createDb();
  try {
    const ran = await migrate(db);
    if (ran.length) console.log(`Applied migrations: ${ran.join(', ')}`);

    switch (command) {
      case 'migrate':
        if (!ran.length) console.log('Database is up to date.');
        return;
      case 'seed':
        return await seed(db);
      case 'users:create':
        return await createUser(db);
      case 'users:import':
        return await importUsers(db, process.argv[3]);
      case 'users:demo': {
        const { created, lines } = await createDemoUsers(db, null);
        console.log(created.length ? lines.join('\n') : 'All demo accounts already exist.');
        return;
      }
      default:
        console.log(`Unknown command "${command}".\n\n${USAGE}`);
        process.exitCode = 1;
    }
  } finally {
    await db.close();
  }
}

async function seed(db: Db) {
  const reset = process.argv.includes('--reset');
  const fileArg = process.argv.slice(3).find((a) => a.toLowerCase().endsWith('.xlsx'));
  const file = fileArg ? path.resolve(fileArg) : SAMPLE_WORKBOOK;

  if (reset) {
    await db.exec('TRUNCATE water_sources, import_issues, districts RESTART IDENTITY CASCADE');
    console.log('Removed existing water sources.');
  }
  const [{ count }] = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM water_sources');
  if (count > 0 && !fileArg) {
    console.log(`Database already has ${count} water sources. Use "seed --reset" to replace them with the sample.`);
    return;
  }
  const summary = await importWorkbook(db, file, {
    batch: `${path.basename(file, '.xlsx')}-${new Date().toISOString().slice(0, 19)}`,
    dataSource: file === SAMPLE_WORKBOOK ? 'Sample workbook (example data)' : path.basename(file),
  });
  console.log(describeImport(summary));
}

async function createUser(db: Db) {
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name')?.trim();
  const role = arg('role') as Role | undefined;
  const department = arg('department') as Department | undefined;
  const regionCode = arg('region')?.toUpperCase();

  if (!email || !name || !role) throw new Error('Required: --email, --name and --role');
  if (!ROLES.includes(role)) throw new Error(`--role must be one of: ${ROLES.join(', ')}`);
  if (department && !DEPARTMENT_CODES.includes(department)) throw new Error(`--department must be one of: ${DEPARTMENT_CODES.join(', ')}`);

  let regionId: number | null = null;
  if (REGION_SCOPED_ROLES.includes(role)) {
    const [region] = await db.query<{ id: number }>('SELECT id FROM regions WHERE code = $1', [regionCode ?? '']);
    if (!region) throw new Error('This role needs --region with a region code (AW, MJ, SX, SN, SL, TG)');
    regionId = region.id;
  }
  const [exists] = await db.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
  if (exists) throw new Error(`A user with the email ${email} already exists`);

  const password = generatePassword();
  await db.query(
    `INSERT INTO users (email, full_name, role, department, region_id, password_hash, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, true)`,
    [email, name, role, department ?? null, regionId, await hashPassword(password)],
  );
  console.log(`Created ${email} (${ROLE_LABELS[role]}).`);
  console.log(`Temporary password: ${password}`);
  console.log('They must choose a new password at first sign-in.');
}

/** Minimal CSV reader: comma-separated, optional double quotes, first row is the header, # starts a comment. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const cells: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') {
        cells.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  const [header, ...data] = rows;
  const keys = (header ?? []).map((h) => h.toLowerCase().replace(/[^a-z]+/g, '_'));
  return data.map((cells) => Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? ''])));
}

async function importUsers(db: Db, fileArg: string | undefined) {
  if (!fileArg) throw new Error('Usage: cli users:import <file.csv>');
  const file = path.resolve(fileArg);
  const rows = parseCsv(readFileSync(file, 'utf8'));
  const regions = await db.query<{ id: number; code: string; name: string }>('SELECT id, code, name FROM regions');
  const findRegion = (v: string) =>
    regions.find((r) => r.code.toLowerCase() === v.toLowerCase() || r.name.toLowerCase() === v.toLowerCase());

  const created: string[] = [];
  const problems: string[] = [];
  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    const email = row.email?.toLowerCase();
    const name = row.full_name || row.name;
    const role = row.role as Role;
    const department = (row.department || null) as Department | null;
    const region = row.region ? findRegion(row.region) : undefined;
    const scoped = REGION_SCOPED_ROLES.includes(role);

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
      problems.push(`Line ${line}: needs a full_name and a valid email`);
      continue;
    }
    if (!ROLES.includes(role)) {
      problems.push(`Line ${line} (${email}): role must be one of ${ROLES.join(', ')}`);
      continue;
    }
    if (department && !DEPARTMENT_CODES.includes(department)) {
      problems.push(`Line ${line} (${email}): department must be one of ${DEPARTMENT_CODES.join(', ')}`);
      continue;
    }
    if (scoped && !region) {
      problems.push(`Line ${line} (${email}): this role needs a region (code or name)`);
      continue;
    }
    const [exists] = await db.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
    if (exists) {
      problems.push(`Line ${line} (${email}): already exists, skipped`);
      continue;
    }

    const password = generatePassword();
    await db.query(
      `INSERT INTO users (email, full_name, role, department, region_id, password_hash, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [email, name, role, department, scoped ? region!.id : null, await hashPassword(password)],
    );
    const where = scoped ? ` (${region!.name})` : '';
    created.push(`${name.padEnd(28)} ${email.padEnd(34)} ${password}   ${ROLE_LABELS[role]}${where}`);
  }

  if (created.length) {
    const out = file.replace(/\.csv$/i, '') + '.passwords.local.txt';
    const database = process.env.DATABASE_URL ? 'PostgreSQL (DATABASE_URL)' : 'local embedded database';
    const lines = [
      'NWRMP accounts - temporary passwords. Keep private; each person must change it at first sign-in.',
      `Created: ${new Date().toISOString()} - Database: ${database}`,
      '',
      ...created,
      '',
    ];
    writeFileSync(out, lines.join('\n'), { flag: 'a' });
    console.log(`Created ${created.length} users. Temporary passwords: ${out}`);
  } else {
    console.log('No users created.');
  }
  for (const p of problems) console.log(`  ${p}`);
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
