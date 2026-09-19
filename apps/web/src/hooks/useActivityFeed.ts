// useActivityFeed.ts — the Activity page's event list: one newest-first page,
// a live tail (`after_seq`, polled every 5 s while the tab is visible), and
// "load older" (`before_seq`).
//
// The newest-first page is the single cache entry; the tail and the older
// loader merge into it with `setQueryData`, so there is no component state to
// keep in step and a filter change starts from a clean list.

import { useState } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { PipelineEventsQuery, PipelineEventsResponse } from '../api/types';
import {
  ACTIVITY_PAGE_SIZE,
  maxSeq,
  mergeEvents,
  minSeq,
} from '../pages/activity/activityModel';
import { PIPELINE_KEY } from './usePipeline';

export const ACTIVITY_TAIL_MS = 5_000;

export interface ActivityFeed {
  base: UseQueryResult<PipelineEventsResponse, Error>;
  /** False once a "load older" page came back short. */
  hasOlder: boolean;
  loadingOlder: boolean;
  olderError: Error | null;
  loadOlder: () => void;
}

export function activityFeedKey(query: PipelineEventsQuery): readonly unknown[] {
  return [...PIPELINE_KEY, 'events', 'feed', query];
}

export function activityTailKey(query: PipelineEventsQuery): readonly unknown[] {
  return [...PIPELINE_KEY, 'events', 'tail', query];
}

export function useActivityFeed(query: PipelineEventsQuery, pageSize = ACTIVITY_PAGE_SIZE): ActivityFeed {
  const queryClient = useQueryClient();
  const feedKey = activityFeedKey(query);
  const filterId = JSON.stringify(query);
  const [older, setOlder] = useState<{ filterId: string; exhausted: boolean; loading: boolean; error: Error | null }>({
    filterId,
    exhausted: false,
    loading: false,
    error: null,
  });
  const olderNow = older.filterId === filterId ? older : { filterId, exhausted: false, loading: false, error: null };

  const base = useQuery({
    queryKey: feedKey,
    queryFn: ({ signal }) =>
      apiGet<PipelineEventsResponse>(endpoints.events({ ...query, limit: pageSize }), { signal }),
    staleTime: Infinity,
    retry: false,
  });

  // Live tail: only once the first page is in, and never after an error.
  useQuery({
    queryKey: activityTailKey(query),
    queryFn: async ({ signal }) => {
      const current = queryClient.getQueryData<PipelineEventsResponse>(feedKey);
      const after = maxSeq(current?.events ?? []);
      const next = await apiGet<PipelineEventsResponse>(
        endpoints.events({ ...query, after_seq: after, limit: 500 }),
        { signal }
      );
      if (next.events.length > 0) {
        queryClient.setQueryData<PipelineEventsResponse>(feedKey, (prev) => ({
          events: mergeEvents(prev?.events, next.events),
          latest_seq: Math.max(prev?.latest_seq ?? 0, next.latest_seq ?? 0),
        }));
      }
      return next.latest_seq ?? after;
    },
    enabled: base.isSuccess,
    refetchInterval: (q) => (q.state.error ? false : ACTIVITY_TAIL_MS),
    staleTime: 0,
    retry: false,
  });

  const loadOlder = (): void => {
    const current = queryClient.getQueryData<PipelineEventsResponse>(feedKey);
    const before = minSeq(current?.events ?? []);
    if (before === null) return;
    setOlder({ filterId, exhausted: false, loading: true, error: null });
    apiGet<PipelineEventsResponse>(endpoints.events({ ...query, before_seq: before, limit: pageSize }))
      .then((page) => {
        queryClient.setQueryData<PipelineEventsResponse>(feedKey, (prev) => ({
          events: mergeEvents(prev?.events, page.events),
          latest_seq: prev?.latest_seq ?? page.latest_seq ?? 0,
        }));
        setOlder({ filterId, exhausted: page.events.length < pageSize, loading: false, error: null });
      })
      .catch((error: unknown) => {
        setOlder({
          filterId,
          exhausted: false,
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });
  };

  return {
    base,
    hasOlder: !olderNow.exhausted && (base.data?.events.length ?? 0) >= pageSize,
    loadingOlder: olderNow.loading,
    olderError: olderNow.error,
    loadOlder,
  };
}
