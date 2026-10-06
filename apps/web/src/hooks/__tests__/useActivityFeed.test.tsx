// useActivityFeed.test.tsx — the live tail survives a failing attempt: it
// backs off, says how long until the next try, and resumes from the newest
// seq the feed already holds once the server answers again.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pipelineEvent } from '../../pages/__tests__/pipelineTestData';
import { errorResponse, json } from '../../pages/__tests__/shiftPageHelpers';
import { useRealtimeStore } from '../../stores/realtimeStore';
import {
  ACTIVITY_TAIL_BACKOFF_MS,
  ACTIVITY_TAIL_LIVE_MS,
  ACTIVITY_TAIL_MS,
  activityTailBackoffMs,
  useActivityFeed,
} from '../useActivityFeed';

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Serve the first page, then fail `failures` tail attempts before answering. */
function mockTail(failures: number): { searches: string[] } {
  const searches: string[] = [];
  let seen = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    searches.push(url.search);
    if (!url.searchParams.get('after_seq')) {
      return json({ events: [pipelineEvent({ seq: 10, kind: 'todo.claimed' })], latest_seq: 10 });
    }
    seen += 1;
    if (seen <= failures) return errorResponse(502, 'forge is away');
    return json({ events: [pipelineEvent({ seq: 11, kind: 'pr.merged' })], latest_seq: 11 });
  });
  return { searches };
}

/** Advance the fake clock, then give the request, its render and whatever it
 *  starts a few turns to settle. */
async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    for (let turn = 0; turn < 5; turn += 1) await vi.advanceTimersByTimeAsync(10);
  });
}

function clientFor(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('activityTailBackoffMs', () => {
  it('waits 5s, 10s, 30s then holds at 60s', () => {
    expect([1, 2, 3, 4, 5, 20].map(activityTailBackoffMs)).toEqual([
      5_000, 10_000, 30_000, 60_000, 60_000, 60_000,
    ]);
    // A first attempt that has not failed yet is quoted the first wait.
    expect(activityTailBackoffMs(0)).toBe(ACTIVITY_TAIL_BACKOFF_MS[0]);
  });
});

describe('useActivityFeed live tail', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('backs off and retries after a failed attempt, resuming from the newest seq', async () => {
    // Only the clock and the timers: faking the microtask queue would stall
    // react-query's own scheduler.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const { searches } = mockTail(2);
    const { result } = renderHook(() => useActivityFeed({}), { wrapper: wrapperFor(clientFor()) });
    // On fake timers nothing settles on its own, so each step is advanced.
    // Nothing settles on its own on a fake clock: each step is advanced, then
    // given a few turns for the request, its render and whatever it starts.
    const advance = async (ms: number): Promise<void> => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
        for (let turn = 0; turn < 5; turn += 1) await vi.advanceTimersByTimeAsync(10);
      });
    };

    await advance(0);
    expect(result.current.base.isSuccess).toBe(true);
    // The first tail attempt fails: paused, with the first wait quoted.
    expect(result.current.tail.paused).toBe(true);
    expect(result.current.tail.error?.message).toContain('forge is away');
    expect(result.current.tail.retryInSeconds).toBe(5);

    // It tries again by itself, and the second failure widens the wait.
    await advance(5_000);
    expect(result.current.tail.paused).toBe(true);
    expect(result.current.tail.retryInSeconds).toBe(10);

    // The third attempt lands: the notice clears and the event arrives.
    await advance(10_000);
    expect(result.current.tail.paused).toBe(false);
    expect(result.current.tail.retryInSeconds).toBe(0);
    expect(result.current.base.data?.events.map((event) => event.seq)).toEqual([11, 10]);
    // Every attempt asked from the newest seq the feed held, so nothing is skipped.
    const tailSearches = searches.filter((search) => search.includes('after_seq'));
    expect(tailSearches).toHaveLength(3);
    expect(tailSearches.every((search) => search.includes('after_seq=10'))).toBe(true);
  });

  it('retries at once when asked, and the backoff starts over after it recovers', async () => {
    const { searches } = mockTail(1);
    const { result } = renderHook(() => useActivityFeed({}), { wrapper: wrapperFor(clientFor()) });

    await waitFor(() => expect(result.current.tail.paused).toBe(true));
    act(() => result.current.tail.retryNow());
    await waitFor(() => expect(result.current.tail.paused).toBe(false));
    expect(searches.filter((search) => search.includes('after_seq'))).toHaveLength(2);
    expect(result.current.tail.retryInSeconds).toBe(0);
  });
});

describe('useActivityFeed tail beat', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    useRealtimeStore.setState({ status: 'idle' });
  });

  /** Count the tail requests the hook has made so far. */
  function tails(searches: string[]): number {
    return searches.filter((search) => search.includes('after_seq')).length;
  }

  it('polls every 5s while the socket is not open', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    useRealtimeStore.setState({ status: 'closed' });
    const { searches } = mockTail(0);
    renderHook(() => useActivityFeed({}), { wrapper: wrapperFor(clientFor()) });
    await settle();
    const first = tails(searches);
    expect(first).toBeGreaterThan(0);
    await settle(ACTIVITY_TAIL_MS);
    expect(tails(searches)).toBeGreaterThan(first);
  });

  it('drops to a 30s backstop while the socket is open, because a push refetches it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    useRealtimeStore.setState({ status: 'open' });
    const { searches } = mockTail(0);
    renderHook(() => useActivityFeed({}), { wrapper: wrapperFor(clientFor()) });
    await settle();
    const first = tails(searches);
    expect(first).toBeGreaterThan(0);
    // Six beats of the socket-down poll go by without one more request.
    await settle(ACTIVITY_TAIL_MS * 6 - 1_000);
    expect(tails(searches)).toBe(first);
    await settle(ACTIVITY_TAIL_LIVE_MS);
    expect(tails(searches)).toBeGreaterThan(first);
  });
});
