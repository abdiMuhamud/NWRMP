import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { can, regionScope, type AuthUser } from '../auth/roles';
import { DB, type Db } from '../database/db';
import { updateSource } from '../sources/registry-writes';
import { diffValues, isEmptyChange, loadCurrentValues, type Value } from '../sources/source-values';
import type { CompleteWorkOrderDto, ReportWorkOrderDto } from './maintenance.dto';
import { categoryLabel } from './work-order-options';

type Status = 'open' | 'assigned' | 'in_progress' | 'completed' | 'closed' | 'cancelled';
const ACTIVE: Status[] = ['open', 'assigned', 'in_progress'];

interface WorkOrderRow {
  id: string;
  ref: string;
  status: Status;
  title: string;
  category: string;
  source_id: string;
  source_name: string;
  region_id: number;
  reported_by: string;
  assigned_to: string | null;
  completed_by: string | null;
  completed_on: string | null;
  work_done: string | null;
  performed_by: string | null;
  working_after: boolean | null;
}

const REF = `'WO-' || lpad(w.ref_no::text, 5, '0')`;

const LIST_FROM = `
  FROM work_orders w
  JOIN water_sources s ON s.id = w.source_id
  JOIN regions r ON r.id = s.region_id
  LEFT JOIN users rp ON rp.id = w.reported_by
  LEFT JOIN users asg ON asg.id = w.assigned_to`;

const LIST_COLUMNS = `w.id, ${REF} AS ref, w.status, w.priority, w.category, w.title,
  w.reported_at AS "reportedAt", w.assigned_at AS "assignedAt", w.completed_at AS "completedAt", w.closed_at AS "closedAt",
  rp.full_name AS "reportedBy", asg.full_name AS "assignedTo", w.assigned_to AS "assignedToId",
  w.working_after AS "workingAfter",
  s.id AS "sourceId", s.code, s.name, s.type, s.status AS "sourceStatus", s.region_id AS "regionId", r.name AS region`;

const PRIORITY_ORDER = `CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`;

const today = () => new Date().toISOString().slice(0, 10);

/** Maintenance work orders: a breakdown reported, repaired by O&M, and closed by the regional coordinator. */
@Injectable()
export class MaintenanceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, box: 'active' | 'mine' | 'to_close' | 'closed' | 'source', sourceId?: string) {
    const params: unknown[] = [];
    const scope = regionScope(user);
    let where: string;
    let order = `${PRIORITY_ORDER}, w.reported_at ASC`;
    if (box === 'mine') {
      where = `w.assigned_to = $${params.push(user.id)} AND w.status IN ('assigned', 'in_progress', 'completed')`;
      order = `(w.status = 'completed'), ${PRIORITY_ORDER}, w.reported_at ASC`;
    } else if (box === 'to_close') {
      if (!can(user, 'maintenance.close')) return [];
      where = `w.status = 'completed'`;
      order = 'w.completed_at ASC';
    } else if (box === 'closed') {
      where = `w.status IN ('closed', 'cancelled')`;
      order = 'coalesce(w.closed_at, w.updated_at) DESC';
    } else if (box === 'source') {
      if (!sourceId) throw new BadRequestException('sourceId is required');
      where = `w.source_id = $${params.push(sourceId)}`;
      order = `(w.status IN ('closed', 'cancelled')), w.reported_at DESC`;
    } else {
      where = `w.status IN ('open', 'assigned', 'in_progress', 'completed')`;
    }
    if (scope) where += ` AND s.region_id = $${params.push(scope)}`;
    return this.db.query(`SELECT ${LIST_COLUMNS} ${LIST_FROM} WHERE ${where} ORDER BY ${order} LIMIT 200`, params);
  }

  async counts(user: AuthUser) {
    const scope = regionScope(user);
    const [row] = await this.db.query<{ unassigned: number; mine: number; toClose: number; active: number }>(
      `SELECT count(*) FILTER (WHERE w.status = 'open')::int AS unassigned,
              count(*) FILTER (WHERE w.assigned_to = $1 AND w.status IN ('assigned', 'in_progress'))::int AS mine,
              count(*) FILTER (WHERE w.status = 'completed' AND w.completed_by IS DISTINCT FROM $1)::int AS "toClose",
              count(*) FILTER (WHERE w.status IN ('open', 'assigned', 'in_progress', 'completed'))::int AS active
         FROM work_orders w JOIN water_sources s ON s.id = w.source_id
        WHERE ($2::smallint IS NULL OR s.region_id = $2)`,
      [user.id, scope],
    );
    return {
      ...row,
      unassigned: can(user, 'maintenance.work') ? row.unassigned : 0,
      toClose: can(user, 'maintenance.close') ? row.toClose : 0,
    };
  }

  async get(user: AuthUser, id: string) {
    const [row] = await this.db.query<Record<string, unknown> & { status: Status; reportedById: string; completedById: string | null }>(
      `SELECT ${LIST_COLUMNS}, w.description, w.inspection_id AS "inspectionId",
              w.reported_by AS "reportedById", w.started_at AS "startedAt",
              w.work_done AS "workDone", w.completed_on::text AS "completedOn", w.parts_used AS "partsUsed",
              w.cost_usd::float8 AS "costUsd", w.performed_by AS "performedBy",
              w.completed_by AS "completedById", cb.full_name AS "completedBy",
              cl.full_name AS "closedBy", w.close_comment AS "closeComment", w.cancelled_reason AS "cancelledReason"
         ${LIST_FROM}
         LEFT JOIN users cb ON cb.id = w.completed_by
         LEFT JOIN users cl ON cl.id = w.closed_by
        WHERE w.id = $1 AND ($2::smallint IS NULL OR s.region_id = $2)`,
      [id, regionScope(user)],
    );
    if (!row) throw new NotFoundException('Work order not found');
    const timeline = await this.db.query(
      `SELECT a.id::text AS id, a.at, a.action, a.summary, u.full_name AS "userName"
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.entity_type = 'work_order' AND a.entity_id = $1
        ORDER BY a.at, a.id`,
      [id],
    );
    const rights = this.rights(user, {
      status: row.status,
      reported_by: row.reportedById,
      assigned_to: row.assignedToId as string | null,
      completed_by: row.completedById,
    });
    return { ...row, categoryLabel: categoryLabel(row.category as string), timeline, ...rights };
  }

  /** Maintenance officers who can be given work orders. */
  technicians() {
    return this.db.query(
      `SELECT id, full_name AS "fullName", email,
              (SELECT count(*) FROM work_orders w WHERE w.assigned_to = u.id AND w.status IN ('assigned', 'in_progress'))::int AS "openJobs"
         FROM users u
        WHERE u.is_active AND u.role = 'maintenance_officer'
        ORDER BY u.full_name`,
    );
  }

  // ---------------------------------------------------------------- actions

  async report(user: AuthUser, dto: ReportWorkOrderDto, ip: string | null) {
    const [source] = await this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM water_sources WHERE id = $1 AND ($2::smallint IS NULL OR region_id = $2)',
      [dto.sourceId, regionScope(user)],
    );
    if (!source) throw new NotFoundException('Water source not found');
    const [dup] = await this.db.query<{ ref: string }>(
      `SELECT ${REF} AS ref FROM work_orders w WHERE w.source_id = $1 AND w.category = $2 AND w.status NOT IN ('closed', 'cancelled')`,
      [source.id, dto.category],
    );
    if (dup) throw new ConflictException(`This problem is already reported for ${source.name} (${dup.ref})`);
    if (dto.inspectionId) {
      const [ins] = await this.db.query('SELECT 1 FROM inspections WHERE id = $1 AND source_id = $2', [dto.inspectionId, source.id]);
      if (!ins) throw new BadRequestException('The inspection does not belong to this source');
    }

    const [row] = await this.db.query<{ id: string; ref: string }>(
      `INSERT INTO work_orders (source_id, category, priority, title, description, inspection_id, reported_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, 'WO-' || lpad(ref_no::text, 5, '0') AS ref`,
      [source.id, dto.category, dto.priority, dto.title.trim(), dto.description?.trim() || null, dto.inspectionId ?? null, user.id],
    );
    await this.audit.log({
      userId: user.id,
      action: 'workorder.report',
      entityType: 'work_order',
      entityId: row.id,
      summary: `Reported ${row.ref}: ${dto.title.trim()} at ${source.name} (${categoryLabel(dto.category)}, ${dto.priority})`,
      ip,
    });
    return { id: row.id, ref: row.ref, status: 'open' };
  }

  async assign(user: AuthUser, id: string, assigneeId: string, ip: string | null) {
    const wo = await this.load(user, id);
    if (!can(user, 'maintenance.work')) throw new ForbiddenException('You cannot assign maintenance work');
    if (!ACTIVE.includes(wo.status)) throw new ConflictException('This work order can no longer be assigned');
    const [tech] = await this.db.query<{ full_name: string }>(
      `SELECT full_name FROM users WHERE id = $1 AND is_active AND role = 'maintenance_officer'`,
      [assigneeId],
    );
    if (!tech) throw new BadRequestException('Choose an active maintenance officer');
    // A job already started stays in progress when it changes hands.
    await this.db.query(
      `UPDATE work_orders
          SET assigned_to = $2, assigned_by = $3, assigned_at = now(),
              status = CASE WHEN status = 'in_progress' THEN 'in_progress'::work_order_status ELSE 'assigned' END, updated_at = now()
        WHERE id = $1`,
      [id, assigneeId, user.id],
    );
    const self = assigneeId === user.id;
    await this.audit.log({
      userId: user.id,
      action: 'workorder.assign',
      entityType: 'work_order',
      entityId: id,
      summary: self ? `Took ${wo.ref}` : `Assigned ${wo.ref} to ${tech.full_name}`,
      ip,
    });
    return { id, status: wo.status === 'in_progress' ? 'in_progress' : 'assigned' };
  }

  async start(user: AuthUser, id: string, ip: string | null) {
    const wo = await this.load(user, id);
    if (wo.assigned_to !== user.id) throw new ForbiddenException('Only the assigned maintenance officer can start this job');
    if (wo.status !== 'assigned') throw new ConflictException('This job is not waiting to start');
    await this.db.query(`UPDATE work_orders SET status = 'in_progress', started_at = now(), updated_at = now() WHERE id = $1`, [id]);
    await this.audit.log({ userId: user.id, action: 'workorder.start', entityType: 'work_order', entityId: id, summary: `Started work on ${wo.ref}`, ip });
    return { id, status: 'in_progress' };
  }

  async complete(user: AuthUser, id: string, dto: CompleteWorkOrderDto, ip: string | null) {
    const wo = await this.load(user, id);
    if (wo.assigned_to !== user.id && user.role !== 'admin') throw new ForbiddenException('Only the assigned maintenance officer can complete this job');
    if (wo.status !== 'assigned' && wo.status !== 'in_progress') throw new ConflictException('This job cannot be completed now');
    if (dto.completedOn > today()) {
      throw new BadRequestException({ message: 'Some values need attention', fieldErrors: { completedOn: 'Date cannot be in the future' } });
    }
    await this.db.query(
      `UPDATE work_orders
          SET status = 'completed', completed_by = $2, completed_at = now(), work_done = $3, completed_on = $4,
              parts_used = $5, cost_usd = $6, performed_by = $7, working_after = $8,
              started_at = coalesce(started_at, now()), close_comment = NULL, updated_at = now()
        WHERE id = $1`,
      [id, user.id, dto.workDone.trim(), dto.completedOn, dto.partsUsed?.trim() || null, dto.costUsd ?? null, dto.performedBy?.trim() || null, dto.workingAfter],
    );
    await this.audit.log({
      userId: user.id,
      action: 'workorder.complete',
      entityType: 'work_order',
      entityId: id,
      summary: `Completed ${wo.ref}: ${dto.workingAfter ? 'source working again' : 'source still not working'}`,
      changes: { ...dto },
      ip,
    });
    return { id, status: 'completed' };
  }

  /** Confirms the repair: the source's status follows the outcome and the repair joins its history. */
  async close(user: AuthUser, id: string, comment: string | undefined, ip: string | null) {
    return this.db.transaction(async (tx) => {
      const wo = await this.load(user, id, tx);
      const rights = this.rights(user, wo);
      if (!rights.canClose) throw new ForbiddenException(rights.closeBlockedReason ?? 'You cannot close this work order');

      const current = await loadCurrentValues(tx, wo.source_id);
      if (!current) throw new NotFoundException('The water source no longer exists');
      const fields: Record<string, Value> = wo.working_after
        ? { status: 'functioning', status_reason: null }
        : { status: 'non_functioning', status_reason: `${wo.title} (not repaired, ${wo.ref})` };
      const diff = diffValues(current.values, { fields, details: {} });
      if (!isEmptyChange(diff.proposed)) await updateSource(tx, wo.source_id, diff.proposed, current.regionId, user.id);

      const [intervention] = await tx.query<{ id: string }>(
        `INSERT INTO interventions (source_id, performed_on, agency, description) VALUES ($1, $2, $3, $4) RETURNING id`,
        [wo.source_id, wo.completed_on, wo.performed_by, `${wo.ref} ${categoryLabel(wo.category)}: ${wo.work_done ?? wo.title}`],
      );
      await tx.query(
        `UPDATE work_orders SET status = 'closed', closed_by = $2, closed_at = now(), close_comment = $3, intervention_id = $4, updated_at = now() WHERE id = $1`,
        [id, user.id, comment?.trim() || null, intervention.id],
      );

      const [completer] = await tx.query<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [wo.completed_by]);
      const summary = `Repair ${wo.ref}: ${wo.title}, ${wo.working_after ? 'working again' : 'not repaired'}`;
      await this.audit.log(
        {
          userId: user.id,
          action: 'source.repair',
          entityType: 'water_source',
          entityId: wo.source_id,
          summary,
          changes: { workOrderId: id, requestedBy: completer?.full_name, proposed: diff.proposed, previous: diff.previous },
          ip,
        },
        tx,
      );
      await this.audit.log({ userId: user.id, action: 'workorder.close', entityType: 'work_order', entityId: id, summary: `Closed: ${summary}`, ip }, tx);
      return { id, status: 'closed', sourceId: wo.source_id };
    });
  }

  async reopen(user: AuthUser, id: string, comment: string | undefined, ip: string | null) {
    if (!comment?.trim()) throw new BadRequestException('Explain what still needs to be done');
    const wo = await this.load(user, id);
    const rights = this.rights(user, wo);
    if (!rights.canReopen) throw new ForbiddenException(rights.closeBlockedReason ?? 'You cannot reopen this work order');
    await this.db.query(`UPDATE work_orders SET status = 'in_progress', close_comment = $2, updated_at = now() WHERE id = $1`, [id, comment.trim()]);
    await this.audit.log({ userId: user.id, action: 'workorder.reopen', entityType: 'work_order', entityId: id, summary: `Reopened ${wo.ref}: ${comment.trim()}`, ip });
    return { id, status: 'in_progress' };
  }

  async cancel(user: AuthUser, id: string, reason: string, ip: string | null) {
    const wo = await this.load(user, id);
    if (!this.rights(user, wo).canCancel) throw new ForbiddenException('You cannot cancel this work order');
    await this.db.query(`UPDATE work_orders SET status = 'cancelled', cancelled_reason = $2, closed_by = $3, closed_at = now(), updated_at = now() WHERE id = $1`, [
      id,
      reason.trim(),
      user.id,
    ]);
    await this.audit.log({ userId: user.id, action: 'workorder.cancel', entityType: 'work_order', entityId: id, summary: `Cancelled ${wo.ref}: ${reason.trim()}`, ip });
    return { id, status: 'cancelled' };
  }

  // ---------------------------------------------------------------- helpers

  private rights(user: AuthUser, wo: Pick<WorkOrderRow, 'status' | 'reported_by' | 'assigned_to' | 'completed_by'>) {
    const active = ACTIVE.includes(wo.status);
    const closer = can(user, 'maintenance.close') && wo.status === 'completed';
    const ownWork = wo.completed_by === user.id;
    return {
      canAssign: can(user, 'maintenance.work') && active,
      canTake: user.role === 'maintenance_officer' && wo.status === 'open',
      canStart: wo.assigned_to === user.id && wo.status === 'assigned',
      canComplete: (wo.assigned_to === user.id || user.role === 'admin') && (wo.status === 'assigned' || wo.status === 'in_progress'),
      canClose: closer && !ownWork,
      canReopen: closer && !ownWork,
      closeBlockedReason: closer && ownWork ? 'You cannot close a repair you completed yourself' : null,
      canCancel: active && (can(user, 'maintenance.work') || can(user, 'maintenance.close') || (wo.reported_by === user.id && wo.status === 'open')),
    };
  }

  private async load(user: AuthUser, id: string, db: Db = this.db): Promise<WorkOrderRow> {
    const [row] = await db.query<WorkOrderRow>(
      `SELECT w.id, ${REF} AS ref, w.status, w.title, w.category, w.source_id, s.name AS source_name, s.region_id,
              w.reported_by, w.assigned_to, w.completed_by, w.completed_on::text AS completed_on,
              w.work_done, w.performed_by, w.working_after
         FROM work_orders w JOIN water_sources s ON s.id = w.source_id
        WHERE w.id = $1 AND ($2::smallint IS NULL OR s.region_id = $2)
        ${db === this.db ? '' : 'FOR UPDATE OF w'}`,
      [id, regionScope(user)],
    );
    if (!row) throw new NotFoundException('Work order not found');
    return row;
  }
}
