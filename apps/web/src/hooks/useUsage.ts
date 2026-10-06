// useUsage.ts — the token-usage read behind the panel at the top of Activity
// (`GET /api/v1/usage`, admin-only).
//
// The server pushes `usage.changed` on the `pipeline` scope whenever a slot
// reports; the 10-second poll keeps the panel right when the socket is down.
// Nothing retries: a server without the route stays without it, and the panel
// is left out rather than shown broken.

import { useEffect } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { UsageQuery, UsageResponse } from '../api/types';
import { useRealtimeStore } from '../stores/realtimeStore';
import { PIPELINE_SCOPE } from './usePipeline';
import { useRealtime } from './useRealtime';

export const USAGE_KEY = ['usage'] as const;
/** The event kind a producer's report raises on the pipeline scope. */
export const USAGE_CHANGED = 'usage.changed';
/** The fallback beat, for when the socket is not carrying `usage.changed`. */
export const USAGE_POLL_MS = 10_000;

export function useUsage(
  query: UsageQuery,
  options?: { enabled?: boolean }
): UseQueryResult<UsageResponse, Error> {
  return useQuery({
    queryKey: [...USAGE_KEY, query],
    queryFn: ({ signal }) => apiGet<UsageResponse>(endpoints.usage(query), { signal }),
    enabled: options?.enabled ?? true,
    staleTime: 2_000,
    refetchInterval: (result) => (result.state.error ? false : USAGE_POLL_MS),
    retry: false,
  });
}

/**
 * Refetch the usage reads when the server says a slot reported. Enabled only
 * once a usage read has succeeded, so an older server or a non-admin session
 * never subscribes to a scope it may not have.
 */
export function useUsageNudge(enabled = true): void {
  const queryClient = useQueryClient();
  useRealtime(enabled ? [PIPELINE_SCOPE] : []);
  useEffect(() => {
    if (!enabled) return () => {};
    return useRealtimeStore.getState().addInvalidator((event) => {
      if (event.scope === PIPELINE_SCOPE && event.kind === USAGE_CHANGED) {
        void queryClient.invalidateQueries({ queryKey: USAGE_KEY });
      }
    });
  }, [enabled, queryClient]);
}
