import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DB, type Db } from '../database/db';
import { SESSION_HOURS } from './cookies';
import { DUMMY_HASH, hashPassword, hashToken, newSessionToken, passwordProblem, verifyPassword } from './passwords';
import { approvableTypes, permissionsFor, ROLE_LABELS, type AuthUser, type Department, type Role } from './roles';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  department: Department | null;
  region_id: number | null;
  must_change_password: boolean;
  password_hash: string;
  is_active: boolean;
  failed_logins: number;
  locked_until: string | Date | null;
}

const toAuthUser = (u: UserRow): AuthUser => ({
  id: u.id,
  email: u.email,
  fullName: u.full_name,
  role: u.role,
  department: u.department,
  regionId: u.region_id,
  mustChangePassword: u.must_change_password,
});

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, meta: { ip: string | null; userAgent: string | null }) {
    const [user] = await this.db.query<UserRow>('SELECT * FROM users WHERE lower(email) = lower($1)', [email.trim()]);

    // Same work whether or not the email exists, so response time does not reveal accounts.
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);

    if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new HttpException(`Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!user || !ok || !user.is_active) {
      if (user) {
        await this.db.query(
          `UPDATE users
              SET failed_logins = failed_logins + 1,
                  locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
            WHERE id = $1`,
          [user.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
        );
      }
      await this.audit.log({
        userId: user?.id ?? null,
        action: 'auth.login_failed',
        summary: `Failed sign-in for ${email.trim().toLowerCase()}`,
        ip: meta.ip,
      });
      throw new UnauthorizedException('Email or password is incorrect');
    }

    const { token, hash } = newSessionToken();
    await this.db.transaction(async (tx) => {
      await tx.query('DELETE FROM sessions WHERE user_id = $1 AND expires_at < now()', [user.id]);
      await tx.query(
        `INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent)
         VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5)`,
        [hash, user.id, SESSION_HOURS, meta.ip, meta.userAgent],
      );
      await tx.query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
      await this.audit.log({ userId: user.id, action: 'auth.login', summary: `${user.full_name} signed in`, ip: meta.ip }, tx);
    });
    return { token, user: toAuthUser(user) };
  }

  async logout(token: string, meta: { ip: string | null }) {
    const [row] = await this.db.query<{ user_id: string }>('DELETE FROM sessions WHERE token_hash = $1 RETURNING user_id', [hashToken(token)]);
    if (row) await this.audit.log({ userId: row.user_id, action: 'auth.logout', summary: 'Signed out', ip: meta.ip });
  }

  async userForSession(token: string): Promise<AuthUser | null> {
    const [user] = await this.db.query<UserRow>(
      `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active`,
      [hashToken(token)],
    );
    return user ? toAuthUser(user) : null;
  }

  async changePassword(user: AuthUser, currentPassword: string, newPassword: string, currentToken: string | null, ip: string | null) {
    const [row] = await this.db.query<UserRow>('SELECT * FROM users WHERE id = $1', [user.id]);
    if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    const problem = passwordProblem(newPassword, row.email);
    if (problem) throw new BadRequestException(problem);
    if (currentPassword === newPassword) throw new BadRequestException('Choose a password different from the current one');

    const hash = await hashPassword(newPassword);
    await this.db.transaction(async (tx) => {
      await tx.query('UPDATE users SET password_hash = $2, must_change_password = false, updated_at = now() WHERE id = $1', [user.id, hash]);
      // Sign out other devices; keep the current session.
      await tx.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [user.id, currentToken ? hashToken(currentToken) : '']);
      await this.audit.log({ userId: user.id, action: 'auth.password_change', summary: 'Changed own password', ip }, tx);
    });
  }

  async me(user: AuthUser) {
    const [region] = user.regionId
      ? await this.db.query<{ name: string }>('SELECT name FROM regions WHERE id = $1', [user.regionId])
      : [];
    return {
      user: { ...user, roleLabel: ROLE_LABELS[user.role], regionName: region?.name ?? null },
      permissions: permissionsFor(user),
      approvableTypes: approvableTypes(user),
    };
  }
}
