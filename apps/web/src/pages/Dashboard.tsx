import { ArrowRight, Beef, CircleCheck, Info, ShieldAlert, ShieldQuestion, Timer, Users, Wrench } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { BarList } from '../components/charts/BarList';
import { StatusStackedBars } from '../components/charts/StatusStackedBars';
import { WaterMap } from '../components/map/WaterMap';
import { StatusBadge, TypeSwatch } from '../components/ui/Badges';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Controls';
import { PageHeader } from '../components/ui/PageHeader';
import { StatTile } from '../components/ui/StatTile';
import { ErrorState, LoadingBlock, Skeleton } from '../components/ui/States';
import { STATUS_META, TYPE_META } from '../lib/domain';
import { formatCompact, formatDate, formatNumber, formatPercent } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useInspectionCounts, useReference, useSourceGeojson, useSummary } from '../lib/queries';
import type { Summary } from '../lib/types';

export function Dashboard() {
  const [params, setParams] = useSearchParams();
  const { scopeRegionId, can, me } = useAuth();
  const inspectionCounts = useInspectionCounts(Boolean(me));
  const todo = can('inspections.submit') ? (inspectionCounts.data?.openAssignments ?? 0) + (inspectionCounts.data?.returned ?? 0) : 0;
  // Regional users always see their own region.
  const region = scopeRegionId ?? (Number(params.get('region')) || undefined);
  const reference = useReference();
  const summary = useSummary(region);
  const geojson = useSourceGeojson({ region });
  const regionName = reference.data?.regions.find((r) => r.id === region)?.name;

  return (
    <>
      <PageHeader
        eyebrow="National overview"
        title={regionName ? `Water sources in ${regionName}` : 'National water sources'}
        description="Registered water points, their condition, and the people and livestock that depend on them."
        actions={
          !scopeRegionId && (
          <Select
            label="Region"
            hideLabel
            value={region ?? ''}
            onChange={(v) => setParams(v ? { region: v } : {})}
            className="w-52"
          >
            <option value="">All regions</option>
            {reference.data?.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          )
        }
      />

      {todo > 0 && (
        <Link
          to="/field"
          className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800 hover:bg-brand-100"
        >
          <span>
            <span className="font-semibold">
              You have {todo} inspection{todo === 1 ? '' : 's'} to do.
            </span>{' '}
            Open your list to start.
          </span>
          <ArrowRight size={16} aria-hidden />
        </Link>
      )}

      {summary.isError ? (
        <Card>
          <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
        </Card>
      ) : !summary.data ? (
        <DashboardSkeleton />
      ) : (
        <DashboardBody summary={summary.data} region={region} geojson={geojson.data} />
      )}
    </>
  );
}

function DashboardBody({
  summary,
  region,
  geojson,
}: {
  summary: Summary;
  region?: number;
  geojson: Parameters<typeof WaterMap>[0]['data'];
}) {
  const t = summary.totals;
  const regionQuery = region ? `?region=${region}` : '';

  return (
    <div className="space-y-6">
      {t.sampleRecords > 0 && (
        <div className="flex gap-3 rounded-xl border border-water-100 bg-water-50 px-4 py-3 text-sm text-water-700">
          <Info size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">Sample data.</span> {formatNumber(t.sampleRecords)} records come from the
            example workbook built on the Ministry's template. Figures are for testing only and are not official
            statistics.
          </p>
        </div>
      )}

      {/* Headline figures */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col justify-between rounded-xl bg-brand-900 p-5 text-white shadow-card sm:col-span-2 xl:col-span-1">
          <div className="text-[13px] font-medium text-brand-100">Registered water sources</div>
          <div className="mt-2 text-5xl font-semibold leading-none tracking-tight">{formatNumber(t.sources)}</div>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-brand-100">
            {(['functioning', 'non_functioning', 'abandoned', 'unknown'] as const).map((s) => {
              const count = { functioning: t.functioning, non_functioning: t.nonFunctioning, abandoned: t.abandoned, unknown: t.unknown }[s];
              if (!count && s === 'unknown') return null;
              const Icon = STATUS_META[s].icon;
              return (
                <li key={s} className="flex items-center gap-1.5">
                  <Icon size={14} style={{ color: s === 'abandoned' ? '#c3c2b7' : STATUS_META[s].color }} aria-hidden />
                  <span className="font-semibold text-white">{formatNumber(count)}</span> {STATUS_META[s].label.toLowerCase()}
                </li>
              );
            })}
          </ul>
        </div>
        <StatTile
          label="Functioning rate"
          value={formatPercent(t.functioning, t.sources)}
          detail={`${formatNumber(t.functioning)} of ${formatNumber(t.sources)} sources working at last visit`}
          icon={CircleCheck}
          tone="brand"
        />
        <StatTile
          label="People using sources"
          value={formatCompact(t.peopleServed)}
          detail={`Including ${formatCompact(t.idpsServed)} IDPs · as reported per source`}
          icon={Users}
          tone="water"
        />
        <StatTile
          label="Livestock watered"
          value={formatCompact(t.livestock)}
          detail="Camels, cattle, sheep and goats · as reported"
          icon={Beef}
          tone="gold"
        />
      </div>

      {/* Water quality and maintenance */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link to="/water-quality?tab=results&outcome=unsafe" className="block rounded-xl transition hover:-translate-y-px hover:shadow-float">
          <StatTile
            label="Unsafe drinking water"
            value={formatNumber(summary.waterQuality.unsafe)}
            detail={
              summary.waterQuality.tested
                ? `Sources failing a health limit at their latest lab test · ${formatNumber(summary.waterQuality.tested)} tested`
                : 'No laboratory results recorded yet'
            }
            icon={ShieldAlert}
            tone={summary.waterQuality.unsafe ? 'gold' : 'neutral'}
          />
        </Link>
        <Link to="/maintenance" className="block rounded-xl transition hover:-translate-y-px hover:shadow-float">
          <StatTile
            label="Open work orders"
            value={formatNumber(summary.maintenance.open)}
            detail={`${formatNumber(summary.maintenance.urgent)} urgent · ${formatNumber(summary.maintenance.brokenWithoutOrder)} broken sources with no repair requested`}
            icon={Wrench}
            tone="water"
          />
        </Link>
        <StatTile
          label="Average time to repair"
          value={
            summary.maintenance.avgRepairDays === null
              ? '—'
              : summary.maintenance.avgRepairDays < 1
                ? '< 1 day'
                : `${formatNumber(summary.maintenance.avgRepairDays, summary.maintenance.avgRepairDays < 10 ? 1 : 0)} days`
          }
          detail={
            summary.maintenance.closedRecently
              ? `From report to closure · ${formatNumber(summary.maintenance.closedRecently)} repairs in the last 180 days`
              : 'No repairs closed in the last 180 days'
          }
          icon={Timer}
          tone="brand"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card
          className="xl:col-span-2"
          title="Sources by type"
          subtitle="Number registered, with the share functioning"
        >
          <BarList
            items={summary.byType.map((b) => ({
              key: b.type,
              text: TYPE_META[b.type].plural,
              label: TYPE_META[b.type].plural,
              marker: <TypeSwatch type={b.type} />,
              value: b.total,
              color: TYPE_META[b.type].color,
              note: b.total ? `${formatPercent(b.functioning, b.total)} working` : undefined,
            }))}
          />
        </Card>
        <Card className="xl:col-span-3" title="Condition by region" subtitle="Status recorded at the last visit">
          <StatusStackedBars regions={summary.byRegion} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card
          className="xl:col-span-3"
          title="Where the sources are"
          subtitle="Shape and colour show the source type"
          action={
            <Link to={`/map${regionQuery}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
              Open full map <ArrowRight size={15} aria-hidden />
            </Link>
          }
          bodyClassName=""
        >
          <WaterMap
            key={region ?? 'all'}
            data={geojson}
            className="h-[360px]"
            label="Map of water sources"
            scrollZoom={false}
          />
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line px-5 py-3" aria-label="Map legend">
            {summary.byType.map((b) => (
              <li key={b.type} className="flex items-center gap-1.5 text-xs text-ink-2">
                <TypeSwatch type={b.type} /> {TYPE_META[b.type].plural}
              </li>
            ))}
          </ul>
        </Card>

        <Card
          className="xl:col-span-2"
          title="Latest inspections"
          action={
            <Link to="/sources?sort=inspected&order=desc" className="text-sm font-medium text-brand-700 hover:text-brand-800">
              View all
            </Link>
          }
          bodyClassName="px-5 py-2"
        >
          {summary.recentInspections.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-3">No inspections recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {summary.recentInspections.map((i) => (
                <li key={i.id}>
                  <Link to={`/sources/${i.sourceId}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-page">
                    <TypeSwatch type={i.type} size={16} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{i.name}</div>
                      <div className="truncate text-xs text-ink-3">
                        {formatDate(i.inspectedOn)} · {i.agency ?? 'Agency not recorded'}
                      </div>
                    </div>
                    {i.status && <StatusBadge status={i.status} size="sm" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Power source" subtitle="What runs the pump">
          <BarList items={toBars(summary.byPower)} />
        </Card>
        <Card title="Water quality concerns" subtitle="Physical issues noted at the last visit">
          <BarList items={toBars(summary.byQuality)} color="#1a5a8c" />
        </Card>
        <Card title="Supply system condition" subtitle="Assessed at the last visit">
          <BarList items={toBars(summary.byCondition)} color="#0a6a2c" />
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-4 text-sm shadow-card">
        <div className="flex items-center gap-2 text-ink-2">
          <ShieldQuestion size={18} className="text-ink-3" aria-hidden />
          <span>
            <span className="font-semibold text-ink">{formatNumber(t.unverified)}</span> of {formatNumber(t.sources)} records
            have not yet been verified in the field.
          </span>
        </div>
        <Link to="/data-quality" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:text-brand-800">
          Review data quality <ArrowRight size={15} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function toBars(rows: { label: string; count: number }[]) {
  return rows.map((r) => ({ key: r.label, label: r.label, text: r.label, value: r.count }));
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <LoadingBlock rows={6} />
        </Card>
        <Card>
          <LoadingBlock rows={6} />
        </Card>
      </div>
    </div>
  );
}
