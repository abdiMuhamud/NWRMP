import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { approvableTypes, can, regionScope, type AuthUser } from '../auth/roles';
import { DB, type Db } from '../database/db';
import type { SourceType } from '../reference/source-types';
import { findInconsistencies } from '../sources/consistency';
import { insertSource, updateSource } from '../sources/registry-writes';
import {
  diffValues,
  isEmptyChange,
  loadCurrentValues,
  normalizeValues,
  type FieldErrors,
  type SourceValues,
} from '../sources/source-values';
import type { ListChangesQuery, SubmitChangeDto } from './changes.dto';

interface RequestRow {
  id: string;
  kind: 'create' | 'update';
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  source_id: string | null;
  source_type: SourceType;
  region_id: number;
  proposed: SourceValues;
  previous: SourceValues | null;
  base_updated_at: string | null;
  comment: string | null;
  requested_by: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
}

const LIST_COLUMNS = `
  c.id, c.kind, c.status, c.source_id AS "sourceId", c.source_type AS "sourceType",
  coalesce(s.name, c.proposed->'fields'->>'name') AS "sourceName", s.code AS "sourceCode",
  r.name AS "regionName", c.requested_at AS "requestedAt", req.full_name AS "requestedBy",
  c.reviewed_at AS "reviewedAt", rev.full_name AS "reviewedBy",
  ((SELECT count(*) FROM jsonb_object_keys(c.proposed->'fields')) +
   (SELECT count(*) FROM jsonb_object_keys(c.proposed->'details')))::int AS "fieldCount"`;

const LIST_FROM = `
  FROM change_requests c
  JOIN regions r ON r.id = c.region_id
  JOIN users req ON req.id = c.requested_by
  LEFT JOIN users rev ON rev.id = c.reviewed_by
  LEFT JOIN water_sources s ON s.id = c.source_id`;

function validationError(errors: FieldErrors): BadRequestException {
  return new BadRequestException({ message: 'Some values need attention', fieldErrors: errors });
}

@Injectable()
export class ChangesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async submit(user: AuthUser, dto: SubmitChangeDto, ip: string | null) {
    const scope = regionScope(user);

    if (dto.kind === 'create') {
      const type = dto.sourceType!;
      const { values, errors } = normalizeValues(type, { fields: dto.fields, details: dto.details }, false);
      if (Object.keys(errors).length) throw validationError(errors);
      const regionId = values.fields.region_id as number;
      await this.assertRegion(regionId);
      if (scope && regionId !== scope) throw validationError({ region_id: 'You can only register sources in your own region' });

      return this.insertRequest(user, { kind: 'create', sourceId: null, type, regionId, proposed: values, previous: null, baseUpdatedAt: null }, dto.comment, ip);
    }

    const current = await loadCurrentValues(this.db, dto.sourceId!);
    if (!current || (scope && current.regionId !== scope)) throw new NotFoundException('Water source not found');
    if ('type' in (dto.fields ?? {})) throw validationError({ type: 'The type of an existing source cannot be changed' });

    const [pending] = await this.db.query(`SELECT 1 FROM change_requests WHERE source_id = $1 AND status = 'pending'`, [dto.sourceId]);
    if (pending) throw new ConflictException('This source already has a change waiting for review');

    const { values, errors } = normalizeValues(current.type, { fields: dto.fields, details: dto.details }, true);
    if (Object.keys(errors).length) throw validationError(errors);
    const diff = diffValues(current.values, values);
    if (isEmptyChange(diff.proposed)) throw new BadRequestException('Nothing has changed');

    const regionId = (diff.proposed.fields.region_id as number | undefined) ?? current.regionId;
    if (diff.proposed.fields.region_id !== undefined) {
      await this.assertRegion(regionId);
      if (scope) throw validationError({ region_id: 'Only headquarters can move a source to another region' });
    }

    return this.insertRequest(
      user,
      { kind: 'update', sourceId: dto.sourceId!, type: current.type, regionId, proposed: diff.proposed, previous: diff.previous, baseUpdatedAt: current.updatedAt },
      dto.comment,
      ip,
    );
  }

  async list(user: AuthUser, q: ListChangesQuery) {
    const params: unknown[] = [];
    const bind = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const clauses: string[] = [];
    const scope = regionScope(user);
    if (scope) clauses.push(`c.region_id = ${bind(scope)}`);

    switch (q.box) {
      case 'review': {
        const types = approvableTypes(user);
        if (!types.length) return [];
        clauses.push(`c.status = 'pending'`, `c.source_type = ANY(${bind(`{${types.join(',')}}`)}::source_type[])`);
        break;
      }
      case 'mine':
        clauses.push(`c.requested_by = ${bind(user.id)}`);
        break;
      case 'decided':
        clauses.push(`c.status IN ('approved', 'rejected')`);
        break;
      case 'source':
        if (!q.sourceId) throw new BadRequestException('sourceId is required');
        clauses.push(`c.source_id = ${bind(q.sourceId)}`, `c.status = 'pending'`);
        break;
    }

    const order = q.box === 'review' ? 'c.requested_at ASC' : 'coalesce(c.reviewed_at, c.requested_at) DESC';
    return this.db.query(`SELECT ${LIST_COLUMNS} ${LIST_FROM} WHERE ${clauses.join(' AND ')} ORDER BY ${order} LIMIT 200`, params);
  }

  async counts(user: AuthUser) {
    const types = approvableTypes(user);
    const [row] = await this.db.query<{ toReview: number; myPending: number }>(
      `SELECT count(*) FILTER (WHERE status = 'pending' AND source_type = ANY($2::source_type[]) AND requested_by <> $1)::int AS "toReview",
              count(*) FILTER (WHERE status = 'pending' AND requested_by = $1)::int AS "myPending"
         FROM change_requests`,
      [user.id, `{${types.join(',')}}`],
    );
    return row;
  }

  async get(user: AuthUser, id: string) {
    const req = await this.load(this.db, id);
    const scope = regionScope(user);
    if (scope && req.region_id !== scope) throw new NotFoundException('Request not found');

    const [names] = await this.db.query<Record<string, string | null>>(
      `SELECT (SELECT full_name FROM users WHERE id = $1) AS requester,
              (SELECT full_name FROM users WHERE id = $2) AS reviewer,
              (SELECT name FROM regions WHERE id = $3) AS region`,
      [req.requested_by, req.reviewed_by, req.region_id],
    );

    let current: SourceValues | null = null;
    let sourceCode: string | null = null;
    let stale = false;
    if (req.source_id) {
      const loaded = await loadCurrentValues(this.db, req.source_id);
      if (loaded) {
        current = loaded.values;
        stale = req.status === 'pending' && req.kind === 'update' && req.base_updated_at !== null && loaded.updatedAt !== req.base_updated_at;
        const [row] = await this.db.query<{ code: string }>('SELECT code FROM water_sources WHERE id = $1', [req.source_id]);
        sourceCode = row?.code ?? null;
      }
    }

    // Checks run on the record as it would look after approval.
    const merged =
      req.kind === 'create' || !current
        ? { ...req.proposed.fields }
        : { ...current.fields, ...req.proposed.fields };
    const review = this.reviewPermission(user, req);

    return {
      id: req.id,
      kind: req.kind,
      status: req.status,
      sourceId: req.source_id,
      sourceCode,
      sourceType: req.source_type,
      sourceName: (req.proposed.fields.name as string | undefined) ?? (current?.fields.name as string | undefined) ?? null,
      regionId: req.region_id,
      regionName: names.region,
      proposed: req.proposed,
      previous: req.previous,
      current,
      stale,
      comment: req.comment,
      requestedBy: { id: req.requested_by, name: names.requester },
      requestedAt: req.requested_at,
      reviewedBy: req.reviewed_by ? { id: req.reviewed_by, name: names.reviewer } : null,
      reviewedAt: req.reviewed_at,
      reviewComment: req.review_comment,
      warnings: findInconsistencies(merged),
      canReview: review.allowed,
      reviewBlockedReason: review.reason,
      canWithdraw: req.status === 'pending' && req.requested_by === user.id,
    };
  }

  async approve(user: AuthUser, id: string, comment: string | undefined, ip: string | null) {
    return this.db.transaction(async (tx) => {
      const req = await this.load(tx, id, true);
      const review = this.reviewPermission(user, req);
      if (!review.allowed) throw new ForbiddenException(review.reason);

      const [requester] = await tx.query<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [req.requested_by]);
      let sourceId = req.source_id;
      let summary: string;

      if (req.kind === 'create') {
        const created = await insertSource(tx, req.source_type, req.proposed, user.id, `Registered in NWRMP by ${requester.full_name}`);
        sourceId = created.id;
        summary = `Registered ${req.proposed.fields.name} (${created.code})`;
        await tx.query('UPDATE change_requests SET source_id = $2 WHERE id = $1', [id, created.id]);
      } else {
        const current = await loadCurrentValues(tx, req.source_id!);
        if (!current) throw new NotFoundException('The water source no longer exists');
        await updateSource(tx, req.source_id!, req.proposed, req.region_id, user.id);
        const count = Object.keys(req.proposed.fields).length + Object.keys(req.proposed.details).length;
        summary = `Updated ${count} field${count === 1 ? '' : 's'}`;
      }

      await tx.query(
        `UPDATE change_requests SET status = 'approved', reviewed_by = $2, reviewed_at = now(), review_comment = $3 WHERE id = $1`,
        [id, user.id, comment?.trim() || null],
      );
      await this.audit.log(
        {
          userId: user.id,
          action: req.kind === 'create' ? 'source.create' : 'source.update',
          entityType: 'water_source',
          entityId: sourceId!,
          summary,
          changes: { requestId: id, requestedBy: requester.full_name, proposed: req.proposed, previous: req.previous },
          ip,
        },
        tx,
      );
      await this.audit.log(
        { userId: user.id, action: 'change.approve', entityType: 'change_request', entityId: id, summary: `Approved: ${summary}`, ip },
        tx,
      );
      return { id, status: 'approved', sourceId };
    });
  }

  async reject(user: AuthUser, id: string, comment: string | undefined, ip: string | null) {
    if (!comment?.trim()) throw new BadRequestException('Explain why the change is rejected');
    return this.db.transaction(async (tx) => {
      const req = await this.load(tx, id, true);
      const review = this.reviewPermission(user, req);
      if (!review.allowed) throw new ForbiddenException(review.reason);
      await tx.query(
        `UPDATE change_requests SET status = 'rejected', reviewed_by = $2, reviewed_at = now(), review_comment = $3 WHERE id = $1`,
        [id, user.id, comment.trim()],
      );
      await this.audit.log(
        { userId: user.id, action: 'change.reject', entityType: 'change_request', entityId: id, summary: `Rejected: ${comment.trim()}`, ip },
        tx,
      );
      return { id, status: 'rejected' };
    });
  }

  async withdraw(user: AuthUser, id: string, ip: string | null) {
    return this.db.transaction(async (tx) => {
      const req = await this.load(tx, id, true);
      if (req.requested_by !== user.id) throw new ForbiddenException('Only the person who submitted this can withdraw it');
      if (req.status !== 'pending') throw new ConflictException('This request has already been decided');
      await tx.query(`UPDATE change_requests SET status = 'withdrawn', reviewed_at = now() WHERE id = $1`, [id]);
      await this.audit.log(
        { userId: user.id, action: 'change.withdraw', entityType: 'change_request', entityId: id, summary: 'Withdrew request', ip },
        tx,
      );
      return { id, status: 'withdrawn' };
    });
  }

  private reviewPermission(user: AuthUser, req: RequestRow): { allowed: boolean; reason: string | null } {
    if (req.status !== 'pending') return { allowed: false, reason: 'This request has already been decided' };
    if (!can(user, 'sources.approve')) return { allowed: false, reason: 'Your role cannot approve changes' };
    if (!approvableTypes(user).includes(req.source_type)) {
      return { allowed: false, reason: 'Another department approves this type of source' };
    }
    if (req.requested_by === user.id) return { allowed: false, reason: 'You cannot approve your own request' };
    return { allowed: true, reason: null };
  }

  private async load(db: Db, id: string, forUpdate = false): Promise<RequestRow> {
    const [row] = await db.query<RequestRow>(
      `SELECT id, kind, status, source_id, source_type, region_id, proposed, previous,
              base_updated_at::text AS base_updated_at, comment, requested_by, requested_at,
              reviewed_by, reviewed_at, review_comment
         FROM change_requests WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw new NotFoundException('Request not found');
    return row;
  }

  private async assertRegion(regionId: number) {
    const [r] = await this.db.query('SELECT 1 FROM regions WHERE id = $1', [regionId]);
    if (!r) throw validationError({ region_id: 'Unknown region' });
  }

  private async insertRequest(
    user: AuthUser,
    r: {
      kind: 'create' | 'update';
      sourceId: string | null;
      type: SourceType;
      regionId: number;
      proposed: SourceValues;
      previous: SourceValues | null;
      baseUpdatedAt: string | null;
    },
    comment: string | undefined,
    ip: string | null,
  ) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.query<{ id: string }>(
        `INSERT INTO change_requests (kind, source_id, source_type, region_id, proposed, previous, base_updated_at, comment, requested_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::timestamptz, $8, $9)
         RETURNING id`,
        [
          r.kind,
          r.sourceId,
          r.type,
          r.regionId,
          JSON.stringify(r.proposed),
          r.previous ? JSON.stringify(r.previous) : null,
          r.baseUpdatedAt,
          comment?.trim() || null,
          user.id,
        ],
      );
      const what = r.kind === 'create' ? `new source "${r.proposed.fields.name}"` : 'changes to an existing source';
      await this.audit.log(
        { userId: user.id, action: 'change.submit', entityType: 'change_request', entityId: row.id, summary: `Submitted ${what} for approval`, ip },
        tx,
      );
      return { id: row.id, status: 'pending' };
    });
  }
}
