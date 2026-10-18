import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet, type QueryParams } from './api';
import type {
  AuditEntry,
  ChangeListItem,
  ChangeRequest,
  HistoryEntry,
  NearbySource,
  Page,
  QualityReport,
  Reference,
  SourceCollection,
  SourceDetail,
  SourceListItem,
  Summary,
  UserRow,
} from './types';

export function useReference() {
  return useQuery({
    queryKey: ['reference'],
    queryFn: ({ signal }) => apiGet<Reference>('/reference', {}, signal),
    staleTime: 10 * 60_000,
  });
}

export function useSummary(region?: number) {
  return useQuery({
    queryKey: ['summary', region ?? null],
    queryFn: ({ signal }) => apiGet<Summary>('/stats/summary', { region }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useSources(params: QueryParams) {
  return useQuery({
    queryKey: ['sources', params],
    queryFn: ({ signal }) => apiGet<Page<SourceListItem>>('/sources', params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useSourceGeojson(params: QueryParams = {}) {
  return useQuery({
    queryKey: ['sources-geojson', params],
    queryFn: ({ signal }) => apiGet<SourceCollection>('/sources/geojson', params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useSource(id: string | undefined) {
  return useQuery({
    queryKey: ['source', id],
    queryFn: ({ signal }) => apiGet<SourceDetail>(`/sources/${id}`, {}, signal),
    enabled: Boolean(id),
  });
}

export function useNearby(id: string | undefined, radiusKm: number) {
  return useQuery({
    queryKey: ['nearby', id, radiusKm],
    queryFn: ({ signal }) => apiGet<NearbySource[]>(`/sources/${id}/nearby`, { radiusKm }, signal),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}

export function useQualityReport(severity?: string) {
  return useQuery({
    queryKey: ['data-quality', severity ?? null],
    queryFn: ({ signal }) => apiGet<QualityReport>('/data-quality', { severity }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useChangeRequests(box: 'review' | 'mine' | 'decided') {
  return useQuery({
    queryKey: ['changes', box],
    queryFn: ({ signal }) => apiGet<ChangeListItem[]>('/change-requests', { box }, signal),
  });
}

export function usePendingChangesForSource(sourceId: string | undefined) {
  return useQuery({
    queryKey: ['changes', 'source', sourceId],
    queryFn: ({ signal }) => apiGet<ChangeListItem[]>('/change-requests', { box: 'source', sourceId }, signal),
    enabled: Boolean(sourceId),
  });
}

export function useChangeCounts(enabled: boolean) {
  return useQuery({
    queryKey: ['changes', 'counts'],
    queryFn: ({ signal }) => apiGet<{ toReview: number; myPending: number }>('/change-requests/counts', {}, signal),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useChangeRequest(id: string | undefined) {
  return useQuery({
    queryKey: ['change', id],
    queryFn: ({ signal }) => apiGet<ChangeRequest>(`/change-requests/${id}`, {}, signal),
    enabled: Boolean(id),
  });
}

export function useSourceHistory(id: string | undefined) {
  return useQuery({
    queryKey: ['source-history', id],
    queryFn: ({ signal }) => apiGet<HistoryEntry[]>(`/sources/${id}/history`, {}, signal),
    enabled: Boolean(id),
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: ({ signal }) => apiGet<UserRow[]>('/users', {}, signal),
  });
}

export function useAudit(params: QueryParams) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: ({ signal }) => apiGet<Page<AuditEntry>>('/audit', params, signal),
    placeholderData: keepPreviousData,
  });
}
