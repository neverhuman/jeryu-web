// useYield.ts — React Query hook for `GET /api/v1/yield` (admin-only).
//
// One read per (family, window, cut). Any switch keeps the previous answer on
// screen until the next one lands, so the page keeps its height and the reader
// keeps their place; YieldPage dims it and says it is updating while
// `isPlaceholderData` is true, so an old window's numbers never pass for the new
// one's. A server that predates the route
// answers 404 or the SPA shell; `isPipelineUnavailable` recognises both and the
// page says "not available on this server version". Nothing retries.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { YieldQuery, YieldReport } from '../api/types';
import { OPERATOR_REFRESH } from './refreshPolicy';

export const YIELD_KEY = ['yield'];

export function useYield(query: YieldQuery): UseQueryResult<YieldReport, Error> {
  return useQuery({
    queryKey: [...YIELD_KEY, query.family ?? '', query.since ?? '', query.until ?? '', query.by ?? ''],
    queryFn: ({ signal }) => apiGet<YieldReport>(endpoints.yieldReport(query), { signal }),
    placeholderData: (previous) => previous,
    ...OPERATOR_REFRESH,
    staleTime: 60_000,
    retry: false,
  });
}
