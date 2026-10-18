import { useState } from 'react';
import { STATUS_META } from '../../lib/domain';
import { formatNumber, formatPercent } from '../../lib/format';
import type { FunctionalStatus, RegionStats } from '../../lib/types';
import { Segmented } from '../ui/Controls';
import { useTooltip } from '../ui/Tooltip';

const SEGMENTS: { status: FunctionalStatus; key: keyof RegionStats }[] = [
  { status: 'functioning', key: 'functioning' },
  { status: 'non_functioning', key: 'nonFunctioning' },
  { status: 'abandoned', key: 'abandoned' },
  { status: 'unknown', key: 'unknown' },
];

/**
 * Condition of sources per region: one stacked bar per region, all growing from the same
 * baseline so totals compare too. Segments are separated by a 2px surface gap.
 * A table view carries the same numbers for screen readers and exact reading.
 */
export function StatusStackedBars({ regions }: { regions: RegionStats[] }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const { bind, node } = useTooltip();
  const max = Math.max(1, ...regions.map((r) => r.total));
  // Hide statuses that never occur, to keep the legend honest.
  const segments = SEGMENTS.filter((s) => regions.some((r) => (r[s.key] as number) > 0));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legend">
          {segments.map(({ status }) => {
            const meta = STATUS_META[status];
            const Icon = meta.icon;
            return (
              <li key={status} className="flex items-center gap-1.5 text-xs text-ink-2">
                <Icon size={14} strokeWidth={2.25} style={{ color: meta.color }} aria-hidden />
                {meta.label}
              </li>
            );
          })}
        </ul>
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Table' },
          ]}
        />
      </div>

      {view === 'chart' ? (
        <ul className="space-y-3">
          {regions.map((r) => (
            <li key={r.id} className="grid grid-cols-[minmax(64px,120px)_minmax(0,1fr)_auto] items-center gap-3">
              <span className="truncate text-sm text-ink">{r.name}</span>
              {r.total === 0 ? (
                <span className="text-xs italic text-ink-3">No records yet</span>
              ) : (
                <div className="flex h-3.5 gap-[2px]" style={{ width: `${(r.total / max) * 100}%` }} aria-hidden>
                  {segments.map(({ status, key }, i) => {
                    const value = r[key] as number;
                    if (!value) return null;
                    const last = segments.slice(i + 1).every((s) => !(r[s.key] as number));
                    return (
                      <div
                        key={status}
                        className={`h-full ${last ? 'rounded-r-[4px]' : ''}`}
                        style={{ flexGrow: value, flexBasis: 0, background: STATUS_META[status].color, minWidth: 3 }}
                        {...bind(
                          <>
                            <div className="font-semibold">{r.name}</div>
                            <div>
                              {STATUS_META[status].label}: {formatNumber(value)} of {formatNumber(r.total)} (
                              {formatPercent(value, r.total)})
                            </div>
                          </>,
                        )}
                      />
                    );
                  })}
                </div>
              )}
              <span className="w-11 text-right text-sm tabular text-ink">
                {r.total ? (
                  <>
                    <span className="font-semibold">{formatPercent(r.functioning, r.total)}</span>
                    <span className="sr-only"> functioning</span>
                  </>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </span>
            </li>
          ))}
          <li className="grid grid-cols-[minmax(64px,120px)_minmax(0,1fr)_auto] gap-3 pt-1 text-xs text-ink-3">
            <span />
            <span>Bar length = number of sources</span>
            <span className="text-right">working</span>
          </li>
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th className="py-2 pr-3 font-medium">Region</th>
                {SEGMENTS.map(({ status }) => (
                  <th key={status} className="px-3 py-2 text-right font-medium">
                    {STATUS_META[status].label}
                  </th>
                ))}
                <th className="py-2 pl-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {regions.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 text-ink">{r.name}</td>
                  {SEGMENTS.map(({ status, key }) => (
                    <td key={status} className="px-3 py-2 text-right tabular text-ink-2">
                      {formatNumber(r[key] as number)}
                    </td>
                  ))}
                  <td className="py-2 pl-3 text-right tabular font-semibold text-ink">{formatNumber(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {node}
    </div>
  );
}
