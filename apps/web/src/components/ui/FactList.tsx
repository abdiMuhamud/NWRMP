import type { ReactNode } from 'react';

export interface Fact {
  label: string;
  value: ReactNode;
}

const isEmpty = (v: ReactNode) => v === null || v === undefined || v === '' || v === '—';

/** Label/value grid used on record pages. Missing values read "Not recorded". */
export function FactList({ facts, columns = 2 }: { facts: Fact[]; columns?: 1 | 2 | 3 }) {
  const grid = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 xl:grid-cols-3' }[columns];
  return (
    <dl className={`grid grid-cols-1 gap-x-8 gap-y-4 ${grid}`}>
      {facts.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-xs font-medium text-ink-3">{f.label}</dt>
          <dd className={`mt-0.5 text-sm ${isEmpty(f.value) ? 'text-ink-3 italic' : 'text-ink'}`}>
            {isEmpty(f.value) ? 'Not recorded' : f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
