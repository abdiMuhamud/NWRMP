import { CircleAlert, FileWarning, Info, TriangleAlert } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { BarList } from '../components/charts/BarList';
import { SeverityBadge } from '../components/ui/Badges';
import { Card } from '../components/ui/Card';
import { Segmented } from '../components/ui/Controls';
import { PageHeader } from '../components/ui/PageHeader';
import { StatTile } from '../components/ui/StatTile';
import { EmptyState, ErrorState, LoadingBlock } from '../components/ui/States';
import { SEVERITY_META } from '../lib/domain';
import { formatNumber } from '../lib/format';
import { useQualityReport } from '../lib/queries';
import type { Severity } from '../lib/types';

type Filter = 'all' | Severity;

export function DataQuality() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('severity') as Filter) || 'all';
  const report = useQualityReport(filter === 'all' ? undefined : filter);
  const t = report.data?.totals;

  return (
    <>
      <PageHeader
        eyebrow="Registry"
        title="Data quality"
        description="Problems found while importing spreadsheets. Each one points to the record and the original value, so data officers can correct it at source or during the next field visit."
      />

      {report.isError ? (
        <Card>
          <ErrorState error={report.error} onRetry={() => report.refetch()} />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Errors" value={t ? formatNumber(t.error) : '—'} detail="Rows that could not be imported" icon={CircleAlert} tone="neutral" />
            <StatTile label="Warnings" value={t ? formatNumber(t.warning) : '—'} detail="Imported, but need checking" icon={TriangleAlert} tone="gold" />
            <StatTile label="Notes" value={t ? formatNumber(t.info) : '—'} detail="Automatic corrections made" icon={Info} tone="water" />
            <StatTile label="Records affected" value={t ? formatNumber(t.sourcesAffected) : '—'} detail="Water sources with at least one issue" icon={FileWarning} tone="brand" />
          </div>

          <Card title="Most common issues" subtitle="Similar messages grouped together">
            {!report.data ? (
              <LoadingBlock rows={5} />
            ) : report.data.byMessage.length === 0 ? (
              <p className="text-sm text-ink-3">No issues found.</p>
            ) : (
              <BarList
                unit="issues"
                items={report.data.byMessage.map((m) => ({
                  key: `${m.severity}-${m.pattern}`,
                  text: m.pattern,
                  label: m.pattern,
                  value: m.count,
                  color: SEVERITY_META[m.severity].color,
                  marker: <span className="size-2 shrink-0 rounded-full" style={{ background: SEVERITY_META[m.severity].color }} />,
                }))}
              />
            )}
          </Card>

          <Card
            title="All issues"
            action={
              <Segmented<Filter>
                label="Filter by severity"
                value={filter}
                onChange={(v) => setParams(v === 'all' ? {} : { severity: v }, { replace: true })}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'error', label: 'Errors' },
                  { value: 'warning', label: 'Warnings' },
                  { value: 'info', label: 'Notes' },
                ]}
              />
            }
            bodyClassName="p-0"
          >
            {!report.data ? (
              <div className="p-5">
                <LoadingBlock rows={6} />
              </div>
            ) : report.data.items.length === 0 ? (
              <EmptyState title="Nothing to review">No issues with this severity.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
                      <th className="px-4 py-3 font-medium">Severity</th>
                      <th className="px-4 py-3 font-medium">Record</th>
                      <th className="px-4 py-3 font-medium">Issue</th>
                      <th className="px-4 py-3 font-medium">Value in sheet</th>
                      <th className="px-4 py-3 font-medium">Location in file</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.items.map((i) => (
                      <tr key={i.id} className="border-b border-line align-top last:border-0">
                        <td className="px-4 py-3">
                          <SeverityBadge severity={i.severity} />
                        </td>
                        <td className="px-4 py-3">
                          {i.sourceId ? (
                            <Link to={`/sources/${i.sourceId}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
                              {i.name}
                              <span className="block font-mono text-xs font-normal text-ink-3">{i.code}</span>
                            </Link>
                          ) : (
                            <span className="text-ink-3">Whole sheet</span>
                          )}
                        </td>
                        <td className="max-w-md px-4 py-3 text-ink">{i.message}</td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-2">{i.originalValue ?? '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-3">
                          {i.sheet ? `${i.sheet}${i.rowNumber ? `, row ${i.rowNumber}` : ''}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
