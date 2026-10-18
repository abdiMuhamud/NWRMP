import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '../database/db';
import { generatePassword, hashPassword } from './passwords';
import { ROLE_LABELS, type Department, type Role } from './roles';

// One account per role, using the reserved .test domain so they can never be real addresses.
const DEMO_USERS: { email: string; fullName: string; role: Role; department?: Department; regionCode?: string }[] = [
  { email: 'admin@nwrmp.test', fullName: 'Demo Administrator', role: 'admin', department: 'ict' },
  { email: 'groundwater@nwrmp.test', fullName: 'Groundwater Reviewer', role: 'department_reviewer', department: 'groundwater' },
  { email: 'shallowwells@nwrmp.test', fullName: 'Shallow Wells Reviewer', role: 'department_reviewer', department: 'shallow_wells' },
  { email: 'surfacewater@nwrmp.test', fullName: 'Surface Water Reviewer', role: 'department_reviewer', department: 'surface_water' },
  { email: 'coordinator.mj@nwrmp.test', fullName: 'Maroodi Jeex Coordinator', role: 'regional_coordinator', department: 'regional_coordination', regionCode: 'MJ' },
  { email: 'coordinator.sl@nwrmp.test', fullName: 'Sool Coordinator', role: 'regional_coordinator', department: 'regional_coordination', regionCode: 'SL' },
  { email: 'field.mj@nwrmp.test', fullName: 'Maroodi Jeex Field Officer', role: 'field_officer', regionCode: 'MJ' },
  { email: 'lab@nwrmp.test', fullName: 'Water Quality Lab Officer', role: 'lab_officer', department: 'water_quality_lab' },
  { email: 'maintenance@nwrmp.test', fullName: 'O&M Officer', role: 'maintenance_officer', department: 'operation_maintenance' },
  { email: 'viewer@nwrmp.test', fullName: 'Demo Viewer', role: 'viewer', department: 'water_research' },
];

/** Default location of the generated credentials file (git-ignored). */
export const DEMO_CREDENTIALS_FILE = path.resolve(process.cwd(), 'demo-accounts.local.txt');

/**
 * Creates any missing demo accounts with one shared, randomly generated password
 * and writes the list to a local file. Returns the emails created.
 */
export async function createDemoUsers(db: Db, file = DEMO_CREDENTIALS_FILE): Promise<string[]> {
  const regions = new Map(
    (await db.query<{ id: number; code: string }>('SELECT id, code FROM regions')).map((r) => [r.code, r.id]),
  );
  const existing = new Set((await db.query<{ email: string }>('SELECT lower(email) AS email FROM users')).map((r) => r.email));
  const missing = DEMO_USERS.filter((u) => !existing.has(u.email));
  if (missing.length === 0) return [];

  const password = generatePassword(16);
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    for (const u of missing) {
      await tx.query(
        `INSERT INTO users (email, full_name, role, department, region_id, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [u.email, u.fullName, u.role, u.department ?? null, u.regionCode ? regions.get(u.regionCode) ?? null : null, hash],
      );
    }
  });

  const lines = [
    'NWRMP demo accounts — keep this file private. It is not committed to git.',
    `Created: ${new Date().toISOString()}`,
    `Database: ${process.env.DATABASE_URL ? 'PostgreSQL (DATABASE_URL)' : 'local embedded database'}`,
    '',
    `Password for all accounts below: ${password}`,
    '',
    ...missing.map((u) => `${u.email.padEnd(30)} ${ROLE_LABELS[u.role]}${u.regionCode ? ` (${u.regionCode})` : ''}`),
    '',
  ];
  writeFileSync(file, lines.join('\n'), { flag: 'a' });
  return missing.map((u) => u.email);
}
