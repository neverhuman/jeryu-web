// useSearch.ts — React Query hook for `GET /api/v1/search`, the product-wide
// search behind `/search?q=`.
//
// One request answers every kind, so the page makes one call rather than one
// per section. The query lives in the URL, so the cache key is the query.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { SearchQuery, SearchResponse } from '../api/types';

/** Stable React Query key; an empty query is never sent. */
export function searchQueryKey(query: SearchQuery): readonly unknown[] {
  return ['search', query.q.trim(), query.kind ?? null, query.limit ?? null];
}

export function useSearch(
  query: SearchQuery,
  options: { enabled?: boolean } = {}
): UseQueryResult<SearchResponse, Error> {
  const q = query.q.trim();
  return useQuery({
    queryKey: searchQueryKey({ ...query, q }),
    queryFn: ({ signal }) =>
      apiGet<SearchResponse>(endpoints.search({ ...query, q }), { signal }),
    staleTime: 30_000,
    enabled: (options.enabled ?? true) && q !== '',
  });
}
