// useFlow.ts — React Query hook for `GET /api/v1/flow` (admin-only).
//
// One read per (family, window). A new window keeps the previous answer on
// screen until the next one lands, so the page keeps its height and the reader
// keeps their place; the Flow page dims it and says it is updating while
// `isPlaceholderData` is true. A different family never borrows another
// family's line: it loads afresh. A server that predates the route answers 404
// or the SPA shell, and `isPipelineUnavailable` recognises both. Nothing
// retries: this is a read an operator refreshes by looking again.
//
// `useFlowStation` pages one station's lots, newest first, so the work that is
// moving shows before the old claims; each further page is asked for only when
// the reader asks for more.

import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { FlowQuery, FlowReport } from '../api/types';
import { OPERATOR_REFRESH } from './refreshPolicy';

export const FLOW_KEY = ['flow'] as const;

export function useFlow(query: FlowQuery): UseQueryResult<FlowReport, Error> {
  const family = query.family ?? '';
  return useQuery({
    queryKey: [...FLOW_KEY, family, query.repo ?? '', query.days ?? ''],
    queryFn: ({ signal }) => apiGet<FlowReport>(endpoints.flow(query), { signal }),
    placeholderData: (previous, previousQuery) =>
      previousQuery && previousQuery.queryKey[FLOW_KEY.length] === family && previousQuery.queryKey[FLOW_KEY.length + 1] === (query.repo ?? '') ? previous : undefined,
    ...OPERATOR_REFRESH,
    staleTime: 30_000,
    retry: false,
  });
}

/** Lots per page of one station; the server takes 1 to 100. */
export const FLOW_STATION_PAGE = 50;

/** One station's lots, a page at a time, newest first. Off while `station` is null. */
export function useFlowStation(query: {
  family?: string;
  station: string | null;
}): UseInfiniteQueryResult<InfiniteData<FlowReport, number>, Error> {
  const station = query.station ?? '';
  return useInfiniteQuery({
    queryKey: [...FLOW_KEY, 'station', query.family ?? '', station],
    queryFn: ({ pageParam, signal }) =>
      apiGet<FlowReport>(
        endpoints.flow({
          family: query.family,
          station,
          lotsOffset: pageParam,
          lotsLimit: FLOW_STATION_PAGE,
          lotsOrder: 'newest',
        }),
        { signal }
      ),
    initialPageParam: 0,
    getNextPageParam: (last, _pages, offset) =>
      last.lots_truncated ? offset + FLOW_STATION_PAGE : undefined,
    enabled: station !== '',
    ...OPERATOR_REFRESH,
    staleTime: 30_000,
    retry: false,
  });
}
