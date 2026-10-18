import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { StatusBadge, TypeLabel, VerificationBadge } from '../components/ui/Badges';
import { Card } from '../components/ui/Card';
import { Button, SearchInput, Select } from '../components/ui/Controls';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { SOURCE_TYPES, STATUSES, STATUS_META, TYPE_META } from '../lib/domain';
import { formatDate, formatNumber } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useReference, useSources } from '../lib/queries';

type SortKey = 'code' | 'name' | 'type' | 'region' | 'status' | 'people' | 'inspected';
const PAGE_SIZE = 25;
const FILTER_KEYS = ['q', 'type', 'region', 'status', 'verification'] as const;

export function Sources() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const reference = useReference();
  const { can, scopeRegionId } = useAuth();

  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const sort = (params.get('sort') as SortKey) || 'code';
  const order = params.get('order') === 'desc' ? 'desc' : 'asc';

  // Debounce typing in the search box before it hits the URL and the API.
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (search === q) return;
    const t = window.setTimeout(() => update({ q: search }), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const query = {
    q,
    type: params.get('type'),
    region: params.get('region'),
    status: params.get('status'),
    verification: params.get('verification'),
    page,
    pageSize: PAGE_SIZE,
    sort,
    order,
  };
  const sources = useSources(query);

  function update(changes: Record<string, string | null>, resetPage = true) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  }

  const toggleSort = (key: SortKey) =>
    update({ sort: key, order: sort === key && order === 'asc' ? 'desc' : 'asc' }, false);

  const hasFilters = FILTER_KEYS.some((k) => params.get(k));
  const data = sources.data;
  const from = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        eyebrow="Registry"
        title="Water sources"
        description="Every registered borehole, shallow well, berkad, dam and spring. Search, filter and open a record for full details."
        actions={
          can('sources.propose') && (
            <Link to="/sources/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-3.5 text-sm font-medium text-white shadow-card hover:bg-brand-800">
              <Plus size={16} aria-hidden /> Register a source
            </Link>
          )
        }
      />

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4 [&>*]:min-w-0">
          <SearchInput
            value={search}
            onChange={setSearch}
            label="Search water sources"
            placeholder="Name, code, settlement or district"
            className="flex-[2_1_220px]"
          />
          <Select className="flex-[1_1_128px]" label="Type" value={params.get('type') ?? ''} onChange={(v) => update({ type: v })}>
            <option value="">All types</option>
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_META[t].plural}
              </option>
            ))}
          </Select>
          {!scopeRegionId && <Select className="flex-[1_1_128px]" label="Region" value={params.get('region') ?? ''} onChange={(v) => update({ region: v })}>
            <option value="">All regions</option>
            {reference.data?.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>}
          <Select className="flex-[1_1_128px]" label="Status" value={params.get('status') ?? ''} onChange={(v) => update({ status: v })}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
          <Select className="flex-[1_1_128px]" label="Verification" value={params.get('verification') ?? ''} onChange={(v) => update({ verification: v })}>
            <option value="">All records</option>
            <option value="unverified">Unverified</option>
            <option value="verified">Verified</option>
          </Select>
          <Button
            variant="ghost"
            onClick={() => setParams({}, { replace: true })}
            disabled={!hasFilters}
            className="shrink-0"
          >
            <RotateCcw size={15} aria-hidden /> Reset
          </Button>
        </div>

        {sources.isError ? (
          <ErrorState error={sources.error} onRetry={() => sources.refetch()} />
        ) : !data ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState title="No water sources match these filters">Try a different search or reset the filters.</EmptyState>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${sources.isFetching ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[960px] text-sm">
              <caption className="sr-only">Water sources, sorted by {sort} {order === 'asc' ? 'ascending' : 'descending'}</caption>
              <thead>
                <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
                  <SortHeader label="Code" k="code" sort={sort} order={order} onSort={toggleSort} />
                  <SortHeader label="Name" k="name" sort={sort} order={order} onSort={toggleSort} />
                  <SortHeader label="Type" k="type" sort={sort} order={order} onSort={toggleSort} />
                  <SortHeader label="Region / district" k="region" sort={sort} order={order} onSort={toggleSort} />
                  <SortHeader label="Status" k="status" sort={sort} order={order} onSort={toggleSort} />
                  <SortHeader label="People using" k="people" sort={sort} order={order} onSort={toggleSort} align="right" />
                  <SortHeader label="Last inspected" k="inspected" sort={sort} order={order} onSort={toggleSort} />
                  <th className="px-4 py-3 font-medium">Record</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/sources/${s.id}`)}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-brand-50/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink-2">{s.code}</td>
                    <td className="min-w-[200px] px-4 py-3">
                      <Link
                        to={`/sources/${s.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-ink hover:text-brand-700 hover:underline"
                      >
                        {s.name}
                      </Link>
                      {s.settlement && <div className="text-xs text-ink-3">Near {s.settlement}</div>}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      <TypeLabel type={s.type} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-ink">{s.region}</div>
                      <div className="text-xs text-ink-3">{s.district ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right tabular text-ink">{formatNumber(s.peopleServed)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-2">{formatDate(s.lastInspectedOn)}</td>
                    <td className="px-4 py-3">
                      <VerificationBadge value={s.verification} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-2">
            <span>
              Showing <span className="font-medium text-ink">{formatNumber(from)}–{formatNumber(to)}</span> of{' '}
              <span className="font-medium text-ink">{formatNumber(data.total)}</span> sources
            </span>
            <div className="flex items-center gap-2">
              <Button onClick={() => update({ page: String(page - 1) }, false)} disabled={page <= 1} aria-label="Previous page">
                <ChevronLeft size={16} aria-hidden /> Previous
              </Button>
              <span className="px-1 tabular">
                Page {page} of {pages}
              </span>
              <Button onClick={() => update({ page: String(page + 1) }, false)} disabled={page >= pages} aria-label="Next page">
                Next <ChevronRight size={16} aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

function SortHeader({
  label,
  k,
  sort,
  order,
  onSort,
  align = 'left',
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  order: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sort === k;
  const Icon = order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={`px-4 py-3 font-medium ${align === 'right' ? 'text-right' : ''}`}
      aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-ink ${active ? 'text-ink' : ''}`}
      >
        {label}
        <Icon size={13} className={active ? 'opacity-100' : 'opacity-0'} aria-hidden />
      </button>
    </th>
  );
}
