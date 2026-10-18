import { X } from 'lucide-react';
import { NavLink } from 'react-router';
import { useAuth } from '../../lib/auth';
import { useChangeCounts } from '../../lib/queries';
import { SoonTag } from '../ui/Badges';
import { NAV } from './nav';

/** National flag colours as a slim stripe: green over white over red. */
export function FlagStripe({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col ${className}`} aria-hidden>
      <span className="h-[3px] bg-[#00843d]" />
      <span className="h-[3px] bg-white" />
      <span className="h-[3px] bg-[#d21034]" />
    </div>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <img src="/brand/emblem.png" alt="" width={44} height={44} className="size-11 shrink-0 drop-shadow-sm" />
      <div className="min-w-0 leading-tight">
        <div className="text-[13.5px] font-semibold text-white">Ministry of Water Development</div>
        <div className="mt-0.5 text-xs text-brand-200">Wasaaradda Horumarinta Biyaha</div>
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can, me } = useAuth();
  const counts = useChangeCounts(Boolean(me));
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || can(i.permission)) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-30 bg-ink/40 backdrop-blur-[1px] transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col bg-brand-900 text-white transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <FlagStripe />
        <div className="flex items-start justify-between gap-2 px-5 pb-5 pt-5">
          <Brand />
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 grid size-8 place-items-center rounded-md text-brand-200 hover:bg-white/10 lg:hidden"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mx-5 mb-2 rounded-lg bg-white/[0.06] px-3 py-2.5 ring-1 ring-white/10">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gold-300">NWRMP</div>
          <div className="mt-0.5 text-xs leading-snug text-brand-100">National Water Resource Management Platform</div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-6 [scrollbar-color:rgb(255_255_255/0.2)_transparent] [scrollbar-width:thin]">
          {groups.map((group) => (
            <div key={group.label} className="mt-5">
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-300/80">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                          isActive
                            ? 'bg-white/[0.12] font-medium text-white'
                            : item.soon
                              ? 'text-brand-200/70 hover:bg-white/5 hover:text-brand-100'
                              : 'text-brand-100 hover:bg-white/[0.07] hover:text-white'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-gold-400" aria-hidden />}
                          <item.icon size={18} strokeWidth={isActive ? 2.25 : 1.85} aria-hidden />
                          <span className="flex-1">{item.label}</span>
                          {item.soon && <SoonTag />}
                          {item.badge === 'approvals' && (counts.data?.toReview ?? 0) > 0 && (
                            <span
                              className="min-w-5 rounded-full bg-gold-400 px-1.5 text-center text-[11px] font-semibold leading-5 text-brand-950"
                              aria-label={`${counts.data?.toReview} waiting for your review`}
                            >
                              {counts.data?.toReview}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-5 py-4 text-xs text-brand-200">
          <div className="font-medium text-brand-100">Test environment</div>
          <div className="mt-0.5">Version 0.1 · Phase 1: Registry &amp; GIS</div>
        </div>
      </aside>
    </>
  );
}
