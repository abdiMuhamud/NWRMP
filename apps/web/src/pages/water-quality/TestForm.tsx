import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Card } from '../../components/ui/Card';
import { Button, Field, borderFor, inputClass } from '../../components/ui/Controls';
import { PageHeader } from '../../components/ui/PageHeader';
import { OutcomeBadge } from '../../components/ui/StateBadges';
import { ErrorState, LoadingBlock } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { ApiError, apiPost } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { flagFor, KIND_LABELS, limitText, outcomeFor } from '../../lib/quality';
import { useSource, useTest, useWqParameters } from '../../lib/queries';
import type { ResultFlag, TestDetail, WqParameter } from '../../lib/types';

const today = () => new Date().toISOString().slice(0, 10);
const parse = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/** Lab results for a requested test (?test=), a correction (?test= of a completed test) or a direct entry (?source=). */
export function TestForm() {
  const [params] = useSearchParams();
  const testId = params.get('test') ?? undefined;
  const sourceId = params.get('source') ?? undefined;
  const test = useTest(testId);
  const source = useSource(testId ? undefined : sourceId);
  const parameters = useWqParameters();

  const error = test.error ?? source.error ?? parameters.error;
  const ready = parameters.data && (testId ? test.data : source.data);
  return (
    <>
      <Link to={testId ? `/water-quality/tests/${testId}` : '/water-quality?tab=queue'} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> {testId ? 'Test' : 'Water quality'}
      </Link>
      {error ? (
        <Card>
          <ErrorState error={error} />
        </Card>
      ) : !ready ? (
        <Card>
          <LoadingBlock rows={8} />
        </Card>
      ) : (
        <ResultsForm
          test={test.data ?? null}
          source={test.data ? { id: test.data.sourceId, name: test.data.name, code: test.data.code } : { id: source.data!.id, name: source.data!.name, code: source.data!.code }}
          parameters={parameters.data!}
        />
      )}
    </>
  );
}

function ResultsForm({ test, source, parameters }: { test: TestDetail | null; source: { id: string; name: string; code: string }; parameters: WqParameter[] }) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const correcting = test?.state === 'completed';

  // Measured parameters, plus any no longer measured that this test already has a value for.
  const rows = useMemo(() => parameters.filter((p) => p.active || test?.results.some((r) => r.code === p.code)), [parameters, test]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sample, setSample] = useState({ sampledOn: '', sampledBy: '', samplePoint: '', lab: 'Ministry Water Quality Lab', analysedOn: today(), notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!test) return;
    setSample({
      sampledOn: test.sampledOn ?? '',
      sampledBy: test.sampledBy ?? '',
      samplePoint: test.samplePoint ?? '',
      lab: test.lab ?? 'Ministry Water Quality Lab',
      analysedOn: test.analysedOn ?? today(),
      notes: test.notes ?? '',
    });
    setValues(Object.fromEntries(test.results.map((r) => [r.code, String(r.value)])));
  }, [test]);

  // For a correction, judge against the limit stored with the result; otherwise the current limit.
  const limitOf = (p: WqParameter) => {
    const stored = correcting ? test?.results.find((r) => r.code === p.code) : undefined;
    return stored ? { minValue: stored.minValue, maxValue: stored.maxValue, kind: stored.kind } : p;
  };
  const flags = rows.flatMap((p) => {
    const v = parse(values[p.code] ?? '');
    if (v === null || !Number.isFinite(v)) return [];
    const limit = limitOf(p);
    return [{ code: p.code, kind: limit.kind, flag: flagFor(v, limit) }];
  });
  const preview = flags.length ? outcomeFor(flags) : null;

  const save = useMutation({
    mutationFn: () => {
      const results = rows.flatMap((p) => {
        const v = parse(values[p.code] ?? '');
        return v === null ? [] : [{ parameter: p.code, value: v }];
      });
      const body = {
        sourceId: test ? undefined : source.id,
        sampledOn: sample.sampledOn,
        sampledBy: sample.sampledBy || undefined,
        samplePoint: sample.samplePoint || undefined,
        lab: sample.lab || undefined,
        analysedOn: sample.analysedOn || undefined,
        notes: sample.notes || undefined,
        results,
      };
      return apiPost<{ id: string; outcome: string }>(test ? `/water-quality/tests/${test.id}/results` : '/water-quality/tests/record', body);
    },
    onSuccess: (r) => {
      for (const key of ['wq-tests', 'wq-test', 'wq-source', 'summary', 'sources-geojson', 'source-history']) queryClient.invalidateQueries({ queryKey: [key] });
      toast(correcting ? 'Results corrected' : 'Results saved');
      navigate(`/water-quality/tests/${r.id}`, { replace: true });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not save the results');
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const next: Record<string, string> = {};
    if (!sample.sampledOn) next.sampledOn = 'Enter the sample date';
    for (const p of rows) {
      const raw = values[p.code] ?? '';
      if (raw.trim() !== '' && !Number.isFinite(parse(raw))) next[`results.${p.code}`] = 'Enter a number';
    }
    if (!rows.some((p) => (values[p.code] ?? '').trim() !== '')) next.results = 'Enter at least one result';
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
    else setError('Some values need attention');
  };

  const setField = (key: keyof typeof sample) => (e: { target: { value: string } }) => setSample((s) => ({ ...s, [key]: e.target.value }));

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        eyebrow={source.code}
        title={`${correcting ? 'Correct results' : 'Lab results'}: ${source.name}`}
        description={
          test?.state === 'requested'
            ? `Requested by ${test.requestedBy ?? 'unknown'} on ${formatDate(test.requestedAt)}${test.requestNote ? `: “${test.requestNote}”` : ''}`
            : correcting
              ? 'The correction is recorded in the audit log with the previous values.'
              : 'Enter the values measured. Leave a parameter empty if it was not measured.'
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Results" subtitle="Each value is checked against its limit as you type" bodyClassName="p-0">
          {errors.results && <p className="border-b border-line bg-critical-wash px-5 py-2 text-sm text-critical-ink">{errors.results}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
                  <th className="px-5 py-2.5 font-medium">Parameter</th>
                  <th className="px-5 py-2.5 font-medium">Limit</th>
                  <th className="w-40 px-5 py-2.5 font-medium">Value</th>
                  <th className="w-36 px-5 py-2.5 font-medium">Check</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const limit = limitOf(p);
                  const flag = flags.find((f) => f.code === p.code)?.flag;
                  const err = errors[`results.${p.code}`];
                  return (
                    <tr key={p.code} className="border-b border-line align-middle last:border-0">
                      <td className="px-5 py-2.5">
                        <label htmlFor={`v-${p.code}`} className="font-medium text-ink">
                          {p.label}
                        </label>
                        <div className="text-xs text-ink-3">{KIND_LABELS[limit.kind]}</div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 tabular text-ink-2">{limitText(limit, p.unit)}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            id={`v-${p.code}`}
                            inputMode="decimal"
                            value={values[p.code] ?? ''}
                            onChange={(e) => setValues((v) => ({ ...v, [p.code]: e.target.value }))}
                            aria-invalid={Boolean(err)}
                            className={`${inputClass} ${borderFor(err)} h-9 w-24 tabular`}
                          />
                          <span className="text-xs text-ink-3">{p.unit}</span>
                        </div>
                        {err && <p className="mt-1 text-xs text-critical-ink">{err}</p>}
                      </td>
                      <td className="px-5 py-2.5">{flag && <FlagChip flag={flag} kind={limit.kind} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <aside className="space-y-6">
          <Card title="Sample">
            <div className="space-y-4">
              <Field label="Sample taken on" htmlFor="s-date" required error={errors.sampledOn}>
                <input id="s-date" type="date" max={today()} value={sample.sampledOn} onChange={setField('sampledOn')} className={`${inputClass} ${borderFor(errors.sampledOn)}`} />
              </Field>
              <Field label="Taken by" htmlFor="s-by">
                <input id="s-by" value={sample.sampledBy} onChange={setField('sampledBy')} maxLength={200} className={`${inputClass} ${borderFor()}`} />
              </Field>
              <Field label="Sampling point" htmlFor="s-point">
                <input id="s-point" value={sample.samplePoint} onChange={setField('samplePoint')} maxLength={200} className={`${inputClass} ${borderFor()}`} />
              </Field>
              <Field label="Laboratory" htmlFor="s-lab">
                <input id="s-lab" value={sample.lab} onChange={setField('lab')} maxLength={200} className={`${inputClass} ${borderFor()}`} />
              </Field>
              <Field label="Analysed on" htmlFor="s-analysed" error={errors.analysedOn}>
                <input id="s-analysed" type="date" max={today()} value={sample.analysedOn} onChange={setField('analysedOn')} className={`${inputClass} ${borderFor(errors.analysedOn)}`} />
              </Field>
              <Field label="Notes" htmlFor="s-notes">
                <textarea id="s-notes" rows={3} value={sample.notes} onChange={setField('notes')} maxLength={2000} className={`${inputClass} ${borderFor()} h-auto py-2`} />
              </Field>
            </div>
          </Card>
          <Card title="Outcome">
            <div className="space-y-3">
              {preview ? <OutcomeBadge outcome={preview} /> : <p className="text-sm text-ink-3">Enter results to see the outcome.</p>}
              {error && (
                <p role="alert" className="rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical-ink">
                  {error}
                </p>
              )}
              <Button variant="primary" type="submit" className="w-full" disabled={save.isPending}>
                <FlaskConical size={16} aria-hidden /> {save.isPending ? 'Saving…' : correcting ? 'Save correction' : 'Save results'}
              </Button>
              <p className="text-xs text-ink-3">Results are final when saved and appear on the source’s record straight away.</p>
            </div>
          </Card>
        </aside>
      </div>
    </form>
  );
}

export function FlagChip({ flag, kind }: { flag: ResultFlag; kind: string }) {
  if (kind === 'info') return <span className="text-xs text-ink-3">Recorded</span>;
  if (flag === 'ok') return <span className="text-xs font-medium text-good-ink">Within limit</span>;
  const health = kind === 'health';
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${health ? 'bg-critical-wash text-critical-ink' : 'bg-gold-100 text-gold-800'}`}>
      {flag === 'high' ? 'Above limit' : 'Below minimum'}
    </span>
  );
}
