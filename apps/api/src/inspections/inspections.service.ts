import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { can, regionScope, type AuthUser } from '../auth/roles';
import { DB, type Db } from '../database/db';
import { INSPECTION_FIELD_KEYS } from '../reference/source-fields';
import type { SourceType } from '../reference/source-types';
import { findInconsistencies } from '../sources/consistency';
import { updateSource } from '../sources/registry-writes';
import { diffValues, isEmptyChange, loadCurrentValues, normalizeValues, type Value } from '../sources/source-values';
import type { AssignDto, CreateInspectionDto, GpsDto, UpdateInspectionDto } from './inspections.dto';
import { ALLOWED_PHOTO_TYPES, deletePhoto, readPhoto, storePhoto, type Storage } from './photo-storage';

const MAX_PHOTOS = 8;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** GPS further than this from the registered point is flagged for the reviewer. */
const FAR_FROM_SOURCE_M = 500;
const INSPECTOR_ROLES = ['field_officer', 'regional_coordinator'];
const FIELD_KEYS = new Set(INSPECTION_FIELD_KEYS);

interface InspectionRow {
  id: string;
  source_id: string;
  state: 'draft' | 'submitted' | 'approved' | 'returned';
  inspector_id: string | null;
  assignment_id: string | null;
  inspected_on: string;
  observed: Record<string, Value> | null;
  notes: string | null;
  region_id: number;
  type: SourceType;
  gps_lat: number | null;
  gps_lng: number | null;
}

const LIST_COLUMNS = `
  i.id, i.state, i.inspected_on::text AS "inspectedOn", i.submitted_at AS "submittedAt", i.reviewed_at AS "reviewedAt",
  ins.full_name AS inspector, rev.full_name AS reviewer,
  s.id AS "sourceId", s.code, s.name, s.type, r.name AS region,
  (SELECT count(*) FROM inspection_photos p WHERE p.inspection_id = i.id)::int AS "photoCount",
  CASE WHEN i.gps IS NULL THEN NULL ELSE round(ST_Distance(i.gps, s.location))::int END AS "distanceM"`;

const LIST_FROM = `
  FROM inspections i
  JOIN water_sources s ON s.id = i.source_id
  JOIN regions r ON r.id = s.region_id
  LEFT JOIN users ins ON ins.id = i.inspector_id
  LEFT JOIN users rev ON rev.id = i.reviewed_by`;

@Injectable()
export class InspectionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- assignments

  async listAssignments(user: AuthUser, box: 'mine' | 'team') {
    const params: unknown[] = [];
    let where: string;
    if (box === 'mine') {
      params.push(user.id);
      where = `a.assigned_to = $1 AND a.status IN ('open', 'submitted')`;
    } else {
      if (!can(user, 'inspections.assign')) throw new ForbiddenException('You do not have permission to do this');
      const scope = regionScope(user);
      where = `a.status IN ('open', 'submitted')${scope ? ` AND s.region_id = $${params.push(scope)}` : ''}`;
    }

    const rows = await this.db.query<Record<string, unknown> & { sourceRow: Record<string, Value> }>(
      `SELECT a.id, a.status, a.due_on::text AS "dueOn", a.notes, a.created_at AS "createdAt",
              ab.full_name AS "assignedBy", at.full_name AS "assignedTo",
              s.id AS "sourceId", s.code, s.name, s.type, s.settlement, d.name AS district, r.name AS region,
              ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng,
              to_jsonb(s) - 'location' AS "sourceRow",
              li.id AS "inspectionId", li.state AS "inspectionState", li.review_comment AS "reviewComment"
         FROM inspection_assignments a
         JOIN water_sources s ON s.id = a.source_id
         JOIN regions r ON r.id = s.region_id
         LEFT JOIN districts d ON d.id = s.district_id
         LEFT JOIN users ab ON ab.id = a.assigned_by
         LEFT JOIN users at ON at.id = a.assigned_to
         LEFT JOIN LATERAL (
           SELECT id, state, review_comment FROM inspections WHERE assignment_id = a.id ORDER BY created_at DESC LIMIT 1
         ) li ON true
        WHERE ${where}
        ORDER BY a.due_on NULLS LAST, a.created_at`,
      params,
    );

    // Current values of the inspection fields, so the form can be filled in offline.
    return rows.map(({ sourceRow, ...rest }) => ({
      ...rest,
      current: Object.fromEntries(INSPECTION_FIELD_KEYS.map((k) => [k, sourceRow[k] ?? null])),
    }));
  }

  /** People who can be given an inspection in a region. */
  inspectors(user: AuthUser, regionId?: number) {
    const region = regionScope(user) ?? regionId ?? null;
    return this.db.query(
      `SELECT u.id, u.full_name AS "fullName", u.role, r.name AS region,
              (SELECT count(*) FROM inspection_assignments a WHERE a.assigned_to = u.id AND a.status = 'open')::int AS "openAssignments"
         FROM users u
         LEFT JOIN regions r ON r.id = u.region_id
        WHERE u.is_active AND u.role::text = ANY($1::text[]) AND ($2::smallint IS NULL OR u.region_id = $2)
        ORDER BY u.role DESC, u.full_name`,
      [`{${INSPECTOR_ROLES.join(',')}}`, region],
    );
  }

  async assign(user: AuthUser, dto: AssignDto, ip: string | null) {
    const scope = regionScope(user);
    const [assignee] = await this.db.query<{ id: string; role: string; region_id: number | null; full_name: string; is_active: boolean }>(
      'SELECT id, role, region_id, full_name, is_active FROM users WHERE id = $1',
      [dto.assignedTo],
    );
    if (!assignee || !assignee.is_active || !INSPECTOR_ROLES.includes(assignee.role)) {
      throw new BadRequestException('Choose an active field officer or regional coordinator');
    }

    const sources = await this.db.query<{ id: string; region_id: number; name: string; active: boolean }>(
      `SELECT s.id, s.region_id, s.name,
              EXISTS (SELECT 1 FROM inspection_assignments a WHERE a.source_id = s.id AND a.status IN ('open', 'submitted')) AS active
         FROM water_sources s WHERE s.id = ANY($1::uuid[])`,
      [`{${dto.sourceIds.join(',')}}`],
    );

    const skipped: { sourceId: string; name?: string; reason: string }[] = [];
    const ok: string[] = [];
    for (const id of dto.sourceIds) {
      const s = sources.find((x) => x.id === id);
      if (!s || (scope && s.region_id !== scope)) skipped.push({ sourceId: id, reason: 'Not found in your region' });
      else if (s.region_id !== assignee.region_id) skipped.push({ sourceId: id, name: s.name, reason: `${assignee.full_name} works in another region` });
      else if (s.active) skipped.push({ sourceId: id, name: s.name, reason: 'Already has an open inspection' });
      else ok.push(id);
    }

    if (ok.length) {
      await this.db.transaction(async (tx) => {
        for (const sourceId of ok) {
          await tx.query(
            `INSERT INTO inspection_assignments (source_id, assigned_to, assigned_by, due_on, notes) VALUES ($1, $2, $3, $4, $5)`,
            [sourceId, assignee.id, user.id, dto.dueOn ?? null, dto.notes?.trim() || null],
          );
        }
        await this.audit.log(
          {
            userId: user.id,
            action: 'inspection.assign',
            entityType: 'user',
            entityId: assignee.id,
            summary: `Assigned ${ok.length} inspection${ok.length === 1 ? '' : 's'} to ${assignee.full_name}`,
            changes: { sourceIds: ok, dueOn: dto.dueOn ?? null },
            ip,
          },
          tx,
        );
      });
    }
    return { created: ok.length, skipped };
  }

  async cancelAssignment(user: AuthUser, id: string, ip: string | null) {
    const scope = regionScope(user);
    const [row] = await this.db.query<{ status: string; name: string }>(
      `UPDATE inspection_assignments a SET status = 'cancelled', completed_at = now()
         FROM water_sources s
        WHERE a.id = $1 AND s.id = a.source_id AND a.status = 'open' AND ($2::smallint IS NULL OR s.region_id = $2)
        RETURNING a.status, s.name`,
      [id, scope],
    );
    if (!row) throw new NotFoundException('Open assignment not found');
    await this.audit.log({ userId: user.id, action: 'inspection.cancel', entityType: 'assignment', entityId: id, summary: `Cancelled inspection of ${row.name}`, ip });
    return { id, status: 'cancelled' };
  }

  // ---------------------------------------------------------------- inspections

  async create(user: AuthUser, dto: CreateInspectionDto, ip: string | null) {
    const [existing] = await this.db.query<{ id: string; state: string; inspector_id: string }>(
      'SELECT id, state, inspector_id FROM inspections WHERE client_id = $1',
      [dto.clientId],
    );
    if (existing) {
      if (existing.inspector_id !== user.id) throw new ConflictException('This inspection belongs to someone else');
      return { id: existing.id, state: existing.state };
    }

    const source = await this.visibleSource(user, dto.sourceId);
    if (dto.assignmentId) {
      const [a] = await this.db.query(
        `SELECT 1 FROM inspection_assignments WHERE id = $1 AND assigned_to = $2 AND source_id = $3 AND status = 'open'`,
        [dto.assignmentId, user.id, dto.sourceId],
      );
      if (!a) throw new BadRequestException('This assignment is no longer open for you');
    }
    const [pending] = await this.db.query(`SELECT 1 FROM inspections WHERE source_id = $1 AND state = 'submitted'`, [dto.sourceId]);
    if (pending) throw new ConflictException('Another inspection of this source is already waiting for review');

    const observed = this.normalizeObserved(source.type, dto.observed);
    this.checkVisitDate(dto.inspectedOn);

    const [row] = await this.db.query<{ id: string }>(
      `INSERT INTO inspections (source_id, inspected_on, agency, status, notes, state, client_id, assignment_id, inspector_id,
                                observed, gps, gps_accuracy_m)
       VALUES ($1, $2, 'Ministry of Water Development', $3, $4, 'draft', $5, $6, $7, $8::jsonb,
               CASE WHEN $9::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($10::float8, $9::float8), 4326)::geography END, $11)
       RETURNING id`,
      [
        dto.sourceId,
        dto.inspectedOn,
        observed.status,
        dto.notes?.trim() || null,
        dto.clientId,
        dto.assignmentId ?? null,
        user.id,
        JSON.stringify(observed),
        dto.gps?.lat ?? null,
        dto.gps?.lng ?? null,
        dto.gps?.accuracy ?? null,
      ],
    );
    void ip;
    return { id: row.id, state: 'draft' };
  }

  async update(user: AuthUser, id: string, dto: UpdateInspectionDto) {
    const ins = await this.loadOwnEditable(user, id);
    const observed = dto.observed ? this.normalizeObserved(ins.type, dto.observed) : null;
    if (dto.inspectedOn) this.checkVisitDate(dto.inspectedOn);
    const gps: GpsDto | undefined = dto.gps;

    await this.db.query(
      `UPDATE inspections
          SET observed = coalesce($2::jsonb, observed),
              status = coalesce($3::functional_status, status),
              notes = CASE WHEN $4::boolean THEN $5 ELSE notes END,
              inspected_on = coalesce($6::date, inspected_on),
              gps = CASE WHEN $7::float8 IS NULL THEN gps ELSE ST_SetSRID(ST_MakePoint($8::float8, $7::float8), 4326)::geography END,
              gps_accuracy_m = CASE WHEN $7::float8 IS NULL THEN gps_accuracy_m ELSE $9 END,
              updated_at = now()
        WHERE id = $1`,
      [
        id,
        observed ? JSON.stringify(observed) : null,
        observed?.status ?? null,
        dto.notes !== undefined,
        dto.notes?.trim() || null,
        dto.inspectedOn ?? null,
        gps?.lat ?? null,
        gps?.lng ?? null,
        gps?.accuracy ?? null,
      ],
    );
    return { id, state: ins.state };
  }

  async addPhoto(user: AuthUser, id: string, file: { buffer: Buffer; mimetype: string; size: number } | undefined, clientId?: string, caption?: string) {
    await this.loadOwnEditable(user, id);
    if (clientId) {
      const [dup] = await this.db.query<{ id: string }>('SELECT id FROM inspection_photos WHERE client_id = $1', [clientId]);
      if (dup) return { id: dup.id, duplicate: true };
    }
    if (!file) throw new BadRequestException('Attach a photo');
    if (!ALLOWED_PHOTO_TYPES.includes(file.mimetype)) throw new BadRequestException('Photos must be JPEG, PNG or WebP');
    if (file.size > MAX_PHOTO_BYTES) throw new BadRequestException('Photo is larger than 5 MB');
    const [{ count }] = await this.db.query<{ count: number }>('SELECT count(*)::int AS count FROM inspection_photos WHERE inspection_id = $1', [id]);
    if (count >= MAX_PHOTOS) throw new BadRequestException(`At most ${MAX_PHOTOS} photos per inspection`);

    const stored = await storePhoto(file.buffer, file.mimetype, id);
    const [row] = await this.db.query<{ id: string }>(
      `INSERT INTO inspection_photos (inspection_id, client_id, storage, storage_key, content_type, size_bytes, caption)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [id, clientId ?? null, stored.storage, stored.key, file.mimetype, file.size, caption?.trim() || null],
    );
    return { id: row.id, duplicate: false };
  }

  async removePhoto(user: AuthUser, id: string, photoId: string) {
    await this.loadOwnEditable(user, id);
    const [row] = await this.db.query<{ storage: Storage; storage_key: string }>(
      'DELETE FROM inspection_photos WHERE id = $1 AND inspection_id = $2 RETURNING storage, storage_key',
      [photoId, id],
    );
    if (!row) throw new NotFoundException('Photo not found');
    await deletePhoto(row.storage, row.storage_key);
  }

  async submit(user: AuthUser, id: string, ip: string | null) {
    const ins = await this.loadOwnEditable(user, id);
    return this.db.transaction(async (tx) => {
      await tx.query(`UPDATE inspections SET state = 'submitted', submitted_at = now(), updated_at = now() WHERE id = $1`, [id]);
      if (ins.assignment_id) {
        await tx.query(`UPDATE inspection_assignments SET status = 'submitted', inspection_id = $2 WHERE id = $1`, [ins.assignment_id, id]);
      }
      await this.audit.log(
        {
          userId: user.id,
          action: 'inspection.submit',
          entityType: 'inspection',
          entityId: id,
          summary: `${ins.state === 'returned' ? 'Resubmitted' : 'Submitted'} inspection of ${ins.inspected_on}`,
          ip,
        },
        tx,
      );
      return { id, state: 'submitted' };
    });
  }

  async list(user: AuthUser, box: 'review' | 'mine' | 'recent') {
    const params: unknown[] = [];
    const scope = regionScope(user);
    let where: string;
    let order = 'coalesce(i.reviewed_at, i.submitted_at) DESC';
    if (box === 'review') {
      if (!can(user, 'inspections.review')) return [];
      where = `i.state = 'submitted'`;
      order = 'i.submitted_at ASC';
    } else if (box === 'mine') {
      where = `i.inspector_id = $${params.push(user.id)} AND i.state <> 'draft'`;
    } else {
      where = `i.state IN ('approved', 'returned') AND i.inspector_id IS NOT NULL`;
    }
    if (scope && box !== 'mine') where += ` AND s.region_id = $${params.push(scope)}`;
    return this.db.query(`SELECT ${LIST_COLUMNS} ${LIST_FROM} WHERE ${where} ORDER BY ${order} LIMIT 100`, params);
  }

  async counts(user: AuthUser) {
    const scope = regionScope(user);
    const [row] = await this.db.query<{ toReview: number; openAssignments: number; returned: number }>(
      `SELECT (SELECT count(*) FROM inspections i JOIN water_sources s ON s.id = i.source_id
                WHERE i.state = 'submitted' AND i.inspector_id <> $1 AND ($2::smallint IS NULL OR s.region_id = $2))::int AS "toReview",
              (SELECT count(*) FROM inspection_assignments WHERE assigned_to = $1 AND status = 'open')::int AS "openAssignments",
              (SELECT count(*) FROM inspections WHERE inspector_id = $1 AND state = 'returned')::int AS returned`,
      [user.id, scope],
    );
    return can(user, 'inspections.review') ? row : { ...row, toReview: 0 };
  }

  async get(user: AuthUser, id: string) {
    const scope = regionScope(user);
    const [row] = await this.db.query<Record<string, unknown> & { sourceId: string; regionId: number; type: SourceType; observed: Record<string, Value> | null }>(
      `SELECT i.id, i.state, i.inspected_on::text AS "inspectedOn", i.notes, i.observed, i.previous,
              i.submitted_at AS "submittedAt", i.reviewed_at AS "reviewedAt", i.review_comment AS "reviewComment",
              i.location_moved AS "locationMoved", i.gps_accuracy_m AS "gpsAccuracyM", i.assignment_id AS "assignmentId",
              i.inspector_id AS "inspectorId", ins.full_name AS inspector, rev.full_name AS reviewer,
              ST_Y(i.gps::geometry) AS "gpsLat", ST_X(i.gps::geometry) AS "gpsLng",
              CASE WHEN i.gps IS NULL THEN NULL ELSE round(ST_Distance(i.gps, s.location))::int END AS "distanceM",
              s.id AS "sourceId", s.code, s.name, s.type, s.region_id AS "regionId", r.name AS region,
              ST_Y(s.location::geometry) AS "sourceLat", ST_X(s.location::geometry) AS "sourceLng"
         ${LIST_FROM}
        WHERE i.id = $1 AND i.inspector_id IS NOT NULL AND ($2::smallint IS NULL OR s.region_id = $2)`,
      [id, scope],
    );
    if (!row) throw new NotFoundException('Inspection not found');
    if (row.state === 'draft' && row.inspectorId !== user.id) throw new NotFoundException('Inspection not found');

    const [current, photos] = await Promise.all([
      loadCurrentValues(this.db, row.sourceId),
      this.db.query<{ id: string; caption: string | null }>(
        'SELECT id, caption, content_type AS "contentType" FROM inspection_photos WHERE inspection_id = $1 ORDER BY created_at',
        [id],
      ),
    ]);

    const warnings = findInconsistencies({ ...(current?.values.fields ?? {}), ...(row.observed ?? {}) });
    const distance = row.distanceM as number | null;
    if (row.gpsLat === null) warnings.push({ field: 'gps', message: 'No GPS position was recorded at the visit' });
    else if (distance !== null && distance > FAR_FROM_SOURCE_M) {
      warnings.push({ field: 'gps', message: `GPS position is ${(distance / 1000).toFixed(1)} km from the registered location` });
    }
    if (typeof row.gpsAccuracyM === 'number' && row.gpsAccuracyM > 100) {
      warnings.push({ field: 'gps', message: `GPS accuracy was low (±${Math.round(row.gpsAccuracyM)} m)` });
    }

    const review = this.reviewPermission(user, row.state as string, row.inspectorId as string, row.regionId);
    return {
      ...row,
      current: current ? Object.fromEntries(INSPECTION_FIELD_KEYS.map((k) => [k, current.values.fields[k] ?? null])) : null,
      photos: photos.map((p) => ({ ...p, url: `/api/inspections/photos/${p.id}` })),
      warnings,
      canReview: review.allowed,
      reviewBlockedReason: review.reason,
      canEdit: row.inspectorId === user.id && (row.state === 'draft' || row.state === 'returned'),
    };
  }

  async approve(user: AuthUser, id: string, comment: string | undefined, moveLocation: boolean, ip: string | null) {
    return this.db.transaction(async (tx) => {
      const ins = await this.load(tx, id, true);
      const review = this.reviewPermission(user, ins.state, ins.inspector_id, ins.region_id);
      if (!review.allowed) throw new ForbiddenException(review.reason);

      const current = await loadCurrentValues(tx, ins.source_id);
      if (!current) throw new NotFoundException('The water source no longer exists');
      const fields: Record<string, Value> = { ...(ins.observed ?? {}) };
      const move = moveLocation && ins.gps_lat !== null && ins.gps_lng !== null;
      if (move) Object.assign(fields, { lat: ins.gps_lat, lng: ins.gps_lng });
      const diff = diffValues(current.values, { fields, details: {} });

      if (!isEmptyChange(diff.proposed)) await updateSource(tx, ins.source_id, diff.proposed, current.regionId, user.id);
      // An approved field visit confirms the record.
      await tx.query(`UPDATE water_sources SET verification = 'verified', updated_by = $2, updated_at = now() WHERE id = $1`, [ins.source_id, user.id]);

      await tx.query(
        `UPDATE inspections SET state = 'approved', reviewed_by = $2, reviewed_at = now(), review_comment = $3,
                previous = $4::jsonb, location_moved = $5, updated_at = now()
          WHERE id = $1`,
        [id, user.id, comment?.trim() || null, JSON.stringify(diff.previous), move],
      );
      if (ins.assignment_id) {
        await tx.query(`UPDATE inspection_assignments SET status = 'completed', completed_at = now() WHERE id = $1`, [ins.assignment_id]);
      }

      const [inspector] = await tx.query<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [ins.inspector_id]);
      const count = Object.keys(diff.proposed.fields).length;
      const summary = `Field inspection of ${ins.inspected_on}: ${count ? `updated ${count} field${count === 1 ? '' : 's'}` : 'no changes'}${move ? ', location corrected' : ''}`;
      await this.audit.log(
        {
          userId: user.id,
          action: 'source.inspection',
          entityType: 'water_source',
          entityId: ins.source_id,
          summary,
          changes: { inspectionId: id, requestedBy: inspector?.full_name, proposed: diff.proposed, previous: diff.previous },
          ip,
        },
        tx,
      );
      await this.audit.log({ userId: user.id, action: 'inspection.approve', entityType: 'inspection', entityId: id, summary: `Approved: ${summary}`, ip }, tx);
      return { id, state: 'approved', sourceId: ins.source_id };
    });
  }

  async returnToInspector(user: AuthUser, id: string, comment: string | undefined, ip: string | null) {
    if (!comment?.trim()) throw new BadRequestException('Explain what needs to be corrected');
    return this.db.transaction(async (tx) => {
      const ins = await this.load(tx, id, true);
      const review = this.reviewPermission(user, ins.state, ins.inspector_id, ins.region_id);
      if (!review.allowed) throw new ForbiddenException(review.reason);
      await tx.query(
        `UPDATE inspections SET state = 'returned', reviewed_by = $2, reviewed_at = now(), review_comment = $3, updated_at = now() WHERE id = $1`,
        [id, user.id, comment.trim()],
      );
      if (ins.assignment_id) await tx.query(`UPDATE inspection_assignments SET status = 'open' WHERE id = $1`, [ins.assignment_id]);
      await this.audit.log(
        { userId: user.id, action: 'inspection.return', entityType: 'inspection', entityId: id, summary: `Returned for correction: ${comment.trim()}`, ip },
        tx,
      );
      return { id, state: 'returned' };
    });
  }

  async photo(user: AuthUser, photoId: string) {
    const scope = regionScope(user);
    const [row] = await this.db.query<{ storage: Storage; storage_key: string; content_type: string }>(
      `SELECT p.storage, p.storage_key, p.content_type
         FROM inspection_photos p
         JOIN inspections i ON i.id = p.inspection_id
         JOIN water_sources s ON s.id = i.source_id
        WHERE p.id = $1 AND ($2::smallint IS NULL OR s.region_id = $2)`,
      [photoId, scope],
    );
    if (!row) throw new NotFoundException('Photo not found');
    const stream = await readPhoto(row.storage, row.storage_key);
    if (!stream) throw new NotFoundException('Photo not found');
    return { stream, contentType: row.content_type };
  }

  // ---------------------------------------------------------------- helpers

  private reviewPermission(user: AuthUser, state: string, inspectorId: string | null, regionId: number) {
    if (state !== 'submitted') return { allowed: false, reason: 'This inspection is not waiting for review' };
    if (!can(user, 'inspections.review')) return { allowed: false, reason: 'Your role cannot review inspections' };
    const scope = regionScope(user);
    if (scope && scope !== regionId) return { allowed: false, reason: 'This source is in another region' };
    if (inspectorId === user.id) return { allowed: false, reason: 'You cannot review your own inspection' };
    return { allowed: true, reason: null };
  }

  private normalizeObserved(type: SourceType, observed: Record<string, unknown>): Record<string, Value> {
    const unknown = Object.keys(observed).filter((k) => !FIELD_KEYS.has(k));
    if (unknown.length) {
      throw new BadRequestException({ message: 'Some values need attention', fieldErrors: Object.fromEntries(unknown.map((k) => [k, 'Not collected at inspections'])) });
    }
    const { values, errors } = normalizeValues(type, { fields: observed }, true);
    if (!values.fields.status && !errors.status) errors.status = 'Record whether the source is functioning';
    if (Object.keys(errors).length) throw new BadRequestException({ message: 'Some values need attention', fieldErrors: errors });
    return values.fields;
  }

  private checkVisitDate(date: string) {
    const today = new Date().toISOString().slice(0, 10);
    if (date > today) throw new BadRequestException({ message: 'Some values need attention', fieldErrors: { inspectedOn: 'Visit date cannot be in the future' } });
    if (date < '2000-01-01') throw new BadRequestException({ message: 'Some values need attention', fieldErrors: { inspectedOn: 'Visit date is too early' } });
  }

  private async visibleSource(user: AuthUser, sourceId: string) {
    const scope = regionScope(user);
    const [s] = await this.db.query<{ id: string; type: SourceType; region_id: number }>(
      'SELECT id, type, region_id FROM water_sources WHERE id = $1 AND ($2::smallint IS NULL OR region_id = $2)',
      [sourceId, scope],
    );
    if (!s) throw new NotFoundException('Water source not found');
    return s;
  }

  private async load(db: Db, id: string, forUpdate = false): Promise<InspectionRow> {
    const [row] = await db.query<InspectionRow>(
      `SELECT i.id, i.source_id, i.state, i.inspector_id, i.assignment_id, i.inspected_on::text AS inspected_on, i.observed, i.notes,
              s.region_id, s.type, ST_Y(i.gps::geometry) AS gps_lat, ST_X(i.gps::geometry) AS gps_lng
         FROM inspections i JOIN water_sources s ON s.id = i.source_id
        WHERE i.id = $1 ${forUpdate ? 'FOR UPDATE OF i' : ''}`,
      [id],
    );
    if (!row) throw new NotFoundException('Inspection not found');
    return row;
  }

  private async loadOwnEditable(user: AuthUser, id: string) {
    const ins = await this.load(this.db, id);
    if (ins.inspector_id !== user.id) throw new ForbiddenException('Only the inspector can change this inspection');
    if (ins.state !== 'draft' && ins.state !== 'returned') throw new ConflictException('This inspection has already been submitted');
    return ins;
  }
}
