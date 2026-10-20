import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useUpdateReady } from '../../lib/pwa';
import { Button } from '../ui/Controls';

/** Offers to reload when a new version of the app has been installed. Never reloads on its own. */
export function UpdateBanner() {
  const ready = useUpdateReady();
  const [dismissed, setDismissed] = useState(false);
  if (!ready || dismissed) return null;
  return (
    <div
      role="status"
      className="pointer-events-auto flex w-full max-w-md flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-brand-200 bg-surface px-4 py-3 text-sm text-ink shadow-float"
    >
      <RefreshCw size={18} className="shrink-0 text-brand-700" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">A new version of NWRMP is available.</span>{' '}
        <span className="text-ink-2">Save any form you are filling in, then reload.</span>
      </span>
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => setDismissed(true)}>
          Later
        </Button>
        <Button variant="primary" className="h-8 px-3 text-xs" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
}
