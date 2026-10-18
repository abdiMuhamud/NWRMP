import { Inject, Injectable } from '@nestjs/common';
import { DB, type Db } from '../database/db';

export interface AuditEntry {
  userId: string | null;
  /** Dotted action name, e.g. "auth.login", "user.create", "change.approve" */
  action: string;
  entityType?: string;
  entityId?: string;
  summary: string;
  changes?: unknown;
  ip?: string | null;
}

export interface AuditQuery {
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Records an action. Pass the transaction so the entry commits (or rolls back) with the change. */
  async log(entry: AuditEntry, tx: Db = this.db): Promise<void> {
    await tx.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, summary, changes, ip)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        entry.userId,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        entry.summary,
        entry.changes === undefined ? null : JSON.stringify(entry.changes),
        entry.ip ?? null,
      ],
    );
  }

  async list(q: AuditQuery) {
    const params: unknown[] = [];
    const clauses: string[] = [];
    const bind = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    if (q.action) clauses.push(`a.action LIKE ${bind(`${q.action.replace(/[\\%_]/g, '\\$&')}%`)}`);
    if (q.entityType) clauses.push(`a.entity_type = ${bind(q.entityType)}`);
    if (q.entityId) clauses.push(`a.entity_id = ${bind(q.entityId)}`);
    if (q.userId) clauses.push(`a.user_id = ${bind(q.userId)}`);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const [{ total }] = await this.db.query<{ total: number }>(`SELECT count(*)::int AS total FROM audit_log a ${where}`, params);
    const items = await this.db.query(
      `SELECT a.id::text AS id, a.at, a.action, a.entity_type AS "entityType", a.entity_id AS "entityId",
              a.summary, a.changes, a.ip, u.id AS "userId", u.full_name AS "userName"
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.user_id
         ${where}
        ORDER BY a.at DESC, a.id DESC
        LIMIT ${bind(q.pageSize)} OFFSET ${bind((q.page - 1) * q.pageSize)}`,
      params,
    );
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  /** Change history of one record, newest first. */
  history(entityType: string, entityId: string) {
    return this.db.query(
      `SELECT a.id::text AS id, a.at, a.action, a.summary, a.changes, u.full_name AS "userName"
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.user_id
        WHERE a.entity_type = $1 AND a.entity_id = $2
        ORDER BY a.at DESC, a.id DESC
        LIMIT 100`,
      [entityType, entityId],
    );
  }
}
