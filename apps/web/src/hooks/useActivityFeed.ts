// useActivityFeed.ts — the Activity page's event list: one newest-first page,
// a live tail (`after_seq`, polled every 5 s while the tab is visible), and
// "load older" (`before_seq`).
//
// The newest-first page is the single cache entry; the tail and the older
// loader merge into it with `setQueryData`, so there is no component state to
// keep in step and a filter change starts from a clean list.

import { useEffect, useRef, useState } from 'react';
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

/** Waits between tail attempts after consecutive failures, last value held. */
export const ACTIVITY_TAIL_BACKOFF_MS = [5_000, 10_000, 30_000, 60_000] as const;

/** The wait before the nth consecutive retry (n counted from 1). */
export function activityTailBackoffMs(failures: number): number {
  const step = Math.min(Math.max(failures, 1), ACTIVITY_TAIL_BACKOFF_MS.length) - 1;
  return ACTIVITY_TAIL_BACKOFF_MS[step];
}

/** The live tail's health, so the page can say when it has stopped arriving. */
export interface ActivityTailState {
  /** True while the tail is failing: no new events are arriving. */
  paused: boolean;
  error: Error | null;
  /** Whole seconds until the next automatic attempt, 0 once it is due. */
  retryInSeconds: number;
  retryNow: () => void;
}

export interface ActivityFeed {
  base: UseQueryResult<PipelineEventsResponse, Error>;
  /** False once a "load older" page came back short. */
  hasOlder: boolean;
  loadingOlder: boolean;
  olderError: Error | null;
  loadOlder: () => void;
  tail: ActivityTailState;
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

  // Live tail: only once the first page is in. A failing attempt does not end
  // the tail — it backs off and keeps trying, resuming from the newest seq the
  // feed holds, so a forge 502 or a network blip costs events, not the tail.
  const [tailFailures, setTailFailures] = useState(0);
  const tailRetryMs = activityTailBackoffMs(tailFailures);
  const tail = useQuery({
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
    refetchInterval: (q) => (q.state.error ? tailRetryMs : ACTIVITY_TAIL_MS),
    staleTime: 0,
    retry: false,
  });

  // Count consecutive failures; a page that comes back resets the backoff.
  const lastTailErrorAt = useRef(0);
  useEffect(() => {
    if (tail.isError && tail.errorUpdatedAt !== lastTailErrorAt.current) {
      lastTailErrorAt.current = tail.errorUpdatedAt;
      setTailFailures((failures) => failures + 1);
    } else if (tail.isSuccess && tailFailures > 0) {
      lastTailErrorAt.current = 0;
      setTailFailures(0);
    }
  }, [tail.isError, tail.isSuccess, tail.errorUpdatedAt, tailFailures]);

  // Re-render once a second while paused so the countdown in the notice moves.
  const [, setTailTick] = useState(0);
  useEffect(() => {
    if (!tail.isError) return () => {};
    const timer = setInterval(() => setTailTick((tick) => tick + 1), 1_000);
    return () => clearInterval(timer);
  }, [tail.isError]);

  const tailState: ActivityTailState = {
    paused: tail.isError,
    error: tail.error ?? null,
    retryInSeconds: tail.isError
      ? Math.max(0, Math.ceil((tail.errorUpdatedAt + tailRetryMs - Date.now()) / 1_000))
      : 0,
    retryNow: () => {
      void tail.refetch();
    },
  };

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
    tail: tailState,
  };
}
