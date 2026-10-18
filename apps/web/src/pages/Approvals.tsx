import { Plus } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { TypeLabel } from '../components/ui/Badges';
import { Card } from '../components/ui/Card';
import { ChangeStatusBadge, KindBadge } from '../components/ui/ChangeStatusBadge';
import { Segmented } from '../components/ui/Controls';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';
import { useChangeRequests } from '../lib/queries';

type Box = 'review' | 'mine' | 'decided';

export function Approvals() {
  const { me, can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isReviewer = Boolean(me?.approvableTypes.length);
  const canPropose = can('sources.propose');

  const boxes: { value: Box; label: string }[] = [
    ...(isReviewer ? [{ value: 'review' as Box, label: 'Waiting for my review' }] : []),
    ...(canPropose ? [{ value: 'mine' as Box, label: 'Submitted by me' }] : []),
    { value: 'decided', label: 'Recently decided' },
  ];
  const requested = params.get('box') as Box | null;
  const box: Box = requested && boxes.some((b) => b.value === requested) ? requested : boxes[0].value;
  const list = useChangeRequests(box);

  const empty = {
    review: 'Nothing is waiting for your review.',
    mine: 'You have not submitted any changes yet.',
    decided: 'No requests have been decided yet.',
  }[box];

  return (
    <>
      <PageHeader
        eyebrow="Registry"
        title="Approvals"
        description={
          isReviewer
            ? `New sources and changes waiting for review. You approve: ${me!.approvableTypes.join(', ').replace(/_/g, ' ')}.`
            : 'Every new source and every change to the registry is reviewed by the responsible department before it takes effect.'
        }
        actions={
          canPropose && (
            <Link to="/sources/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-3.5 text-sm font-medium text-white shadow-card hover:bg-brand-800">
              <Plus size={16} aria-hidden /> Register a source
            </Link>
          )
        }
      />

      <Card
        bodyClassName="p-0"
        title={boxes.find((b) => b.value === box)?.label}
        action={boxes.length > 1 && <Segmented label="Show" value={box} options={boxes} onChange={(v) => setParams({ box: v }, { replace: true })} />}
      >
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : list.data.length === 0 ? (
          <EmptyState title={empty} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
                  <th className="px-4 py-3 font-medium">Request</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Region</th>
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((r) => (
                  <tr key={r.id} onClick={() => navigate(`/approvals/${r.id}`)} className="cursor-pointer border-b border-line last:border-0 hover:bg-brand-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <KindBadge kind={r.kind} />
                        <Link to={`/approvals/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:text-brand-700 hover:underline">
                          {r.sourceName ?? 'Unnamed source'}
                        </Link>
                      </div>
                      <div className="mt-0.5 text-xs text-ink-3">
                        {r.sourceCode ? `${r.sourceCode} · ` : ''}
                        {r.kind === 'update' ? `${r.fieldCount} field${r.fieldCount === 1 ? '' : 's'} changed` : 'New registration'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink">
                      <TypeLabel type={r.sourceType} />
                    </td>
                    <td className="px-4 py-3 text-ink">{r.regionName}</td>
                    <td className="px-4 py-3">
                      <div className="text-ink">{r.requestedBy}</div>
                      <div className="text-xs text-ink-3">{formatDate(r.requestedAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <ChangeStatusBadge status={r.status} size="sm" />
                      {r.reviewedBy && <div className="mt-1 text-xs text-ink-3">by {r.reviewedBy}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
