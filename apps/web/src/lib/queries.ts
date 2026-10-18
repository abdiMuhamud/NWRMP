import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet, type QueryParams } from './api';
import type {
  NearbySource,
  Page,
  QualityReport,
  Reference,
  SourceCollection,
  SourceDetail,
  SourceListItem,
  Summary,
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
