// useActivityFeed.ts — the Activity page's event list: one newest-first page,
// a live tail (`after_seq`) and "load older" (`before_seq`).
//
// The tail is pushed when the socket is open: a pipeline event frame nudges
// its query, so the poll is only there for when nothing is pushing. It beats
// every 5 s while the socket is not open and once every 30 s while it is.
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
  hasOlderEvents,
  maxSeq,
  mergeEvents,
  minSeq,
} from '../pages/activity/activityModel';
import { useDocumentHidden } from './useDocumentHidden';
import { useRealtimeStore } from '../stores/realtimeStore';
import { PIPELINE_KEY } from './usePipeline';

/** The tail's beat when nothing is pushing: the socket is the live path. */
export const ACTIVITY_TAIL_MS = 5_000;

/** The beat kept behind an open socket, as a backstop for a missed frame. */
export const ACTIVITY_TAIL_LIVE_MS = 30_000;

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
  /** True while this tab is hidden, which is when React Query stops polling. */
  hidden: boolean;
  /** When the feed last heard back, so a page can say how fresh it is. */
  updatedAt: number | null;
  error: Error | null;
  /** Whole seconds until the next automatic attempt, 0 once it is due. */
  retryInSeconds: number;
  retryNow: () => void;
}

export interface ActivityFeed {
  base: UseQueryResult<PipelineEventsResponse, Error>;
  /** What the newest-first page's `has_more` says is still behind it. */
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
  // A nudge on the pipeline scope refetches the tail, so an open socket is
  // the live path and the poll drops back to a backstop.
  const socketOpen = useRealtimeStore((state) => state.status === 'open');
  const tailBeatMs = socketOpen ? ACTIVITY_TAIL_LIVE_MS : ACTIVITY_TAIL_MS;
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
        // The tail reads forward, so its `has_more` is about newer events:
        // what is behind the newest-first page is left as it was.
        queryClient.setQueryData<PipelineEventsResponse>(feedKey, (prev) => ({
          ...prev,
          events: mergeEvents(prev?.events, next.events),
          latest_seq: Math.max(prev?.latest_seq ?? 0, next.latest_seq ?? 0),
        }));
      }
      return next.latest_seq ?? after;
    },
    enabled: base.isSuccess,
    refetchInterval: (q) => (q.state.error ? tailRetryMs : tailBeatMs),
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

  // Re-render once a second while failing so the countdown in the notice moves.
  // The pill's "updated 4s ago" keeps its own clock, so a healthy tail does not
  // redraw the whole feed every second.
  const hidden = useDocumentHidden();
  const [, setTailTick] = useState(0);
  useEffect(() => {
    if (!tail.isError) return () => {};
    const timer = setInterval(() => setTailTick((tick) => tick + 1), 1_000);
    return () => clearInterval(timer);
  }, [tail.isError]);

  const tailState: ActivityTailState = {
    paused: tail.isError,
    hidden,
    updatedAt: Math.max(tail.dataUpdatedAt, base.dataUpdatedAt) || null,
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
        // This page is the newest-first walk's new end, so its paging answer
        // replaces the first page's: `hasOlder` follows the last page read.
        queryClient.setQueryData<PipelineEventsResponse>(feedKey, (prev) => ({
          ...prev,
          events: mergeEvents(prev?.events, page.events),
          latest_seq: prev?.latest_seq ?? page.latest_seq ?? 0,
          has_more: page.has_more,
          next_cursor: page.next_cursor,
        }));
        setOlder({
          filterId,
          exhausted: !hasOlderEvents(page, pageSize),
          loading: false,
          error: null,
        });
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
    hasOlder: !olderNow.exhausted && hasOlderEvents(base.data, pageSize),
    loadingOlder: olderNow.loading,
    olderError: olderNow.error,
    loadOlder,
    tail: tailState,
  };
}
