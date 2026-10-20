import { ChevronDown, FileSpreadsheet, FlaskConical, PencilLine, PlusCircle, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { changeRows } from '../lib/fields';
import { formatDate } from '../lib/format';
import { useReference, useSourceHistory } from '../lib/queries';
import type { HistoryEntry, SourceDetail } from '../lib/types';
import { Card } from './ui/Card';
import { LoadingBlock } from './ui/States';

/** Who changed what and when: approved changes from the audit log, plus where the record came from. */
export function SourceHistory({ source }: { source: SourceDetail & { createdAt?: string } }) {
  const history = useSourceHistory(source.id);
  const entries = history.data ?? [];
  const createdInApp = entries.some((e) => e.action === 'source.create');

  return (
    <Card title="Change history" subtitle="Approved changes, lab tests and repairs, newest first" bodyClassName="px-5 py-4">
      {!history.data ? (
        <LoadingBlock rows={3} />
      ) : (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {entries.map((e) => (
            <HistoryItem key={e.id} entry={e} source={source} />
          ))}
          {!createdInApp && (
            <li className="relative">
              <Dot>
                <FileSpreadsheet size={11} aria-hidden />
              </Dot>
              <div className="text-sm font-medium text-ink">Imported</div>
              <div className="text-xs text-ink-2">
                From {source.dataSource ?? 'an earlier dataset'}
                {source.legacyRef ? ` (${source.legacyRef})` : ''}
                {source.createdAt ? ` · ${formatDate(source.createdAt)}` : ''}
              </div>
            </li>
          )}
        </ol>
      )}
    </Card>
  );
}

function HistoryItem({ entry, source }: { entry: HistoryEntry; source: SourceDetail }) {
  const reference = useReference();
  const [open, setOpen] = useState(false);
  const proposed = entry.changes?.proposed;
  const rows = proposed ? changeRows(reference.data, source.type, proposed, entry.changes?.previous ?? null) : [];
  const isCreate = entry.action === 'source.create';
  const links = (entry.changes ?? {}) as { inspectionId?: string; testId?: string; workOrderId?: string };
  const inspectionId = links.inspectionId;
  const isLab = entry.action.startsWith('source.lab');
  const isRepair = entry.action === 'source.repair';
  const verb = isLab ? 'Recorded' : isRepair ? 'Closed' : 'Approved';

  return (
    <li className="relative">
      <Dot>
        {isCreate ? (
          <PlusCircle size={11} aria-hidden />
        ) : isLab ? (
          <FlaskConical size={11} aria-hidden />
        ) : isRepair ? (
          <Wrench size={11} aria-hidden />
        ) : (
          <PencilLine size={11} aria-hidden />
        )}
      </Dot>
      <div className="text-sm font-medium text-ink">{isCreate ? 'Registered' : entry.summary}</div>
      <div className="text-xs text-ink-2">
        {verb} by {entry.userName ?? 'unknown'} · {formatDate(entry.at)}
        {entry.changes?.requestedBy && <> · {inspectionId ? 'inspected' : isRepair ? 'repaired' : 'proposed'} by {entry.changes.requestedBy}</>}
      </div>
      {!isCreate && rows.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
          >
            {open ? 'Hide' : 'Show'} details <ChevronDown size={13} className={open ? 'rotate-180' : ''} aria-hidden />
          </button>
          {open && (
            <ul className="mt-2 space-y-1.5 rounded-lg bg-page px-3 py-2 text-xs">
              {rows.map((r) => (
                <li key={r.key}>
                  <span className="text-ink-3">{r.label}: </span>
                  <span className="text-ink-2 line-through decoration-ink-3/50">{r.before}</span>
                  <span className="text-ink-3"> → </span>
                  <span className="font-medium text-ink">{r.after}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {inspectionId && (
        <Link to={`/inspections/${inspectionId}`} className="mt-1 block text-xs text-ink-3 hover:text-brand-700 hover:underline">
          View inspection
        </Link>
      )}
      {links.testId && (
        <Link to={`/water-quality/tests/${links.testId}`} className="mt-1 block text-xs text-ink-3 hover:text-brand-700 hover:underline">
          View test
        </Link>
      )}
      {links.workOrderId && (
        <Link to={`/maintenance/${links.workOrderId}`} className="mt-1 block text-xs text-ink-3 hover:text-brand-700 hover:underline">
          View work order
        </Link>
      )}
      {entry.changes?.requestId && (
        <Link to={`/approvals/${entry.changes.requestId}`} className="mt-1 block text-xs text-ink-3 hover:text-brand-700 hover:underline">
          View request
        </Link>
      )}
    </li>
  );
}

function Dot({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute -left-[29px] top-0.5 grid size-[17px] place-items-center rounded-full bg-surface text-brand-700 ring-2 ring-brand-600">
      {children}
    </span>
  );
}
