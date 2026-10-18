import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Card } from '../../components/ui/Card';
import { Button, Select } from '../../components/ui/Controls';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { formatNumber } from '../../lib/format';
import { useAudit } from '../../lib/queries';

const ACTIONS = [
  { value: '', label: 'All activity' },
  { value: 'auth.', label: 'Sign-ins' },
  { value: 'change.', label: 'Approval requests' },
  { value: 'source.', label: 'Registry changes' },
  { value: 'user.', label: 'User administration' },
];

const timeFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Audit() {
  const [params, setParams] = useSearchParams();
  const action = params.get('action') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const audit = useAudit({ action, page, pageSize: 50 });
  const data = audit.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const link = (type: string | null, id: string | null) => {
    if (!id) return null;
    if (type === 'water_source') return `/sources/${id}`;
    if (type === 'change_request') return `/approvals/${id}`;
    return null;
  };

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="Every sign-in, request, approval and administrative change, with who did it and when. Entries cannot be edited or deleted."
        actions={
          <Select label="Activity" hideLabel value={action} onChange={(v) => setParams(v ? { action: v } : {})} className="w-56">
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        }
      />
      <Card bodyClassName="p-0">
        {audit.isError ? (
          <ErrorState error={audit.error} onRetry={() => audit.refetch()} />
        ) : !data ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState title="No activity recorded yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="border-b border-line bg-page/60 text-left text-xs text-ink-2">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Who</th>
                  <th className="px-4 py-3 font-medium">What</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">IP address</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => {
                  const to = link(e.entityType, e.entityId);
                  return (
                    <tr key={e.id} className="border-b border-line align-top last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 tabular text-ink-2">{timeFmt.format(new Date(e.at))}</td>
                      <td className="px-4 py-3 text-ink">{e.userName ?? <span className="text-ink-3">Unknown</span>}</td>
                      <td className="max-w-md px-4 py-3 text-ink">
                        {to ? (
                          <Link to={to} className="hover:text-brand-700 hover:underline">
                            {e.summary}
                          </Link>
                        ) : (
                          e.summary
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink-3">{e.action}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink-3">{e.ip ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink-2">
            <span>{formatNumber(data.total)} entries</span>
            <div className="flex items-center gap-2">
              <Button onClick={() => setParams({ ...(action && { action }), page: String(page - 1) })} disabled={page <= 1}>
                <ChevronLeft size={16} aria-hidden /> Newer
              </Button>
              <span className="tabular">
                {page} / {pages}
              </span>
              <Button onClick={() => setParams({ ...(action && { action }), page: String(page + 1) })} disabled={page >= pages}>
                Older <ChevronRight size={16} aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
