import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ApiError, apiGet, apiPost } from './api';
import { clearOfflineData } from './offline';
import type { Me, Permission, SourceType } from './types';

interface AuthState {
  me: Me | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Me>;
  signOut: () => Promise<void>;
  can: (permission: Permission) => boolean;
  canApproveType: (type: SourceType) => boolean;
  /** Region the user is limited to, or null when they see the whole country */
  scopeRegionId: number | null;
  refresh: () => Promise<unknown>;
}

const REGION_SCOPED_ROLES = ['regional_coordinator', 'field_officer'];

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async ({ signal }) => {
      try {
        return await apiGet<Me>('/auth/me', {}, signal);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const me = meQuery.data ?? null;

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await apiPost<Me>('/auth/login', { email, password });
      // Drop anything cached under a previous user before showing data for this one. The "me" query
      // is kept (and overwritten) because the auth context is subscribed to it.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      queryClient.setQueryData(['me'], result);
      return result;
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
      await clearOfflineData();
    } finally {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      queryClient.setQueryData(['me'], null);
    }
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      me,
      loading: meQuery.isPending,
      signIn,
      signOut,
      can: (p) => Boolean(me?.permissions.includes(p)),
      canApproveType: (t) => Boolean(me?.approvableTypes.includes(t)),
      scopeRegionId: me && REGION_SCOPED_ROLES.includes(me.user.role) ? me.user.regionId : null,
      refresh: () => meQuery.refetch(),
    }),
    [me, meQuery, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Sends visitors to the sign-in page, and users with a temporary password to change it first. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-page" role="status" aria-label="Loading">
        <img src="/brand/emblem.png" alt="" className="size-14 animate-pulse" />
      </div>
    );
  }
  if (!me) {
    const next = location.pathname + location.search;
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (me.user.mustChangePassword && location.pathname !== '/account') {
    return <Navigate to="/account?required=1" replace />;
  }
  return <>{children}</>;
}

/** Renders children only when the signed-in user holds the permission. */
export function Can({ permission, children }: { permission: Permission; children: ReactNode }) {
  return useAuth().can(permission) ? <>{children}</> : null;
}
