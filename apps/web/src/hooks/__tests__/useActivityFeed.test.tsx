// useActivityFeed.test.tsx — the live tail survives a failing attempt: it
// backs off, says how long until the next try, and resumes from the newest
// seq the feed already holds once the server answers again. And "load older"
// follows the server's `has_more`, never the number of rows it got.

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

describe('useActivityFeed older pages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  interface Page {
    seqs: number[];
    has_more?: boolean;
  }

  /** Serve `first`, then one page per `older` call, and an empty live tail. */
  function mockPages(first: Page, ...older: Page[]): { searches: string[] } {
    const searches: string[] = [];
    const queue = [...older];
    const body = (page: Page) =>
      json({
        events: page.seqs.map((seq) => pipelineEvent({ seq, kind: 'todo.claimed' })),
        latest_seq: Math.max(...first.seqs),
        ...(page.has_more === undefined ? {} : { has_more: page.has_more, next_cursor: page.seqs.at(-1) ?? null }),
      });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
      searches.push(url.search);
      if (url.searchParams.get('after_seq')) return json({ events: [], latest_seq: Math.max(...first.seqs) });
      if (url.searchParams.get('before_seq')) return body(queue.shift() ?? { seqs: [], has_more: false });
      return body(first);
    });
    return { searches };
  }

  function feedFor(pages: Parameters<typeof mockPages>) {
    mockPages(...pages);
    return renderHook(() => useActivityFeed({}, 2), { wrapper: wrapperFor(clientFor()) });
  }

  it('trusts has_more over a full page, so a page that happens to fill is the end', async () => {
    const { result } = feedFor([{ seqs: [11, 10], has_more: false }]);
    await waitFor(() => expect(result.current.base.isSuccess).toBe(true));
    expect(result.current.hasOlder).toBe(false);
  });

  it('trusts has_more over a short page, which folding and filters can leave behind', async () => {
    const { result } = feedFor([{ seqs: [10], has_more: true }]);
    await waitFor(() => expect(result.current.base.isSuccess).toBe(true));
    expect(result.current.hasOlder).toBe(true);
  });

  it('follows the last older page: a short one with more behind it keeps the button', async () => {
    const { result } = feedFor([
      { seqs: [11, 10], has_more: true },
      { seqs: [9], has_more: true },
      { seqs: [8], has_more: false },
    ]);
    await waitFor(() => expect(result.current.base.isSuccess).toBe(true));

    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.base.data?.events).toHaveLength(3));
    expect(result.current.hasOlder).toBe(true);

    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.base.data?.events).toHaveLength(4));
    expect(result.current.hasOlder).toBe(false);
  });

  it('keeps counting rows when the server does not send has_more', async () => {
    const full = feedFor([{ seqs: [11, 10] }]);
    await waitFor(() => expect(full.result.current.base.isSuccess).toBe(true));
    expect(full.result.current.hasOlder).toBe(true);
    vi.restoreAllMocks();

    const short = feedFor([{ seqs: [10] }]);
    await waitFor(() => expect(short.result.current.base.isSuccess).toBe(true));
    expect(short.result.current.hasOlder).toBe(false);
  });

  it('leaves the end of the log where it is when the live tail brings newer events', async () => {
    const searches: string[] = [];
    let newer = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
      searches.push(url.search);
      if (url.searchParams.get('after_seq')) {
        const events = newer ? [pipelineEvent({ seq: 12, kind: 'pr.merged' })] : [];
        newer = false;
        // A forward read's `has_more` is about newer events, not older ones.
        return json({ events, latest_seq: 12, has_more: true, next_cursor: 12 });
      }
      return json({ events: [pipelineEvent({ seq: 10, kind: 'todo.claimed' })], latest_seq: 10, has_more: false, next_cursor: 10 });
    });
    const { result } = renderHook(() => useActivityFeed({}, 2), { wrapper: wrapperFor(clientFor()) });
    await waitFor(() => expect(result.current.base.isSuccess).toBe(true));
    expect(result.current.hasOlder).toBe(false);

    newer = true;
    act(() => result.current.tail.retryNow());
    await waitFor(() => expect(result.current.base.data?.events).toHaveLength(2));
    expect(result.current.hasOlder).toBe(false);
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
