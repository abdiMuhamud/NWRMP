import { ChevronDown, Download, LogOut, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../lib/auth';
import { useInstallPrompt } from '../../lib/pwa';

export function UserMenu() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const installPrompt = useInstallPrompt();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!me) return null;
  const initials = me.user.fullName
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-page"
      >
        <span className="grid size-8 place-items-center rounded-full bg-brand-700 text-xs font-semibold text-white">{initials}</span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-40 truncate text-sm font-medium text-ink">{me.user.fullName}</span>
          <span className="block max-w-40 truncate text-xs text-ink-3">
            {me.user.roleLabel}
            {me.user.regionName ? ` · ${me.user.regionName}` : ''}
          </span>
        </span>
        <ChevronDown size={15} className="text-ink-3" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-float">
          <div className="border-b border-line px-4 py-3">
            <div className="truncate text-sm font-medium text-ink">{me.user.fullName}</div>
            <div className="truncate text-xs text-ink-3">{me.user.email}</div>
          </div>
          <Link role="menuitem" to="/account" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-page">
            <UserRound size={16} className="text-ink-3" aria-hidden /> My account
          </Link>
          {installPrompt.available && (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                void installPrompt.install();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink hover:bg-page"
            >
              <Download size={16} className="text-ink-3" aria-hidden /> Install app on this device
            </button>
          )}
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate('/login', { replace: true });
            }}
            className="flex w-full items-center gap-2.5 border-t border-line px-4 py-2.5 text-left text-sm text-ink hover:bg-page"
          >
            <LogOut size={16} className="text-ink-3" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
