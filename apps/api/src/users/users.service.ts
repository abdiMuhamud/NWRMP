import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { generatePassword, hashPassword } from '../auth/passwords';
import {
  DEPARTMENT_SOURCE_TYPES,
  REGION_SCOPED_ROLES,
  ROLE_LABELS,
  type AuthUser,
  type Department,
  type Role,
} from '../auth/roles';
import { DB, type Db } from '../database/db';
import type { CreateUserDto, UpdateUserDto } from './users.dto';

const USER_COLUMNS = `
  u.id, u.email, u.full_name AS "fullName", u.phone, u.role, u.department,
  u.region_id AS "regionId", r.name AS "regionName", u.is_active AS "isActive",
  u.must_change_password AS "mustChangePassword", u.last_login_at AS "lastLoginAt",
  u.created_at AS "createdAt", (u.locked_until IS NOT NULL AND u.locked_until > now()) AS locked`;

interface Assignment {
  role: Role;
  department: Department | null;
  regionId: number | null;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list() {
    return this.db.query(
      `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN regions r ON r.id = u.region_id
        ORDER BY u.is_active DESC, u.full_name`,
    );
  }

  async get(id: string) {
    const [user] = await this.db.query(`SELECT ${USER_COLUMNS} FROM users u LEFT JOIN regions r ON r.id = u.region_id WHERE u.id = $1`, [id]);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, actor: AuthUser, ip: string | null) {
    const assignment = this.checkAssignment({ role: dto.role, department: dto.department ?? null, regionId: dto.regionId ?? null });
    const email = dto.email.trim().toLowerCase();
    const [exists] = await this.db.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
    if (exists) throw new ConflictException('A user with this email already exists');

    const temporaryPassword = generatePassword();
    const hash = await hashPassword(temporaryPassword);
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx.query<{ id: string }>(
        `INSERT INTO users (email, full_name, phone, role, department, region_id, password_hash, must_change_password, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8) RETURNING id`,
        [email, dto.fullName.trim(), dto.phone?.trim() || null, assignment.role, assignment.department, assignment.regionId, hash, actor.id],
      );
      await this.audit.log(
        {
          userId: actor.id,
          action: 'user.create',
          entityType: 'user',
          entityId: row.id,
          summary: `Created user ${dto.fullName.trim()} (${ROLE_LABELS[assignment.role]})`,
          changes: { email, ...assignment },
          ip,
        },
        tx,
      );
      return row.id;
    });
    return { user: await this.get(id), temporaryPassword };
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser, ip: string | null) {
    const [current] = await this.db.query<Assignment & { fullName: string; phone: string | null; isActive: boolean }>(
      `SELECT role, department, region_id AS "regionId", full_name AS "fullName", phone, is_active AS "isActive"
         FROM users WHERE id = $1`,
      [id],
    );
    if (!current) throw new NotFoundException('User not found');

    if (id === actor.id && ((dto.role && dto.role !== 'admin') || dto.isActive === false)) {
      throw new BadRequestException('You cannot remove your own administrator access');
    }

    const next = this.checkAssignment({
      role: dto.role ?? current.role,
      department: dto.department !== undefined ? dto.department : current.department,
      regionId: dto.regionId !== undefined ? dto.regionId : current.regionId,
    });
    const values = {
      fullName: dto.fullName?.trim() ?? current.fullName,
      phone: dto.phone !== undefined ? dto.phone?.trim() || null : current.phone,
      isActive: dto.isActive ?? current.isActive,
      ...next,
    };

    const changes: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of Object.keys(values) as (keyof typeof values)[]) {
      if (values[key] !== current[key]) changes[key] = { before: current[key], after: values[key] };
    }
    if (Object.keys(changes).length === 0) return this.get(id);

    await this.db.transaction(async (tx) => {
      await tx.query(
        `UPDATE users SET full_name = $2, phone = $3, role = $4, department = $5, region_id = $6, is_active = $7, updated_at = now()
          WHERE id = $1`,
        [id, values.fullName, values.phone, values.role, values.department, values.regionId, values.isActive],
      );
      // A deactivated user, or one whose access changed, must sign in again.
      if (changes.isActive || changes.role || changes.regionId || changes.department) {
        await tx.query('DELETE FROM sessions WHERE user_id = $1', [id]);
      }
      const what = changes.isActive ? (values.isActive ? 'Reactivated' : 'Deactivated') : 'Updated';
      await this.audit.log(
        { userId: actor.id, action: 'user.update', entityType: 'user', entityId: id, summary: `${what} user ${values.fullName}`, changes, ip },
        tx,
      );
    });
    return this.get(id);
  }

  async resetPassword(id: string, actor: AuthUser, ip: string | null) {
    const user = (await this.get(id)) as { fullName: string };
    const temporaryPassword = generatePassword();
    const hash = await hashPassword(temporaryPassword);
    await this.db.transaction(async (tx) => {
      await tx.query(
        `UPDATE users SET password_hash = $2, must_change_password = true, failed_logins = 0, locked_until = NULL, updated_at = now()
          WHERE id = $1`,
        [id, hash],
      );
      await tx.query('DELETE FROM sessions WHERE user_id = $1', [id]);
      await this.audit.log(
        { userId: actor.id, action: 'user.reset_password', entityType: 'user', entityId: id, summary: `Reset password for ${user.fullName}`, ip },
        tx,
      );
    });
    return { temporaryPassword };
  }

  /** Enforces which roles need a region or a department. */
  private checkAssignment(a: Assignment): Assignment {
    if (REGION_SCOPED_ROLES.includes(a.role)) {
      if (!a.regionId) throw new BadRequestException(`A ${ROLE_LABELS[a.role].toLowerCase()} must be assigned to a region`);
    } else {
      a = { ...a, regionId: null };
    }
    if (a.role === 'department_reviewer' && !(a.department && DEPARTMENT_SOURCE_TYPES[a.department])) {
      throw new BadRequestException('A department reviewer must belong to Groundwater, Shallow wells or Surface water');
    }
    return a;
  }
}
