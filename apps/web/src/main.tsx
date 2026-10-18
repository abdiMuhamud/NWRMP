import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { ToastProvider } from './components/ui/Toast';
import './index.css';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
import { Account } from './pages/Account';
import { Audit } from './pages/admin/Audit';
import { Users } from './pages/admin/Users';
import { Approvals } from './pages/Approvals';
import { Dashboard } from './pages/Dashboard';
import { DataQuality } from './pages/DataQuality';
import { Login } from './pages/Login';
import { MapPage } from './pages/MapPage';
import { NotFound } from './pages/NotFound';
import { Planned } from './pages/Planned';
import { ReviewRequest } from './pages/ReviewRequest';
import { SourceDetail } from './pages/SourceDetail';
import { SourceForm } from './pages/SourceForm';
import { Sources } from './pages/Sources';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // An expired session shows up as 401 on any request: refresh "me" so the app returns to sign-in.
    onError: (err, query) => {
      if (err instanceof ApiError && err.status === 401 && query.queryKey[0] !== 'me') {
        queryClient.invalidateQueries({ queryKey: ['me'] });
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && [401, 403, 404].includes(err.status)) && count < 1,
    },
  },
});

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'map', element: <MapPage /> },
      { path: 'sources', element: <Sources /> },
      { path: 'sources/new', element: <SourceForm /> },
      { path: 'sources/:id', element: <SourceDetail /> },
      { path: 'sources/:id/edit', element: <SourceForm /> },
      { path: 'approvals', element: <Approvals /> },
      { path: 'approvals/:id', element: <ReviewRequest /> },
      { path: 'data-quality', element: <DataQuality /> },
      { path: 'admin/users', element: <Users /> },
      { path: 'admin/audit', element: <Audit /> },
      { path: 'account', element: <Account /> },
      { path: 'planned/:slug', element: <Planned /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
