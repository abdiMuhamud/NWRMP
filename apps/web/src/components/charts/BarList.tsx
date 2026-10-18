import type { ReactNode } from 'react';
import { formatNumber, formatPercent } from '../../lib/format';
import { useTooltip } from '../ui/Tooltip';

export interface BarItem {
  key: string;
  label: ReactNode;
  /** Plain-text label for tooltips and screen readers */
  text: string;
  value: number;
  color?: string;
  marker?: ReactNode;
  note?: ReactNode;
}

interface BarListProps {
  items: BarItem[];
  /** Colour for single-series lists */
  color?: string;
  /** What the value counts, e.g. "sources" */
  unit?: string;
}

/**
 * Horizontal bars, one per category, labelled directly (value at the tip).
 * Bars are thin (10px) with a rounded data end and a square baseline.
 */
export function BarList({ items, color = '#2a6ca6', unit = 'sources' }: BarListProps) {
  const { bind, node } = useTooltip();
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((sum, i) => sum + i.value, 0);

  return (
    <>
      <ul className="space-y-3.5">
        {items.map((item) => (
          <li
            key={item.key}
            className="group -mx-2 rounded-md px-2 py-0.5 hover:bg-page"
            {...bind(
              <>
                <div className="font-semibold">{item.text}</div>
                <div>
                  {formatNumber(item.value)} {unit} · {formatPercent(item.value, total)} of total
                </div>
              </>,
            )}
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-ink">
                {item.marker}
                <span className="truncate">{item.label}</span>
              </span>
              <span className="shrink-0 tabular font-semibold text-ink">
                {formatNumber(item.value)}
                {item.note && <span className="ml-1.5 font-normal text-ink-3">{item.note}</span>}
              </span>
            </div>
            <div className="h-2.5 w-full" aria-hidden>
              <div
                className="h-full rounded-r-[4px] transition-[width] duration-500"
                style={{ width: `${(item.value / max) * 100}%`, minWidth: item.value ? 4 : 0, background: item.color ?? color }}
              />
            </div>
          </li>
        ))}
      </ul>
      {node}
    </>
  );
}
