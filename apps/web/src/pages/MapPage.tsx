import { Layers, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { WaterMap, type ColorBy } from '../components/map/WaterMap';
import { TypeSwatch } from '../components/ui/Badges';
import { Segmented, Select } from '../components/ui/Controls';
import { SOURCE_TYPES, STATUSES, STATUS_META, TYPE_META } from '../lib/domain';
import { formatNumber } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useReference, useSourceGeojson } from '../lib/queries';
import type { FunctionalStatus, SourceType } from '../lib/types';

export function MapPage() {
  const [params, setParams] = useSearchParams();
  const { scopeRegionId } = useAuth();
  const region = scopeRegionId ?? (Number(params.get('region')) || undefined);
  const reference = useReference();
  const geojson = useSourceGeojson({ region });

  const [colorBy, setColorBy] = useState<ColorBy>('type');
  const [types, setTypes] = useState<SourceType[]>(SOURCE_TYPES);
  const [statuses, setStatuses] = useState<FunctionalStatus[]>(STATUSES);
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia('(min-width: 640px)').matches);

  const features = geojson.data?.features ?? [];
  const typeCounts = useMemo(() => countBy(features.map((f) => f.properties.type)), [features]);
  const statusCounts = useMemo(() => countBy(features.map((f) => f.properties.status)), [features]);
  const shown = features.filter((f) => types.includes(f.properties.type) && statuses.includes(f.properties.status)).length;

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <div className="relative h-full">
      <WaterMap
        key={region ?? 'all'}
        data={geojson.data}
        colorBy={colorBy}
        visibleTypes={types}
        visibleStatuses={statuses}
        className="h-full w-full"
        label="Map of water sources"
      />

      {!panelOpen && (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-medium text-ink shadow-float ring-1 ring-line"
        >
          <SlidersHorizontal size={16} aria-hidden /> Filters
          <span className="rounded-full bg-page px-1.5 text-xs tabular text-ink-2">{formatNumber(shown)}</span>
        </button>
      )}

      {panelOpen && (
        <section
          aria-label="Map filters"
          className="absolute left-3 top-3 flex max-h-[calc(100%-24px)] w-[min(320px,calc(100%-24px))] flex-col overflow-hidden rounded-xl bg-surface shadow-float ring-1 ring-line"
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h1 className="text-[15px] font-semibold text-ink">Water source map</h1>
              <p className="text-xs text-ink-3" aria-live="polite">
                Showing {formatNumber(shown)} of {formatNumber(features.length)} sources
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="-mr-1 grid size-8 place-items-center rounded-md text-ink-3 hover:bg-page hover:text-ink"
              aria-label="Hide filters"
            >
              <X size={16} />
            </button>
          </header>

          <div className="space-y-5 overflow-y-auto px-4 py-4">
            {!scopeRegionId && <Select label="Region" value={region ?? ''} onChange={(v) => setParams(v ? { region: v } : {})}>
              <option value="">All regions</option>
              {reference.data?.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
                  <Layers size={14} aria-hidden /> Colour markers by
                </span>
                <Segmented
                  label="Colour markers by"
                  value={colorBy}
                  onChange={setColorBy}
                  options={[
                    { value: 'type', label: 'Type' },
                    { value: 'status', label: 'Status' },
                  ]}
                />
              </div>
            </div>

            <fieldset>
              <legend className="mb-1.5 flex w-full items-center justify-between text-xs font-medium text-ink-2">
                Source type
                <button type="button" className="font-normal text-brand-700 hover:underline" onClick={() => setTypes(SOURCE_TYPES)}>
                  Show all
                </button>
              </legend>
              <ul className="space-y-0.5">
                {SOURCE_TYPES.map((t) => (
                  <ToggleRow
                    key={t}
                    checked={types.includes(t)}
                    onChange={() => setTypes(toggle(types, t))}
                    marker={<TypeSwatch type={t} size={15} color={colorBy === 'status' ? '#727a73' : undefined} />}
                    label={TYPE_META[t].plural}
                    count={typeCounts[t] ?? 0}
                  />
                ))}
              </ul>
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 flex w-full items-center justify-between text-xs font-medium text-ink-2">
                Status
                <button type="button" className="font-normal text-brand-700 hover:underline" onClick={() => setStatuses(STATUSES)}>
                  Show all
                </button>
              </legend>
              <ul className="space-y-0.5">
                {STATUSES.map((s) => {
                  const Icon = STATUS_META[s].icon;
                  return (
                    <ToggleRow
                      key={s}
                      checked={statuses.includes(s)}
                      onChange={() => setStatuses(toggle(statuses, s))}
                      marker={
                        colorBy === 'status' ? (
                          <span className="size-3.5 rounded-full ring-2 ring-white" style={{ background: STATUS_META[s].color }} />
                        ) : (
                          <Icon size={15} style={{ color: STATUS_META[s].color }} aria-hidden />
                        )
                      }
                      label={STATUS_META[s].label}
                      count={statusCounts[s] ?? 0}
                    />
                  );
                })}
              </ul>
            </fieldset>

            <p className="text-xs leading-relaxed text-ink-3">
              Each type has its own marker shape, so types stay distinguishable when markers are coloured by status. Click a
              marker to open its record.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function ToggleRow({
  checked,
  onChange,
  marker,
  label,
  count,
}: {
  checked: boolean;
  onChange: () => void;
  marker: ReactNode;
  label: string;
  count: number;
}) {
  return (
    <li>
      <label className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-page ${checked ? '' : 'opacity-50'}`}>
        <input type="checkbox" checked={checked} onChange={onChange} className="size-4 accent-brand-700" />
        <span className="grid w-4 place-items-center">{marker}</span>
        <span className="flex-1 text-ink">{label}</span>
        <span className="tabular text-xs text-ink-3">{formatNumber(count)}</span>
      </label>
    </li>
  );
}

function countBy<T extends string>(values: T[]): Partial<Record<T, number>> {
  const out: Partial<Record<T, number>> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}
