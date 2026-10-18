import { CircleAlert, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Controls';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-line/70 ${className}`} aria-hidden />;
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-4" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-critical-wash text-critical-ink">
        <CircleAlert size={20} aria-hidden />
      </span>
      <div>
        <p className="font-medium text-ink">Could not load data</p>
        <p className="mt-1 max-w-md text-sm text-ink-2">{message}</p>
      </div>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-page text-ink-3">
        <Inbox size={20} aria-hidden />
      </span>
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="max-w-md text-sm text-ink-2">{children}</div>}
    </div>
  );
}
