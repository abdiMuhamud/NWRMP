import { FlaskConical, Pencil, Plus, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ParameterDialog } from '../../components/quality/ParameterDialog';
import { RequestTestDialog } from '../../components/quality/RequestTestDialog';
import { SourcePicker, type PickedSource } from '../../components/SourcePicker';
import { TypeLabel } from '../../components/ui/Badges';
import { Card } from '../../components/ui/Card';
import { Button, Segmented } from '../../components/ui/Controls';
import { Dialog } from '../../components/ui/Dialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { OutcomeBadge } from '../../components/ui/StateBadges';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { KIND_LABELS, limitText, num } from '../../lib/quality';
import { useLabCounts, useTests, useWqParameters } from '../../lib/queries';
import type { TestListItem, WqParameter } from '../../lib/types';

type Tab = 'queue' | 'mine' | 'results' | 'limits';

export function WaterQuality() {
  const { can, me } = useAuth();
  const [params, setParams] = useSearchParams();
  const counts = useLabCounts(Boolean(me));
  const [requestOpen, setRequestOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const isLab = can('lab.record');

  const tabs: { value: Tab; label: string }[] = [
    ...(isLab ? [{ value: 'queue' as Tab, label: `Waiting for the lab${counts.data?.queue ? ` (${counts.data.queue})` : ''}` }] : []),
    ...(can('lab.request') ? [{ value: 'mine' as Tab, label: 'My requests' }] : []),
    { value: 'results', label: 'Results' },
    { value: 'limits', label: 'Limits' },
  ];
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = requested && tabs.some((t) => t.value === requested) ? requested : tabs[0].value;

  return (
    <>
      <PageHeader
        eyebrow="Water Quality Lab"
        title="Water quality"
        description="Laboratory results for each water source, checked against the drinking-water limits."
        actions={
          <>
            {can('lab.request') && (
              <Button onClick={() => setRequestOpen(true)}>
                <Send size={16} aria-hidden /> Request a test
              </Button>
            )}
            {isLab && (
              <Button variant="primary" onClick={() => setRecordOpen(true)}>
                <FlaskConical size={16} aria-hidden /> Record a test
              </Button>
            )}
          </>
        }
      />
      {counts.data && counts.data.unsafeSources > 0 && (
        <button
          type="button"
          onClick={() => setParams({ tab: 'results', outcome: 'unsafe' }, { replace: true })}
          className="mb-6 flex w-full items-center gap-3 rounded-xl border border-critical/30 bg-critical-wash px-4 py-3 text-left text-sm text-critical-ink hover:brightness-[0.98]"
        >
          <OutcomeBadge outcome="unsafe" size="sm" short />
          <span>
            <span className="font-semibold">
              {counts.data.unsafeSources} source{counts.data.unsafeSources === 1 ? '' : 's'}
            </span>{' '}
            failed a health limit at the latest test. Show them.
          </span>
        </button>
      )}
      <Card
        bodyClassName="p-0"
        title={tabs.find((t) => t.value === tab)?.label.replace(/ \(\d+\)$/, '')}
        action={<Segmented label="Show" value={tab} options={tabs} onChange={(v) => setParams({ tab: v }, { replace: true })} />}
      >
        {tab === 'limits' ? <LimitsTable /> : tab === 'results' ? <ResultsTab /> : <TestTable box={tab} />}
      </Card>
      {requestOpen && <RequestTestDialog open onClose={() => setRequestOpen(false)} />}
      {recordOpen && <RecordDialog onClose={() => setRecordOpen(false)} />}
    </>
  );
}

function ResultsTab() {
  const [params, setParams] = useSearchParams();
  const outcome = params.get('outcome') ?? '';
  return (
    <>
      <div className="border-b border-line px-5 py-3">
        <Segmented
          label="Outcome"
          value={outcome}
          options={[
            { value: '', label: 'All' },
            { value: 'unsafe', label: 'Unsafe' },
            { value: 'concern', label: 'Concern' },
            { value: 'meets', label: 'Meets standards' },
          ]}
          onChange={(v) => setParams(v ? { tab: 'results', outcome: v } : { tab: 'results' }, { replace: true })}
        />
      </div>
      <TestTable box="recent" outcome={outcome || undefined} />
    </>
  );
}

function TestTable({ box, outcome }: { box: 'queue' | 'mine' | 'recent'; outcome?: string }) {
  const list = useTests(box, outcome);
  const navigate = useNavigate();
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  if (!list.data) return <LoadingRows />;
  if (list.data.length === 0) {
    return (
      <EmptyState title={box === 'queue' ? 'No tests waiting for the lab' : box === 'mine' ? 'You have not requested any tests' : 'No results recorded yet'}>
        {box === 'mine' && 'Use “Request a test” here or on a water source’s page.'}
      </EmptyState>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[780px] text-sm">
        <thead>
          <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Sample</th>
            <th className="px-4 py-3 font-medium">{box === 'queue' ? 'Request' : 'Result'}</th>
            <th className="px-4 py-3 font-medium">{box === 'queue' ? 'Requested by' : 'Recorded by'}</th>
          </tr>
        </thead>
        <tbody>
          {list.data.map((t) => (
            <tr key={t.id} onClick={() => navigate(`/water-quality/tests/${t.id}`)} className="cursor-pointer border-b border-line align-top last:border-0 hover:bg-brand-50/50">
              <td className="px-4 py-3">
                <Link to={`/water-quality/tests/${t.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:text-brand-700 hover:underline">
                  {t.name}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                  <TypeLabel type={t.type} /> · {t.code} · {t.region}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="text-ink">{t.sampledOn ? formatDate(t.sampledOn) : 'Not sampled yet'}</div>
                {t.samplePoint && <div className="text-xs text-ink-3">{t.samplePoint}</div>}
              </td>
              <td className="px-4 py-3">
                {t.state === 'requested' ? (
                  <>
                    <span className="text-xs font-medium text-gold-800">Waiting for the lab</span>
                    {t.requestNote && <p className="mt-0.5 line-clamp-2 max-w-xs text-xs text-ink-2">{t.requestNote}</p>}
                  </>
                ) : (
                  <ResultCell t={t} />
                )}
              </td>
              <td className="px-4 py-3 text-ink-2">
                {box === 'queue' || t.state === 'requested' ? (
                  <>
                    {t.requestedBy ?? '—'}
                    <div className="text-xs text-ink-3">{formatDate(t.requestedAt)}</div>
                  </>
                ) : (
                  <>
                    {t.recordedBy ?? '—'}
                    <div className="text-xs text-ink-3">{formatDate(t.recordedAt)}</div>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultCell({ t }: { t: TestListItem }) {
  return (
    <div className="space-y-1">
      <OutcomeBadge outcome={t.outcome} size="sm" />
      {t.exceedances.length > 0 && (
        <ul className="text-xs text-ink-2">
          {t.exceedances.map((e) => (
            <li key={e.label}>
              <span className={e.kind === 'health' ? 'font-medium text-critical-ink' : 'text-warn-ink'}>{e.label}</span> {num(e.value)}
              {e.unit && ` ${e.unit}`} <span className="text-ink-3">({e.flag === 'low' ? `min ${num(e.min!)}` : `limit ${num(e.max!)}`})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LimitsTable() {
  const { can } = useAuth();
  const parameters = useWqParameters();
  const [editing, setEditing] = useState<WqParameter | 'new' | null>(null);
  const canEdit = can('lab.standards');

  if (parameters.isError) return <ErrorState error={parameters.error} onRetry={() => parameters.refetch()} />;
  if (!parameters.data) return <LoadingRows />;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm text-ink-2">
        <p className="max-w-2xl">
          Default values are WHO drinking-water guidelines. Replace them with the national standard where it differs: results already recorded keep the
          limit they were judged against.
        </p>
        {canEdit && (
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} aria-hidden /> Add parameter
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
              <th className="px-4 py-3 font-medium">Parameter</th>
              <th className="px-4 py-3 font-medium">Limit</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Source of the limit</th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {parameters.data.map((p) => (
              <tr key={p.code} className={`border-b border-line align-top last:border-0 ${p.active ? '' : 'text-ink-3'}`}>
                <td className="px-4 py-3 font-medium text-ink">
                  {p.label}
                  {!p.active && <span className="ml-2 text-xs font-normal text-ink-3">(not measured)</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular text-ink">{limitText(p, p.unit)}</td>
                <td className="px-4 py-3">
                  <span className={p.kind === 'health' ? 'font-medium text-critical-ink' : p.kind === 'aesthetic' ? 'text-warn-ink' : 'text-ink-3'}>
                    {KIND_LABELS[p.kind]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-ink-2">{p.basis ?? '—'}</td>
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => setEditing(p)}>
                      <Pencil size={13} aria-hidden /> Edit
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <ParameterDialog parameter={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Choose the source, then open the results form. */
function RecordDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [picked, setPicked] = useState<PickedSource | null>(null);
  const [error, setError] = useState<string | undefined>();
  return (
    <Dialog
      open
      onClose={onClose}
      title="Record a test"
      description="For a sample the lab collected itself. Requested tests are in “Waiting for the lab”."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => (picked ? navigate(`/water-quality/record?source=${picked.id}`) : setError('Choose the water source'))}
          >
            Continue
          </Button>
        </>
      }
    >
      <SourcePicker value={picked} onChange={(s) => (setPicked(s), setError(undefined))} error={error} />
    </Dialog>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}
