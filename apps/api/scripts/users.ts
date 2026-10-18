// User administration from the command line (works against DATABASE_URL or the local database).
//
//   npm run users:demo
//       Create the demo accounts (one per role). Sign-in details go to demo-accounts.local.txt.
//
//   npm run users:create -- --email jane@example.org --name "Jane Doe" --role admin [--department ict] [--region MJ]
//       Create one user with a temporary password (they must change it at first sign-in).
import 'dotenv/config';
import { createDemoUsers, DEMO_CREDENTIALS_FILE } from '../src/auth/demo-users';
import { generatePassword, hashPassword } from '../src/auth/passwords';
import { DEPARTMENT_CODES, REGION_SCOPED_ROLES, ROLES, type Department, type Role } from '../src/auth/roles';
import { createDb } from '../src/database/db';
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

    console.log('Usage: users.ts demo | create --email <email> --name <name> --role <role> [--department <code>] [--region <code>]');
  } finally {
    await db.close();
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
