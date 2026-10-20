import { Clock, FlaskConical, Send } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../lib/auth';
import { formatDate, formatMeasure, formatNumber } from '../../lib/format';
import { limitText, num } from '../../lib/quality';
import { useSourceWaterQuality, useWqParameters } from '../../lib/queries';
import type { SourceDetail } from '../../lib/types';
import { Card } from '../ui/Card';
import { FactList } from '../ui/FactList';
import { OutcomeBadge } from '../ui/StateBadges';
import { LoadingBlock } from '../ui/States';
import { RequestTestDialog } from './RequestTestDialog';

const SHOWN_TESTS = 5;

/** Laboratory results of one source over time, plus the physical observation from the last visit. */
export function SourceLabResults({ s }: { s: SourceDetail }) {
  const { can } = useAuth();
  const wq = useSourceWaterQuality(s.id);
  const parameters = useWqParameters();
  const [requestOpen, setRequestOpen] = useState(false);

  const tests = wq.data?.tests.slice(0, SHOWN_TESTS) ?? [];
  const latest = tests[0];
  const open = wq.data?.openRequest;
  // Parameters measured in any of the shown tests, in the standard order.
  const measured = (parameters.data ?? []).filter((p) => tests.some((t) => t.results.some((r) => r.code === p.code)));

  const action = (
    <>
      {can('lab.request') && !open && wq.isSuccess && (
        <button
          type="button"
          onClick={() => setRequestOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-xs font-medium text-ink hover:bg-page"
        >
          <Send size={13} aria-hidden /> Request test
        </button>
      )}
      {can('lab.record') && (
        <Link
          to={open ? `/water-quality/record?test=${open.id}` : `/water-quality/record?source=${s.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-700 px-2.5 text-xs font-medium text-white hover:bg-brand-800"
        >
          <FlaskConical size={13} aria-hidden /> Record results
        </Link>
      )}
    </>
  );

  return (
    <Card title="Water quality" subtitle="Laboratory results, newest first" action={action}>
      {!wq.data || !parameters.data ? (
        <LoadingBlock rows={4} />
      ) : (
        <div className="space-y-5">
          {open && (
            <p className="flex gap-2 rounded-lg border border-gold-300/70 bg-gold-100/60 px-3 py-2 text-sm text-gold-800">
              <Clock size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">Test requested</span> by {open.requestedBy ?? 'unknown'} on {formatDate(open.requestedAt)}, waiting for the lab.
              </span>
            </p>
          )}

          {latest ? (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <OutcomeBadge outcome={latest.outcome} />
                <span className="text-sm text-ink-2">
                  Latest test {formatDate(latest.sampledOn)}
                  {latest.lab && ` · ${latest.lab}`}
                </span>
                <Link to={`/water-quality/tests/${latest.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                  View test
                </Link>
              </div>
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-y border-line bg-page/60 text-left text-xs text-ink-2">
                      <th className="px-5 py-2 font-medium">Parameter</th>
                      <th className="px-3 py-2 font-medium">Limit</th>
                      {tests.map((t) => (
                        <th key={t.id} className="px-3 py-2 text-right font-medium">
                          <Link to={`/water-quality/tests/${t.id}`} className="hover:text-brand-700 hover:underline">
                            {formatDate(t.sampledOn)}
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {measured.map((p) => (
                      <tr key={p.code} className="border-b border-line last:border-0">
                        <td className="px-5 py-2 text-ink">
                          {p.label}
                          {p.unit && <span className="ml-1 text-xs text-ink-3">{p.unit}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs tabular text-ink-3">{limitText(p)}</td>
                        {tests.map((t) => {
                          const r = t.results.find((x) => x.code === p.code);
                          if (!r) return <td key={t.id} className="px-3 py-2 text-right text-ink-3">—</td>;
                          const tone = r.flag === 'ok' ? 'text-ink' : r.kind === 'health' ? 'rounded bg-critical-wash px-1.5 font-semibold text-critical-ink' : 'rounded bg-gold-100 px-1.5 font-semibold text-gold-800';
                          return (
                            <td key={t.id} className="px-3 py-2 text-right tabular">
                              <span className={tone} title={r.flag === 'ok' ? 'Within limit' : r.flag === 'high' ? 'Above limit' : 'Below minimum'}>
                                {num(r.value)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-ink-3">
                Highlighted values are outside the limit: red for health limits, amber for taste or appearance.
                {(wq.data.tests.length ?? 0) > SHOWN_TESTS && ` Showing the latest ${SHOWN_TESTS} of ${wq.data.tests.length} tests.`}
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-3">No laboratory results yet.</p>
          )}

          <div className="border-t border-line pt-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Physical observation at the last visit</h3>
            <FactList
              columns={3}
              facts={[
                { label: 'Issue reported', value: s.qualityIssue ?? 'None reported' },
                { label: 'Colour / odour', value: s.colorOdor },
                { label: 'Temperature', value: s.temperatureC !== null ? formatMeasure(s.temperatureC, '°C') : null },
                { label: 'pH', value: s.ph !== null ? formatNumber(s.ph, 1) : null },
              ]}
            />
          </div>
        </div>
      )}
      {requestOpen && <RequestTestDialog open onClose={() => setRequestOpen(false)} source={{ id: s.id, name: s.name, code: s.code }} />}
    </Card>
  );
}
