// usePipeline.ts — React Query hooks for the pipeline visibility contract:
// `GET /api/v1/attention` ("Needs you") and `GET /api/v1/events` (activity).
//
// Both reads are admin-only. A server that predates the contract answers with
// a 404 or the SPA shell (HTML); `isPipelineUnavailable` recognises both so
// every surface can say "not available on this server version" instead of
// erroring or spinning. Nothing here retries: an old server stays old.

import { useEffect, useRef } from 'react';
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { ApiError, apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  AttentionResponse,
  PinsResponse,
  PipelineEventsQuery,
  PipelineEventsResponse,
  PipelineHistogramQuery,
  PipelineHistogramResponse,
} from '../api/types';
import { useRealtimeStore } from '../stores/realtimeStore';
import { useRealtime } from './useRealtime';

export const PIPELINE_KEY = ['pipeline'] as const;
export const ATTENTION_QUERY_KEY: readonly string[] = [...PIPELINE_KEY, 'attention'];
export const PINS_QUERY_KEY: readonly string[] = [...PIPELINE_KEY, 'pins'];
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
 * Frames on the `pipeline` scope that announce another surface's snapshot
 * rather than a new row in the event log: the release board's stored snapshot
 * and a slot's usage report. A reader of the event feed learns nothing from
 * them, so `isPipelineEventPush` lets the feed's nudge pass them by.
 */
export const PIPELINE_SNAPSHOT_KINDS: readonly string[] = [
  'release_board.updated',
  'usage.changed',
];

/** True when a pipeline-scope frame means "there are new events to read". */
export function isPipelineEventPush(kind: string): boolean {
  return !PIPELINE_SNAPSHOT_KINDS.includes(kind);
}

export interface PipelineNudgeOptions {
  /** Which frame kinds count. Default: every frame on the scope. */
  kinds?: (kind: string) => boolean;
}

/**
 * Refetch `queryKey` (default: every pipeline query) when the server pushes on
 * the `pipeline` scope. The WebSocket is a nudge only; polling keeps the page
 * right without it. Enable it only once a pipeline read has succeeded, so an
 * older server or a non-admin session never subscribes to an unknown scope.
 *
 * Several surfaces share the one scope, so a caller that only cares about some
 * of its frames passes `kinds`; without it every frame invalidates the key,
 * which is a fetch per push for a surface the frame does not touch.
 */
export function usePipelineNudge(
  enabled = true,
  queryKey: readonly unknown[] = PIPELINE_KEY,
  options?: PipelineNudgeOptions
): void {
  const queryClient = useQueryClient();
  // The caller may build the key inline; a ref keeps the subscription stable.
  const keyRef = useRef(queryKey);
  keyRef.current = queryKey;
  const kindsRef = useRef(options?.kinds);
  kindsRef.current = options?.kinds;
  useRealtime(enabled ? [PIPELINE_SCOPE] : []);
  useEffect(() => {
    if (!enabled) return () => {};
    return useRealtimeStore.getState().addInvalidator((event) => {
      if (event.scope !== PIPELINE_SCOPE) return;
      if (kindsRef.current && !kindsRef.current(event.kind)) return;
      void queryClient.invalidateQueries({ queryKey: keyRef.current });
    });
  }, [enabled, queryClient]);
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

/**
 * Event volume per bucket, for the band above the Activity feed. Polls on the
 * tail's own beat so the newest bucket keeps growing while the page is open.
 * Nothing retries: on a server without the route the band is simply left out.
 */
export function useEventsHistogram(
  query: PipelineHistogramQuery,
  options?: { enabled?: boolean; refetchInterval?: number | false }
): UseQueryResult<PipelineHistogramResponse, Error> {
  return useQuery({
    queryKey: [...PIPELINE_KEY, 'events', 'histogram', query],
    queryFn: ({ signal }) =>
      apiGet<PipelineHistogramResponse>(endpoints.eventsHistogram(query), { signal }),
    enabled: options?.enabled ?? true,
    staleTime: 5_000,
    refetchInterval: (q) => (q.state.error ? false : (options?.refetchInterval ?? 15_000)),
    retry: false,
  });
}

/**
 * What each deploy repo pins versus its dependencies' main: what is merged
 * but not yet in a release. Admin-only, server-cached, so a minute is enough.
 */
export function usePins(enabled = true): UseQueryResult<PinsResponse, Error> {
  return useQuery({
    queryKey: PINS_QUERY_KEY,
    queryFn: ({ signal }) => apiGet<PinsResponse>(endpoints.pins(), { signal }),
    enabled,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.error ? false : 60_000),
    retry: false,
  });
}
