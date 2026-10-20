import { useEffect, useState } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { RequireAuth } from '../../lib/auth';
import { OutboxSync } from './OutboxSync';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();
  const fullBleed = pathname === '/map';

  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <RequireAuth>
      <div className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-float"
        >
          Skip to content
        </a>
        {/* Printed pages (reports) show only their content. */}
        <div className="print:hidden">
          <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        </div>
        <div className="lg:pl-[272px] print:pl-0">
          <div className="print:hidden">
            <Topbar onMenu={() => setNavOpen(true)} />
          </div>
          <main
            id="main"
            className={
              fullBleed
                ? 'h-[calc(100dvh-4rem)]'
                : 'mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0'
            }
          >
            <Outlet />
          </main>
        </div>
        <ScrollRestoration />
        <OutboxSync />
      </div>
    </RequireAuth>
  );
}
