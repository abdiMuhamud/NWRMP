import { Download, FileSpreadsheet, Info, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Card } from '../components/ui/Card';
import { Button, Select } from '../components/ui/Controls';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorState, LoadingBlock } from '../components/ui/States';
import { apiHref } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatNumber, formatPercent } from '../lib/format';
import { useReference, useReportSummary } from '../lib/queries';
import type { ReportSummary } from '../lib/types';

const EXPORTS: { dataset: string; title: string; detail: string; adminOnly?: boolean }[] = [
  { dataset: 'summary', title: 'Summary report', detail: 'The figures and tables on this page, one sheet each' },
  { dataset: 'sources', title: 'Water sources', detail: 'Every field of every record, with the latest lab result and open work orders' },
  { dataset: 'inspections', title: 'Inspections', detail: 'Field inspections and imported visits, with reviewer and GPS distance' },
  { dataset: 'lab-results', title: 'Water quality results', detail: 'One row per test, one column per parameter, with the outcome' },
  { dataset: 'work-orders', title: 'Maintenance work orders', detail: 'Breakdowns, repairs, parts, costs and days to repair' },
  { dataset: 'audit', title: 'Audit log', detail: 'Who did what and when (administrators only)', adminOnly: true },
];

export function Reports() {
  const [params, setParams] = useSearchParams();
  const { scopeRegionId, can } = useAuth();
  const reference = useReference();
  const region = scopeRegionId ?? (Number(params.get('region')) || undefined);
  const report = useReportSummary(region);
  const regionQuery = region ? { region } : {};

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          eyebrow="Reports"
          title="Summary report"
          description="Condition of the water sources, water quality and maintenance. Print it or save it as PDF, or download the data in Excel."
          actions={
            <>
              {!scopeRegionId && (
                <Select label="Region" hideLabel value={region ?? ''} onChange={(v) => setParams(v ? { region: v } : {})} className="w-48">
                  <option value="">All regions</option>
                  {reference.data?.regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              )}
              <a
                href={apiHref('/exports/summary', regionQuery)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-page"
              >
                <FileSpreadsheet size={16} aria-hidden /> Excel
              </a>
              <Button variant="primary" onClick={() => window.print()} disabled={!report.data}>
                <Printer size={16} aria-hidden /> Print or save as PDF
              </Button>
            </>
          }
        />
      </div>

      {report.isError ? (
        <Card>
          <ErrorState error={report.error} onRetry={() => report.refetch()} />
        </Card>
      ) : !report.data ? (
        <Card>
          <LoadingBlock rows={10} />
        </Card>
      ) : (
        <ReportDocument r={report.data} />
      )}

      <div className="mt-6 print:hidden">
        <Card title="Download data in Excel" subtitle={region ? `Limited to ${report.data?.region?.name ?? 'the selected region'}` : 'All regions'} bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {EXPORTS.filter((e) => !e.adminOnly || can('audit.view')).map((e) => (
              <li key={e.dataset} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="text-sm font-medium text-ink">{e.title}</div>
                  <div className="text-xs text-ink-3">{e.detail}</div>
                </div>
                <a
                  href={apiHref(`/exports/${e.dataset}`, e.dataset === 'audit' ? {} : regionQuery)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-page"
                >
                  <Download size={15} aria-hidden /> Download .xlsx
                </a>
              </li>
            ))}
          </ul>
        </Card>
        <p className="mt-3 text-xs text-ink-3">
          The water-source list on the Water sources page has its own export of the rows you have filtered.
        </p>
      </div>
    </>
  );
}

/** The printable report: Ministry letterhead, key figures and tables. */
function ReportDocument({ r }: { r: ReportSummary }) {
  const t = r.totals;
  const regionTotals = r.byRegion.reduce(
    (a, x) => ({
      total: a.total + x.total,
      functioning: a.functioning + x.functioning,
      nonFunctioning: a.nonFunctioning + x.nonFunctioning,
      abandoned: a.abandoned + x.abandoned,
      unknown: a.unknown + x.unknown,
      peopleServed: a.peopleServed + x.peopleServed,
      tested: a.tested + x.tested,
      unsafe: a.unsafe + x.unsafe,
      openWorkOrders: a.openWorkOrders + x.openWorkOrders,
    }),
    { total: 0, functioning: 0, nonFunctioning: 0, abandoned: 0, unknown: 0, peopleServed: 0, tested: 0, unsafe: 0, openWorkOrders: 0 },
  );
  const m = r.maintenance;

  return (
    <article className="rounded-xl border border-line bg-surface p-6 shadow-card sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-brand-700 pb-5">
        <img src="/brand/ministry-logo.png" alt="Republic of Somaliland, Ministry of Water Development" className="h-16 w-auto sm:h-20" />
        <div className="text-right">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">National Water Resource Management Platform</div>
          <h1 className="mt-1 text-xl font-semibold text-ink sm:text-2xl">Water sources summary report</h1>
          <div className="mt-0.5 text-sm text-ink-2">
            {r.region ? r.region.name : 'All regions'} · {formatDate(r.generatedAt)}
          </div>
        </div>
      </header>

      {t.sampleRecords > 0 && (
        <p className="mt-5 flex gap-2 rounded-lg bg-water-50 px-4 py-2.5 text-sm text-water-700 print:border print:border-water-100">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
          Includes {formatNumber(t.sampleRecords)} sample (example) records. Figures are for testing only and are not official statistics.
        </p>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
        <Figure label="Registered water sources" value={formatNumber(t.sources)} note={`${formatNumber(t.verified)} verified in the field`} />
        <Figure label="Functioning rate" value={formatPercent(t.functioning, t.sources)} note={`${formatNumber(t.functioning)} functioning · ${formatNumber(t.nonFunctioning)} not functioning`} />
        <Figure label="People using sources" value={formatNumber(t.peopleServed)} note={`Including ${formatNumber(t.idpsServed)} IDPs · as reported`} />
        <Figure
          label="Unsafe drinking water"
          value={formatNumber(r.waterQuality.unsafe)}
          note={`of ${formatNumber(r.waterQuality.tested)} sources tested (latest test)`}
          alert={r.waterQuality.unsafe > 0}
        />
        <Figure label="Open work orders" value={formatNumber(m.open)} note={`${formatNumber(m.urgent)} urgent · ${formatNumber(m.brokenWithoutOrder)} broken with no request`} />
        <Figure
          label="Average time to repair"
          value={m.avgRepairDays === null ? '—' : m.avgRepairDays < 1 ? '< 1 day' : `${formatNumber(m.avgRepairDays, 1)} days`}
          note={`${formatNumber(m.closed12m)} repairs closed in 12 months`}
        />
      </section>

      <Section title="Sources by region" note="Status recorded at the last visit; lab results are the latest test of each source.">
        <Table
          head={['Region', 'Sources', 'Functioning', 'Not functioning', 'Abandoned', 'Unknown', 'Functioning rate', 'People served', 'Lab tested', 'Unsafe', 'Open work orders']}
          rows={r.byRegion.map((x) => [
            x.name,
            n(x.total),
            n(x.functioning),
            n(x.nonFunctioning),
            n(x.abandoned),
            n(x.unknown),
            formatPercent(x.functioning, x.total),
            n(x.peopleServed),
            n(x.tested),
            x.unsafe ? <span className="font-semibold text-critical-ink">{n(x.unsafe)}</span> : '0',
            n(x.openWorkOrders),
          ])}
          foot={
            r.byRegion.length > 1
              ? [
                  'Total',
                  n(regionTotals.total),
                  n(regionTotals.functioning),
                  n(regionTotals.nonFunctioning),
                  n(regionTotals.abandoned),
                  n(regionTotals.unknown),
                  formatPercent(regionTotals.functioning, regionTotals.total),
                  n(regionTotals.peopleServed),
                  n(regionTotals.tested),
                  n(regionTotals.unsafe),
                  n(regionTotals.openWorkOrders),
                ]
              : undefined
          }
        />
      </Section>

      <Section title="Sources by type">
        <Table
          head={['Type', 'Sources', 'Functioning', 'Not functioning', 'Abandoned', 'Unknown', 'Functioning rate', 'People served']}
          rows={r.byType.map((x) => [x.label, n(x.total), n(x.functioning), n(x.nonFunctioning), n(x.abandoned), n(x.unknown), x.total ? formatPercent(x.functioning, x.total) : '—', n(x.peopleServed)])}
        />
      </Section>

      <div className="grid gap-x-8 lg:grid-cols-2 print:grid-cols-2">
        <Section
          title="Water quality at the latest test"
          note={`${n(r.waterQuality.tested)} sources tested: ${n(r.waterQuality.meets)} meet the standards, ${n(r.waterQuality.concern)} with a taste or appearance concern, ${n(r.waterQuality.unsafe)} unsafe.`}
        >
          {r.waterQuality.exceedances.length === 0 ? (
            <p className="text-sm text-ink-3">No parameter outside its limit at the latest tests.</p>
          ) : (
            <Table
              head={['Parameter outside the limit', 'Limit type', 'Sources']}
              rows={r.waterQuality.exceedances.map((e) => [
                `${e.label}${e.unit ? ` (${e.unit})` : ''}`,
                e.kind === 'health' ? <span className="text-critical-ink">Health</span> : 'Taste or appearance',
                n(e.sources),
              ])}
            />
          )}
        </Section>
        <Section title="Maintenance" note={`Repair costs in the last 12 months: US$ ${formatNumber(m.cost12m, 2)}.`}>
          <Table
            head={['Type of problem', 'Open', 'Closed (12 months)', 'Average days', 'Cost (US$)']}
            rows={m.byCategory.map((c) => [c.label, n(c.open), n(c.closed12m), c.avgRepairDays === null ? '—' : formatNumber(c.avgRepairDays, 1), formatNumber(Math.round(c.cost12m))])}
          />
        </Section>
      </div>

      <footer className="mt-8 border-t border-line pt-3 text-xs text-ink-3">
        Ministry of Water Development · NWRMP · Figures as recorded in the registry on {formatDate(r.generatedAt)}. People and livestock served
        are as reported per source at the last visit. Field inspections in the last 12 months: {n(r.inspections.fieldInspections12m)} (
        {n(r.inspections.sourcesVisited12m)} sources visited).
      </footer>
    </article>
  );
}

const n = (v: number) => formatNumber(v);

function Figure({ label, value, note, alert }: { label: string; value: string; note: string; alert?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 break-inside-avoid ${alert ? 'border-critical/30 bg-critical-wash' : 'border-line bg-page'}`}>
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${alert ? 'text-critical-ink' : 'text-ink'}`}>{value}</div>
      <div className="mt-0.5 text-xs text-ink-3">{note}</div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-8 break-inside-avoid">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-ink-3">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Table({ head, rows, foot }: { head: string[]; rows: ReactNode[][]; foot?: ReactNode[] }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-[520px] border-collapse text-sm print:min-w-0 print:text-[11px]">
        <thead>
          <tr className="border-b-2 border-line-strong text-left text-xs text-ink-2">
            {head.map((h, i) => (
              <th key={h} className={`px-2 py-2 font-semibold ${i ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-line">
              {row.map((cell, i) => (
                <td key={i} className={`px-2 py-1.5 ${i ? 'text-right tabular' : 'text-ink'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr className="border-t-2 border-line-strong font-semibold text-ink">
              {foot.map((cell, i) => (
                <td key={i} className={`px-2 py-2 ${i ? 'text-right tabular' : ''}`}>
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
