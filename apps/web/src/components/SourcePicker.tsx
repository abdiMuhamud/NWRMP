import { Check } from 'lucide-react';
import { useState } from 'react';
import { STATUS_META } from '../lib/domain';
import { useSources } from '../lib/queries';
import { TypeSwatch } from './ui/Badges';
import { SearchInput } from './ui/Controls';

export interface PickedSource {
  id: string;
  name: string;
  code: string;
}

/** Search the registry and pick one water source (regional users only see their region). */
export function SourcePicker({ value, onChange, error }: { value: PickedSource | null; onChange: (s: PickedSource | null) => void; error?: string }) {
  const [search, setSearch] = useState('');
  const sources = useSources({ q: search, pageSize: 8, sort: 'name', order: 'asc' });

  return (
    <div className="space-y-2">
      <SearchInput value={search} onChange={setSearch} placeholder="Search by name, code, settlement or district" label="Search water sources" />
      <ul className={`max-h-56 divide-y divide-line overflow-y-auto rounded-lg border ${error ? 'border-critical' : 'border-line'}`} aria-label="Water sources">
        {sources.data?.items.length === 0 && <li className="px-3 py-4 text-center text-sm text-ink-3">No matching sources.</li>}
        {(sources.data?.items ?? []).map((s) => {
          const selected = value?.id === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onChange(selected ? null : { id: s.id, name: s.name, code: s.code })}
                aria-pressed={selected}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-page ${selected ? 'bg-brand-50' : ''}`}
              >
                <TypeSwatch type={s.type} size={14} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{s.name}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {s.code} · {s.region} · {STATUS_META[s.status].label}
                  </span>
                </span>
                {selected && <Check size={16} className="shrink-0 text-brand-700" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-xs text-critical-ink">{error}</p>}
    </div>
  );
}
