// useFlow.ts — React Query hook for `GET /api/v1/flow` (admin-only).
//
// One read per (family, window). A new window keeps the previous answer on
// screen until the next one lands, so the page keeps its height and the reader
// keeps their place; the Flow page dims it and says it is updating while
// `isPlaceholderData` is true. A different family never borrows another
// family's line: it loads afresh. A server that predates the route answers 404
// or the SPA shell, and `isPipelineUnavailable` recognises both. Nothing
// retries: this is a read an operator refreshes by looking again.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { FlowQuery, FlowReport } from '../api/types';
import { OPERATOR_REFRESH } from './refreshPolicy';

export const FLOW_KEY = ['flow'] as const;

export function useFlow(query: FlowQuery): UseQueryResult<FlowReport, Error> {
  const family = query.family ?? '';
  return useQuery({
    queryKey: [...FLOW_KEY, family, query.days ?? ''],
    queryFn: ({ signal }) => apiGet<FlowReport>(endpoints.flow(query), { signal }),
    placeholderData: (previous, previousQuery) =>
      previousQuery && previousQuery.queryKey[FLOW_KEY.length] === family ? previous : undefined,
    ...OPERATOR_REFRESH,
    staleTime: 30_000,
    retry: false,
  });
}
