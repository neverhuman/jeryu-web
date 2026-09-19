// usePipeline.ts — React Query hooks for the pipeline visibility contract:
// `GET /api/v1/attention` ("Needs you") and `GET /api/v1/events` (activity).
//
// Both reads are admin-only. A server that predates the contract answers with
// a 404 or the SPA shell (HTML); `isPipelineUnavailable` recognises both so
// every surface can say "not available on this server version" instead of
// erroring or spinning. Nothing here retries: an old server stays old.

import { useEffect } from 'react';
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { ApiError, apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  AttentionResponse,
  PipelineEventsQuery,
  PipelineEventsResponse,
} from '../api/types';
import { useRealtimeStore } from '../stores/realtimeStore';
import { useRealtime } from './useRealtime';

export const PIPELINE_KEY = ['pipeline'] as const;
export const ATTENTION_QUERY_KEY = [...PIPELINE_KEY, 'attention'] as const;
export const PIPELINE_SCOPE = 'pipeline';

/** True when the server does not implement the route (404, or the SPA shell). */
export function isPipelineUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 404 || error.code === 'invalid_response' || error.code === 'not_found')
  );
}

export function isPipelineForbidden(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/**
 * Refetch `queryKey` (default: every pipeline query) when the server pushes on
 * the `pipeline` scope. The WebSocket is a nudge only; polling keeps the page
 * right without it. Enable it only once a pipeline read has succeeded, so an
 * older server or a non-admin session never subscribes to an unknown scope.
 */
export function usePipelineNudge(
  enabled = true,
  queryKey: readonly unknown[] = PIPELINE_KEY
): void {
  const queryClient = useQueryClient();
  const keyId = JSON.stringify(queryKey);
  useRealtime(enabled ? [PIPELINE_SCOPE] : []);
  useEffect(() => {
    if (!enabled) return () => {};
    return useRealtimeStore.getState().addInvalidator((event) => {
      if (event.scope === PIPELINE_SCOPE) {
        void queryClient.invalidateQueries({ queryKey: JSON.parse(keyId) as unknown[] });
      }
    });
  }, [enabled, keyId, queryClient]);
}

/** What needs a human right now. Polls every 15 s; stops once known-unavailable. */
export function useAttention(enabled = true): UseQueryResult<AttentionResponse, Error> {
  return useQuery({
    queryKey: ATTENTION_QUERY_KEY,
    queryFn: ({ signal }) => apiGet<AttentionResponse>(endpoints.attention(), { signal }),
    enabled,
    staleTime: 5_000,
    refetchInterval: (query) => (query.state.error ? false : 15_000),
    retry: false,
  });
}

/** One page of pipeline events. Newest first unless `after_seq` is set. */
export function usePipelineEvents(
  query: PipelineEventsQuery,
  options?: { enabled?: boolean; refetchInterval?: number | false }
): UseQueryResult<PipelineEventsResponse, Error> {
  return useQuery({
    queryKey: [...PIPELINE_KEY, 'events', query],
    queryFn: ({ signal }) =>
      apiGet<PipelineEventsResponse>(endpoints.events(query), { signal }),
    enabled: options?.enabled ?? true,
    staleTime: 2_000,
    refetchInterval: (q) => (q.state.error ? false : (options?.refetchInterval ?? false)),
    retry: false,
  });
}
