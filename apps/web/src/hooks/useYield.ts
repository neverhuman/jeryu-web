// useYield.ts — React Query hook for `GET /api/v1/yield` (admin-only).
//
// One read per (family, window, cut). Switching the cut keeps the previous
// answer on screen until the next one lands, so the KPI row does not blink
// while only the breakdown table changes. A server that predates the route
// answers 404 or the SPA shell; `isPipelineUnavailable` recognises both and the
// page says "not available on this server version". Nothing retries.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { YieldQuery, YieldReport } from '../api/types';
import { OPERATOR_REFRESH } from './refreshPolicy';

export const YIELD_KEY = ['yield'];

export function useYield(query: YieldQuery): UseQueryResult<YieldReport, Error> {
  const scope = [query.family ?? '', query.since ?? '', query.until ?? ''];
  return useQuery({
    queryKey: [...YIELD_KEY, ...scope, query.by ?? ''],
    queryFn: ({ signal }) => apiGet<YieldReport>(endpoints.yieldReport(query), { signal }),
    // Only a new cut of the same family and window keeps the old answer up: a
    // different family or window must not show the last one's numbers.
    placeholderData: (previous, previousQuery) =>
      previousQuery && sameScope(previousQuery.queryKey, scope) ? previous : undefined,
    ...OPERATOR_REFRESH,
    staleTime: 60_000,
    retry: false,
  });
}

function sameScope(key: readonly unknown[], scope: readonly string[]): boolean {
  return scope.every((part, index) => key[YIELD_KEY.length + index] === part);
}
