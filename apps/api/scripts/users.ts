// User administration from the command line (works against DATABASE_URL or the local database).
//
//   npm run users:demo
//       Create the demo accounts (one per role). Sign-in details go to demo-accounts.local.txt.
//
//   npm run users:create -- --email jane@example.org --name "Jane Doe" --role admin [--department ict] [--region MJ]
//       Create one user with a temporary password (they must change it at first sign-in).
//
//   npm run users:import -- staff.local.csv
//       Create many users from a CSV with the columns: full_name,email,role,department,region
//       (department and region may be empty; region is a code such as MJ or a name such as Sool).
//       Each user gets their own temporary password, written to <file>.passwords.local.txt.
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createDemoUsers, DEMO_CREDENTIALS_FILE } from '../src/auth/demo-users';
import { generatePassword, hashPassword } from '../src/auth/passwords';
import { DEPARTMENT_CODES, REGION_SCOPED_ROLES, ROLE_LABELS, ROLES, type Department, type Role } from '../src/auth/roles';
import { createDb, type Db } from '../src/database/db';
import { migrate } from '../src/database/migrate';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  const db = await createDb();
  try {
    await migrate(db);

    if (command === 'demo') {
      const created = await createDemoUsers(db);
      console.log(
        created.length
          ? `Created ${created.length} demo accounts. Sign-in details: ${DEMO_CREDENTIALS_FILE}`
          : 'All demo accounts already exist.',
      );
      return;
    }

    if (command === 'create') {
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

      const password = generatePassword();
      await db.query(
        `INSERT INTO users (email, full_name, role, department, region_id, password_hash, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [email, name, role, department ?? null, regionId, await hashPassword(password)],
      );
      console.log(`Created ${email} (${role}).`);
      console.log(`Temporary password: ${password}`);
      console.log('They will be asked to choose a new password at first sign-in.');
      return;
    }

    if (command === 'import') {
      const file = process.argv[3];
      if (!file) throw new Error('Usage: npm run users:import -- path/to/users.csv');
      await importUsers(db, path.resolve(file));
      return;
    }

    console.log(
      'Usage: users.ts demo | import <file.csv> | create --email <email> --name <name> --role <role> [--department <code>] [--region <code>]',
    );
  } finally {
    await db.close();
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});

/** Minimal CSV reader: comma-separated, optional double quotes, first row is the header. */
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

async function importUsers(db: Db, file: string) {
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
