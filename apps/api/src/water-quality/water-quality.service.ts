import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { can, regionScope, type AuthUser } from '../auth/roles';
import { DB, type Db } from '../database/db';
import { describeExceedance, flagFor, outcomeFor, OUTCOME_LABELS, type ParameterKind, type ResultFlag, type TestOutcome } from './evaluate';
import type { ParameterDto, RecordTestDto, RequestTestDto } from './water-quality.dto';

interface ParameterRow {
  code: string;
  label: string;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  kind: ParameterKind;
  basis: string | null;
  sortOrder: number;
  active: boolean;
}

const PARAMETER_COLUMNS = `code, label, unit, min_value AS "minValue", max_value AS "maxValue", kind, basis,
  sort_order AS "sortOrder", active`;

const LIST_FROM = `
  FROM wq_tests t
  JOIN water_sources s ON s.id = t.source_id
  JOIN regions r ON r.id = s.region_id
  LEFT JOIN users rq ON rq.id = t.requested_by
  LEFT JOIN users rc ON rc.id = t.recorded_by`;

const LIST_COLUMNS = `t.id, t.state, t.outcome, t.sampled_on::text AS "sampledOn", t.sample_point AS "samplePoint",
  t.requested_at AS "requestedAt", t.recorded_at AS "recordedAt", t.request_note AS "requestNote",
  rq.full_name AS "requestedBy", rc.full_name AS "recordedBy",
  s.id AS "sourceId", s.code, s.name, s.type, s.region_id AS "regionId", r.name AS region,
  coalesce((SELECT json_agg(json_build_object('label', p.label, 'unit', p.unit, 'value', x.value, 'flag', x.flag, 'kind', x.kind,
                                              'min', x.min_value, 'max', x.max_value) ORDER BY p.sort_order)
              FROM wq_results x JOIN wq_parameters p ON p.code = x.parameter
             WHERE x.test_id = t.id AND x.flag <> 'ok'), '[]'::json) AS exceedances`;

const today = () => new Date().toISOString().slice(0, 10);

/** Water-quality laboratory: limits, test requests, results and the lab's queue. */
@Injectable()
export class WaterQualityService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- limits

  parameters() {
    return this.db.query<ParameterRow>(`SELECT ${PARAMETER_COLUMNS} FROM wq_parameters ORDER BY sort_order, label`);
  }

  async updateParameter(user: AuthUser, code: string, dto: ParameterDto, ip: string | null) {
    this.checkLimits(dto);
    const [before] = await this.db.query<ParameterRow>(`SELECT ${PARAMETER_COLUMNS} FROM wq_parameters WHERE code = $1`, [code]);
    if (!before) throw new NotFoundException('Parameter not found');
    const [after] = await this.db.query<ParameterRow>(
      `UPDATE wq_parameters
          SET label = $2, unit = $3, min_value = $4, max_value = $5, kind = $6, basis = $7,
              active = coalesce($8, active), sort_order = coalesce($9, sort_order), updated_by = $10, updated_at = now()
        WHERE code = $1
        RETURNING ${PARAMETER_COLUMNS}`,
      [code, dto.label.trim(), dto.unit?.trim() ?? '', dto.minValue ?? null, dto.maxValue ?? null, dto.kind, dto.basis?.trim() || null, dto.active ?? null, dto.sortOrder ?? null, user.id],
    );
    await this.audit.log({
      userId: user.id,
      action: 'lab.standard',
      entityType: 'wq_parameter',
      entityId: undefined,
      summary: `Changed the limits for ${after.label}: ${describeLimit(before)} → ${describeLimit(after)}${before.active !== after.active ? (after.active ? ', now measured' : ', no longer measured') : ''}`,
      changes: { code, before, after },
      ip,
    });
    return after;
  }

  async addParameter(user: AuthUser, dto: ParameterDto, ip: string | null) {
    this.checkLimits(dto);
    const code = dto.label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
    if (!code) throw new BadRequestException({ message: 'Some values need attention', fieldErrors: { label: 'Use letters or digits in the name' } });
    const [exists] = await this.db.query('SELECT 1 FROM wq_parameters WHERE code = $1 OR lower(label) = lower($2)', [code, dto.label.trim()]);
    if (exists) throw new ConflictException({ message: 'Some values need attention', fieldErrors: { label: 'A parameter with this name already exists' } });
    const [row] = await this.db.query<ParameterRow>(
      `INSERT INTO wq_parameters (code, label, unit, min_value, max_value, kind, basis, sort_order, active, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, coalesce($8, (SELECT coalesce(max(sort_order), 0) + 10 FROM wq_parameters)), coalesce($9, true), $10)
       RETURNING ${PARAMETER_COLUMNS}`,
      [code, dto.label.trim(), dto.unit?.trim() ?? '', dto.minValue ?? null, dto.maxValue ?? null, dto.kind, dto.basis?.trim() || null, dto.sortOrder ?? null, dto.active ?? null, user.id],
    );
    await this.audit.log({
      userId: user.id,
      action: 'lab.standard',
      entityType: 'wq_parameter',
      summary: `Added the parameter ${row.label} (${describeLimit(row)})`,
      changes: { code, after: row },
      ip,
    });
    return row;
  }

  private checkLimits(dto: ParameterDto) {
    const min = dto.minValue ?? null;
    const max = dto.maxValue ?? null;
    if (min !== null && max !== null && min > max) {
      throw new BadRequestException({ message: 'Some values need attention', fieldErrors: { minValue: 'The minimum must not be above the maximum' } });
    }
    if (dto.kind !== 'info' && min === null && max === null) {
      throw new BadRequestException({ message: 'Some values need attention', fieldErrors: { maxValue: 'Enter a limit, or choose "Recorded for information"' } });
    }
  }

  // ---------------------------------------------------------------- lists

  async list(user: AuthUser, box: 'queue' | 'recent' | 'mine', outcome?: TestOutcome) {
    const params: unknown[] = [];
    const scope = regionScope(user);
    let where: string;
    let order: string;
    if (box === 'queue') {
      where = `t.state = 'requested'`;
      order = 't.requested_at ASC';
    } else if (box === 'mine') {
      where = `t.requested_by = $${params.push(user.id)} AND t.state <> 'cancelled'`;
      order = 'coalesce(t.recorded_at, t.requested_at) DESC';
    } else {
      where = `t.state = 'completed'`;
      if (outcome) where += ` AND t.outcome = $${params.push(outcome)}`;
      order = 't.sampled_on DESC, t.recorded_at DESC';
    }
    if (scope) where += ` AND s.region_id = $${params.push(scope)}`;
    return this.db.query(`SELECT ${LIST_COLUMNS} ${LIST_FROM} WHERE ${where} ORDER BY ${order} LIMIT 200`, params);
  }

  async counts(user: AuthUser) {
    const scope = regionScope(user);
    const [row] = await this.db.query<{ queue: number; myRequests: number; unsafeSources: number }>(
      `SELECT (SELECT count(*) FROM wq_tests t JOIN water_sources s ON s.id = t.source_id
                WHERE t.state = 'requested' AND ($2::smallint IS NULL OR s.region_id = $2))::int AS queue,
              (SELECT count(*) FROM wq_tests WHERE requested_by = $1 AND state = 'requested')::int AS "myRequests",
              (SELECT count(*) FROM (
                 SELECT DISTINCT ON (t.source_id) t.outcome
                   FROM wq_tests t JOIN water_sources s ON s.id = t.source_id
                  WHERE t.state = 'completed' AND ($2::smallint IS NULL OR s.region_id = $2)
                  ORDER BY t.source_id, t.sampled_on DESC, t.recorded_at DESC
               ) latest WHERE latest.outcome = 'unsafe')::int AS "unsafeSources"`,
      [user.id, scope],
    );
    return can(user, 'lab.record') ? row : { ...row, queue: 0 };
  }

  async get(user: AuthUser, id: string) {
    const scope = regionScope(user);
    const [row] = await this.db.query<Record<string, unknown> & { state: string; name: string; requestedById: string | null; recordedById: string | null }>(
      `SELECT ${LIST_COLUMNS}, t.sampled_by AS "sampledBy", t.lab, t.analysed_on::text AS "analysedOn", t.notes,
              t.cancelled_reason AS "cancelledReason", t.requested_by AS "requestedById", t.recorded_by AS "recordedById",
              s.status AS "sourceStatus"
         ${LIST_FROM}
        WHERE t.id = $1 AND ($2::smallint IS NULL OR s.region_id = $2)`,
      [id, scope],
    );
    if (!row) throw new NotFoundException('Water test not found');
    const results = await this.db.query(
      `SELECT x.parameter AS code, p.label, p.unit, x.value, x.flag, x.kind, x.min_value AS "minValue", x.max_value AS "maxValue", p.basis
         FROM wq_results x JOIN wq_parameters p ON p.code = x.parameter
        WHERE x.test_id = $1
        ORDER BY p.sort_order, p.label`,
      [id],
    );
    const isLab = can(user, 'lab.record');
    return {
      ...row,
      results,
      canRecord: isLab && row.state === 'requested',
      canCorrect: isLab && row.state === 'completed' && (row.recordedById === user.id || user.role === 'admin'),
      canCancel: row.state === 'requested' && (isLab || row.requestedById === user.id || user.role === 'admin'),
    };
  }

  /** Tests of one source for its record page: completed results (newest first) and any open request. */
  async forSource(user: AuthUser, sourceId: string) {
    await this.visibleSource(user, sourceId);
    const tests = await this.db.query<{ id: string; state: string }>(
      `SELECT t.id, t.state, t.outcome, t.sampled_on::text AS "sampledOn", t.sample_point AS "samplePoint", t.lab,
              t.requested_at AS "requestedAt", t.request_note AS "requestNote", rq.full_name AS "requestedBy", rc.full_name AS "recordedBy"
         FROM wq_tests t
         LEFT JOIN users rq ON rq.id = t.requested_by
         LEFT JOIN users rc ON rc.id = t.recorded_by
        WHERE t.source_id = $1 AND t.state <> 'cancelled'
        ORDER BY (t.state = 'requested') DESC, t.sampled_on DESC NULLS LAST, t.recorded_at DESC
        LIMIT 13`,
      [sourceId],
    );
    const completedIds = tests.filter((t) => t.state === 'completed').map((t) => t.id);
    const results = completedIds.length
      ? await this.db.query<{ testId: string }>(
          `SELECT test_id AS "testId", parameter AS code, value, flag, kind, min_value AS "minValue", max_value AS "maxValue"
             FROM wq_results WHERE test_id = ANY($1::uuid[])`,
          [completedIds],
        )
      : [];
    const byTest = new Map<string, unknown[]>();
    for (const r of results) byTest.set(r.testId, [...(byTest.get(r.testId) ?? []), r]);
    return {
      openRequest: tests.find((t) => t.state === 'requested') ?? null,
      tests: tests.filter((t) => t.state === 'completed').slice(0, 12).map((t) => ({ ...t, results: byTest.get(t.id) ?? [] })),
    };
  }

  // ---------------------------------------------------------------- actions

  async request(user: AuthUser, dto: RequestTestDto, ip: string | null) {
    const source = await this.visibleSource(user, dto.sourceId);
    if (dto.sampledOn) this.checkDate(dto.sampledOn, 'sampledOn', 'Sample date');
    const [open] = await this.db.query(`SELECT 1 FROM wq_tests WHERE source_id = $1 AND state = 'requested'`, [source.id]);
    if (open) throw new ConflictException('A water test is already requested for this source');
    try {
      const [row] = await this.db.query<{ id: string }>(
        `INSERT INTO wq_tests (source_id, state, requested_by, requested_at, request_note, sampled_on, sampled_by, sample_point)
         VALUES ($1, 'requested', $2, now(), $3, $4, $5, $6) RETURNING id`,
        [source.id, user.id, dto.note?.trim() || null, dto.sampledOn ?? null, dto.sampledBy?.trim() || null, dto.samplePoint?.trim() || null],
      );
      await this.audit.log({
        userId: user.id,
        action: 'lab.request',
        entityType: 'wq_test',
        entityId: row.id,
        summary: `Requested a water test of ${source.name}`,
        ip,
      });
      return { id: row.id, state: 'requested' };
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('A water test is already requested for this source');
      throw err;
    }
  }

  /** Records results: a direct lab entry (no id), the results of a request, or a correction. */
  async record(user: AuthUser, id: string | null, dto: RecordTestDto, ip: string | null) {
    this.checkDate(dto.sampledOn, 'sampledOn', 'Sample date');
    if (dto.analysedOn) {
      this.checkDate(dto.analysedOn, 'analysedOn', 'Analysis date');
      if (dto.analysedOn < dto.sampledOn) {
        throw new BadRequestException({ message: 'Some values need attention', fieldErrors: { analysedOn: 'Analysis date cannot be before the sample date' } });
      }
    }

    const parameters = new Map((await this.parameters()).map((p) => [p.code, p]));
    const seen = new Set<string>();
    const fieldErrors: Record<string, string> = {};
    const evaluated = dto.results.map((r) => {
      const p = parameters.get(r.parameter);
      if (!p) throw new BadRequestException(`Unknown parameter: ${r.parameter}`);
      if (seen.has(r.parameter)) throw new BadRequestException(`${p.label} is entered twice`);
      seen.add(r.parameter);
      if (r.parameter === 'ph' && (r.value < 0 || r.value > 14)) fieldErrors[`results.${r.parameter}`] = 'pH must be between 0 and 14';
      else if (r.parameter !== 'temperature' && r.value < 0) fieldErrors[`results.${r.parameter}`] = 'Cannot be negative';
      const limit = { min: p.minValue, max: p.maxValue, kind: p.kind };
      return { parameter: p, value: r.value, limit, flag: flagFor(r.value, limit) as ResultFlag };
    });
    if (Object.keys(fieldErrors).length) throw new BadRequestException({ message: 'Some values need attention', fieldErrors });
    const outcome = outcomeFor(evaluated.map((e) => ({ kind: e.limit.kind, flag: e.flag })));
    // Checked before the transaction: queries outside it would wait on it (the embedded database has one connection).
    const directSourceId = id ? null : dto.sourceId ? (await this.visibleSource(user, dto.sourceId)).id : null;
    if (!id && !directSourceId) throw new BadRequestException('Choose the water source');

    return this.db.transaction(async (tx) => {
      let testId = id;
      let sourceId: string;
      let correction = false;
      let previous: unknown = null;

      if (!testId) {
        sourceId = directSourceId!;
        const [created] = await tx.query<{ id: string }>(`INSERT INTO wq_tests (source_id, state) VALUES ($1, 'completed') RETURNING id`, [sourceId]);
        testId = created.id;
      } else {
        const [t] = await tx.query<{ source_id: string; state: string; recorded_by: string | null; outcome: string | null }>(
          'SELECT source_id, state, recorded_by, outcome FROM wq_tests WHERE id = $1 FOR UPDATE',
          [testId],
        );
        if (!t) throw new NotFoundException('Water test not found');
        sourceId = t.source_id;
        if (t.state === 'cancelled') throw new ConflictException('This request was cancelled');
        if (t.state === 'completed') {
          if (t.recorded_by !== user.id && user.role !== 'admin') throw new ForbiddenException('Only the lab officer who recorded these results can correct them');
          correction = true;
          previous = {
            outcome: t.outcome,
            results: await tx.query('SELECT parameter, value, flag FROM wq_results WHERE test_id = $1 ORDER BY parameter', [testId]),
          };
          await tx.query('DELETE FROM wq_results WHERE test_id = $1', [testId]);
        }
      }

      await tx.query(
        `UPDATE wq_tests
            SET state = 'completed', sampled_on = $2, sampled_by = $3, sample_point = $4, lab = $5, analysed_on = $6,
                notes = $7, outcome = $8, recorded_by = coalesce(recorded_by, $9), recorded_at = coalesce(recorded_at, now()), updated_at = now()
          WHERE id = $1`,
        [
          testId,
          dto.sampledOn,
          dto.sampledBy?.trim() || null,
          dto.samplePoint?.trim() || null,
          dto.lab?.trim() || null,
          dto.analysedOn ?? null,
          dto.notes?.trim() || null,
          outcome,
          user.id,
        ],
      );
      for (const e of evaluated) {
        await tx.query(
          `INSERT INTO wq_results (test_id, parameter, value, min_value, max_value, kind, flag) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [testId, e.parameter.code, e.value, e.limit.min, e.limit.max, e.limit.kind, e.flag],
        );
      }

      const exceeded = evaluated
        .filter((e) => e.flag !== 'ok')
        .map((e) => describeExceedance({ label: e.parameter.label, unit: e.parameter.unit, value: e.value, flag: e.flag, min: e.limit.min, max: e.limit.max }));
      const summary = `Water test of ${dto.sampledOn}: ${OUTCOME_LABELS[outcome]}${exceeded.length ? ` (${exceeded.join(', ')})` : ''}`;
      const changes = { testId, outcome, results: evaluated.map((e) => ({ parameter: e.parameter.code, value: e.value, flag: e.flag })), previous };
      // On the source's history, so the record shows when its water was tested.
      await this.audit.log(
        { userId: user.id, action: correction ? 'source.lab.correct' : 'source.lab', entityType: 'water_source', entityId: sourceId, summary: correction ? `Corrected: ${summary}` : summary, changes, ip },
        tx,
      );
      await this.audit.log(
        { userId: user.id, action: correction ? 'lab.correct' : 'lab.record', entityType: 'wq_test', entityId: testId, summary, changes, ip },
        tx,
      );
      return { id: testId, state: 'completed', outcome, sourceId };
    });
  }

  async cancel(user: AuthUser, id: string, reason: string, ip: string | null) {
    const test = await this.get(user, id);
    if (!test.canCancel) throw new ForbiddenException('You cannot cancel this request');
    await this.db.query(`UPDATE wq_tests SET state = 'cancelled', cancelled_reason = $2, updated_at = now() WHERE id = $1 AND state = 'requested'`, [
      id,
      reason.trim(),
    ]);
    await this.audit.log({ userId: user.id, action: 'lab.cancel', entityType: 'wq_test', entityId: id, summary: `Cancelled the water test request for ${test.name}: ${reason.trim()}`, ip });
    return { id, state: 'cancelled' };
  }

  // ---------------------------------------------------------------- helpers

  private async visibleSource(user: AuthUser, sourceId: string) {
    const [s] = await this.db.query<{ id: string; name: string; region_id: number }>(
      'SELECT id, name, region_id FROM water_sources WHERE id = $1 AND ($2::smallint IS NULL OR region_id = $2)',
      [sourceId, regionScope(user)],
    );
    if (!s) throw new NotFoundException('Water source not found');
    return s;
  }

  private checkDate(date: string, field: string, label: string) {
    if (date > today()) throw new BadRequestException({ message: 'Some values need attention', fieldErrors: { [field]: `${label} cannot be in the future` } });
    if (date < '1990-01-01') throw new BadRequestException({ message: 'Some values need attention', fieldErrors: { [field]: `${label} is too early` } });
  }
}

function describeLimit(p: Pick<ParameterRow, 'minValue' | 'maxValue' | 'kind' | 'unit'>) {
  if (p.kind === 'info' || (p.minValue === null && p.maxValue === null)) return 'recorded for information';
  const unit = p.unit ? ` ${p.unit}` : '';
  if (p.minValue !== null && p.maxValue !== null) return `${p.minValue}–${p.maxValue}${unit}`;
  return p.maxValue !== null ? `at most ${p.maxValue}${unit}` : `at least ${p.minValue}${unit}`;
}

function isUniqueViolation(err: unknown) {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
