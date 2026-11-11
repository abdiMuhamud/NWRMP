import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CircleCheck, FileSpreadsheet, FileUp, RotateCcw, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { SeverityBadge } from '../components/ui/Badges';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Controls';
import { PageHeader } from '../components/ui/PageHeader';
import { useToast } from '../components/ui/Toast';
import { ApiError, apiUpload } from '../lib/api';
import { useAuth } from '../lib/auth';
import { TYPE_META } from '../lib/domain';
import { formatNumber } from '../lib/format';
import { useSummary } from '../lib/queries';
import type { ImportResult } from '../lib/types';

/**
 * Upload a workbook in the Ministry template: check it first (nothing is saved), then import.
 * Imported records are added as unverified; every problem goes to the Data quality page.
 */
export function ImportData() {
  const { me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const summary = useSummary();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removeSample, setRemoveSample] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = me?.user.role === 'admin';
  const sampleRecords = summary.data?.totals.sampleRecords ?? 0;

  const send = useMutation({
    mutationFn: ({ dryRun }: { dryRun: boolean }) => {
      const form = new FormData();
      form.append('file', file!);
      if (removeSample) form.append('removeSampleData', 'true');
      return apiUpload<ImportResult>(dryRun ? '/imports/preview' : '/imports', form);
    },
    onSuccess: (r) => {
      setError(null);
      if (r.dryRun) {
        setPreview(r);
        return;
      }
      setResult(r);
      for (const key of ['sources', 'sources-geojson', 'summary', 'report-summary', 'data-quality']) queryClient.invalidateQueries({ queryKey: [key] });
      toast(`${formatNumber(r.imported)} sources imported`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'The file could not be processed'),
  });

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setRemoveSample(false);
    if (input.current) input.current.value = '';
  };

  return (
    <>
      <PageHeader
        eyebrow="Registry"
        title="Import data"
        description="Add water sources from an Excel workbook in the Ministry template: one sheet per source type. Check the file first; nothing is saved until you import."
      />

      {result ? (
        <Card>
          <div className="flex flex-col items-start gap-4">
            <span className="inline-flex items-center gap-2 text-lg font-semibold text-good-ink">
              <CircleCheck size={22} aria-hidden /> {formatNumber(result.imported)} sources imported
            </span>
            <ResultFigures r={result} />
            <p className="text-sm text-ink-2">
              The new records are marked <span className="font-medium text-ink">unverified</span> until a field inspection confirms them. Every
              problem found is listed on the Data quality page.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/data-quality" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-3.5 text-sm font-medium text-white hover:bg-brand-800">
                Review data quality <ArrowRight size={16} aria-hidden />
              </Link>
              <Link to="/sources?verification=unverified" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-page">
                Open the water sources
              </Link>
              <Button variant="ghost" onClick={reset}>
                <RotateCcw size={16} aria-hidden /> Import another file
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card title="1. Choose the workbook">
            <div className="space-y-4">
              <label
                htmlFor="workbook"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-page px-4 py-8 text-center hover:border-brand-600"
              >
                <FileSpreadsheet size={28} className="text-brand-700" aria-hidden />
                <span className="text-sm font-medium text-ink">{file ? file.name : 'Choose an Excel file (.xlsx)'}</span>
                <span className="text-xs text-ink-3">{file ? `${formatNumber(Math.max(1, Math.round(file.size / 1024)))} KB` : 'Up to 10 MB, in the Ministry template'}</span>
              </label>
              <input
                ref={input}
                id="workbook"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                  setError(null);
                }}
              />
              {isAdmin && sampleRecords > 0 && (
                <label className="flex items-start gap-2.5 rounded-lg border border-gold-300/70 bg-gold-100/60 px-3 py-2.5 text-sm text-gold-800">
                  <input
                    type="checkbox"
                    checked={removeSample}
                    onChange={(e) => {
                      setRemoveSample(e.target.checked);
                      setPreview(null);
                    }}
                    className="mt-0.5 size-4 accent-brand-700"
                  />
                  <span>
                    <span className="font-semibold">Remove the {formatNumber(sampleRecords)} sample records first.</span> Their test inspections, lab
                    results and work orders are removed too. Use this when importing the real data.
                  </span>
                </label>
              )}
              {error && (
                <p role="alert" className="rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical-ink">
                  {error}
                </p>
              )}
              <Button variant="primary" className="w-full" disabled={!file || send.isPending} onClick={() => send.mutate({ dryRun: true })}>
                <FileUp size={16} aria-hidden /> {send.isPending && !preview ? 'Checking…' : 'Check the file'}
              </Button>
              <p className="text-xs text-ink-3">
                Checking reads every row exactly as the import would, then discards the result. Large files can take a minute.
              </p>
            </div>
          </Card>

          <Card title="2. Check what will happen" bodyClassName={preview ? 'p-0' : 'p-5'}>
            {!preview ? (
              <p className="text-sm text-ink-3">Choose a workbook and check it to see what the import will add and any problems in the file.</p>
            ) : (
              <>
                <div className="space-y-4 p-5">
                  <ResultFigures r={preview} preview />
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-xs text-ink-2">
                          <th className="py-2 pr-3 font-medium">Sheet</th>
                          <th className="py-2 pr-3 font-medium">Read as</th>
                          <th className="py-2 pr-3 text-right font-medium">Rows</th>
                          <th className="py-2 pr-3 text-right font-medium">Will be added</th>
                          <th className="py-2 text-right font-medium">Skipped</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sheets.map((s) => (
                          <tr key={s.sheet} className="border-b border-line last:border-0">
                            <td className="py-2 pr-3 font-medium text-ink">{s.sheet}</td>
                            <td className="py-2 pr-3 text-ink-2">{s.type ? TYPE_META[s.type].plural : <span className="text-ink-3">Type per row</span>}</td>
                            <td className="py-2 pr-3 text-right tabular">{formatNumber(s.rows)}</td>
                            <td className="py-2 pr-3 text-right tabular font-medium text-ink">{formatNumber(s.imported)}</td>
                            <td className={`py-2 text-right tabular ${s.skipped ? 'font-medium text-critical-ink' : ''}`}>{formatNumber(s.skipped)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.imported === 0 ? (
                    <p className="flex gap-2 rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical-ink">
                      <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> No rows can be imported. Check the problems below and the
                      template.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="primary" disabled={send.isPending} onClick={() => send.mutate({ dryRun: false })}>
                        {send.isPending ? 'Importing…' : `Import ${formatNumber(preview.imported)} sources`}
                      </Button>
                      <span className="text-xs text-ink-3">
                        {preview.removedSample ? `${formatNumber(preview.removedSample)} sample records will be removed first. ` : ''}
                        Records are added as unverified.
                      </span>
                    </div>
                  )}
                </div>
                {preview.firstIssues.length > 0 && (
                  <div className="border-t border-line">
                    <div className="px-5 pb-2 pt-4 text-sm font-semibold text-ink">
                      Problems found{' '}
                      <span className="font-normal text-ink-3">
                        (showing {formatNumber(preview.firstIssues.length)} of {formatNumber(preview.issues.error + preview.issues.warning + preview.issues.info)})
                      </span>
                    </div>
                    <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
                      {preview.firstIssues.map((issue, i) => (
                        <li key={i} className="flex gap-3 px-5 py-2.5 text-sm">
                          <SeverityBadge severity={issue.severity} />
                          <div className="min-w-0">
                            <div className="text-ink">{issue.message}</div>
                            <div className="text-xs text-ink-3">
                              {[issue.sheet, issue.row ? `row ${issue.row}` : null, issue.field].filter(Boolean).join(' · ')}
                              {issue.original && (
                                <>
                                  {' '}
                                  · value <span className="font-mono">{issue.original}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function ResultFigures({ r, preview }: { r: ImportResult; preview?: boolean }) {
  const figures = [
    { label: preview ? 'Will be added' : 'Added', value: r.imported, tone: 'text-ink' },
    { label: 'Rows skipped', value: r.skipped, tone: r.skipped ? 'text-critical-ink' : 'text-ink' },
    { label: 'Possible duplicates', value: r.possibleDuplicates, tone: r.possibleDuplicates ? 'text-warn-ink' : 'text-ink' },
    { label: 'Errors', value: r.issues.error, tone: r.issues.error ? 'text-critical-ink' : 'text-ink' },
    { label: 'Warnings', value: r.issues.warning, tone: r.issues.warning ? 'text-warn-ink' : 'text-ink' },
    ...(r.removedSample ? [{ label: preview ? 'Sample records to remove' : 'Sample records removed', value: r.removedSample, tone: 'text-ink' }] : []),
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {figures.map((f) => (
        <div key={f.label} className="rounded-lg bg-page px-3 py-2">
          <dt className="text-xs text-ink-3">{f.label}</dt>
          <dd className={`text-xl font-semibold tabular ${f.tone}`}>{formatNumber(f.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
