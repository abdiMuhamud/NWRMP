import { useEffect, useState } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { RequireAuth } from '../../lib/auth';
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
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <div className="lg:pl-[272px]">
          <Topbar onMenu={() => setNavOpen(true)} />
          <main
            id="main"
            className={fullBleed ? 'h-[calc(100dvh-4rem)]' : 'mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8'}
          >
            <Outlet />
          </main>
        </div>
        <ScrollRestoration />
      </div>
    </RequireAuth>
  );
}
