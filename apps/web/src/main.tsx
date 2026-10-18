import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import './index.css';
import { Dashboard } from './pages/Dashboard';
import { DataQuality } from './pages/DataQuality';
import { MapPage } from './pages/MapPage';
import { NotFound } from './pages/NotFound';
import { Planned } from './pages/Planned';
import { SourceDetail } from './pages/SourceDetail';
import { Sources } from './pages/Sources';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'map', element: <MapPage /> },
      { path: 'sources', element: <Sources /> },
      { path: 'sources/:id', element: <SourceDetail /> },
      { path: 'data-quality', element: <DataQuality /> },
      { path: 'planned/:slug', element: <Planned /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
