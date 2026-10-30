import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { BuildInventory, LineageGraph } from '../api/types/delivery';
import { OPERATOR_REFRESH } from './refreshPolicy';
export function useLineage(repo: string | null) {
  return useQuery({ queryKey: ['lineage', repo], queryFn: ({ signal }) => apiGet<LineageGraph>(endpoints.lineage(repo as string), { signal }), enabled: !!repo, ...OPERATOR_REFRESH, staleTime: 30_000, refetchInterval: 60_000, retry: false });
}
export function useBuildInventory(family: string, deliverable: string) {
  return useInfiniteQuery({ queryKey: ['build-inventory', family, deliverable], initialPageParam: 0, queryFn: ({ signal, pageParam }) => apiGet<BuildInventory>(endpoints.buildInventory(family, deliverable, pageParam), { signal }), getNextPageParam: page => page.next_offset ?? undefined, enabled: !!family, ...OPERATOR_REFRESH, staleTime: 15_000, refetchInterval: 30_000, retry: false });
}
