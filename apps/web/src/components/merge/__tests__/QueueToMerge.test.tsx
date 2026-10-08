// QueueToMerge.test.tsx — the merge box's merge queue strip: whether the queue
// is the way to land this change, and the one act that follows.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pullDetail } from '../../../test/fixtures/pullRequest';
import { QueueToMerge } from '../QueueToMerge';

const STALE_BASE = [
  {
    code: 'passport_blocked_stale_base',
    message: 'main moved since this head was gated.',
    details: null,
  },
];

/** A green, approved pull request whose base moved under it. */
const BEHIND = pullDetail({ approvals: 1, blockers: STALE_BASE });

const REPO_ID = 'jeryu:acme/web';
const QUEUE_URL = '/api/v1/repos/jeryu%3Aacme%2Fweb/merge-queue';
const ENQUEUE_URL = '/api/v1/repos/jeryu%3Aacme%2Fweb/pulls/7/queue';

interface Recorded {
  method: string;
  pathname: string;
  key: string | null;
}

function entry(state: string, reason: string | null = null): Record<string, unknown> {
  return {
    repo: 'acme/web',
    base: 'main',
    number: 7,
    pr_head_sha: '1111111111111111111111111111111111111111',
    base_sha: '2222222222222222222222222222222222222222',
    queue_ref: 'refs/queue/main/7',
    queue_sha: '3333333333333333333333333333333333333333',
    state,
    enqueued_at: '2026-10-01T09:00:00Z',
    enqueued_by: 'pr-redteam',
    reason,
  };
}

/** Serve the queue listing and record every call; anything else answers 404. */
function mockQueue(
  entries: Array<Record<string, unknown>>,
  enqueue: () => Response
): Recorded[] {
  const calls: Recorded[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    calls.push({
      method: init?.method ?? 'GET',
      pathname: url.pathname,
      key: new Headers(init?.headers ?? {}).get('Idempotency-Key'),
    });
    const json = (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (url.pathname === QUEUE_URL) return json({ entries });
    if (url.pathname === ENQUEUE_URL) return enqueue();
    return json({ error: { code: 'x', message: `unmocked ${url.pathname}` } }, 404);
  });
  return calls;
}

function renderStrip(props: Partial<Parameters<typeof QueueToMerge>[0]> = {}): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <QueueToMerge repoId={REPO_ID} prNumber="7" {...props} />
    </QueryClientProvider>
  );
}

describe('QueueToMerge', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers to queue again after a failed gate, with an Idempotency-Key', async () => {
    const calls = mockQueue(
      [entry('failed', 'The queue gate failed twice on 3333333.')],
      () =>
        new Response(JSON.stringify(entry('building')), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    renderStrip();

    const strip = await screen.findByTestId('pr-queue-again');
    expect(strip).toHaveTextContent(
      'The merge queue failed on this pull request. The queue gate failed twice on 3333333.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Queue again' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.pathname === ENQUEUE_URL)).toHaveLength(1)
    );
    const post = calls.find((c) => c.pathname === ENQUEUE_URL);
    expect(post?.method).toBe('POST');
    expect(post?.key).toBeTruthy();
    expect(screen.queryByTestId('pr-queue-again-error')).toBeNull();
  });

  it('words the forge\'s refusal in place', async () => {
    mockQueue([entry('dequeued')], () =>
      new Response(
        JSON.stringify({
          error: { code: 'merge_gate_blocked', message: 'the pull request does not pass its merge gate' },
        }),
        { status: 409, headers: { 'content-type': 'application/json' } }
      )
    );
    renderStrip();

    expect(await screen.findByTestId('pr-queue-again')).toHaveTextContent(
      'This pull request left the merge queue.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Queue again' }));
    expect(await screen.findByTestId('pr-queue-again-error')).toHaveTextContent(
      'the pull request does not pass its merge gate'
    );
  });

  it('offers Queue to merge on a green head whose base moved, and then follows the entry', async () => {
    const calls = mockQueue([], () =>
      new Response(JSON.stringify(entry('building')), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    renderStrip({ detail: BEHIND });

    const strip = await screen.findByTestId('pr-queue-to-merge');
    expect(strip).toHaveTextContent(
      'main moved since this was gated; the queue replays it onto main, gates that commit, then lands it'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Queue to merge' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.pathname === ENQUEUE_URL)).toHaveLength(1)
    );
  });

  it('offers the same once the forge has refused the merge in so many words', async () => {
    mockQueue([], () => new Response(null, { status: 500 }));
    renderStrip({
      detail: pullDetail({ passport: 'pass', approvals: 1 }),
      mergeError:
        'main requires linear history, and the replay of the pull request onto it (9f3c1ab) has no result for acme/required; queue the pull request so the forge gates the commit it lands',
    });
    expect(await screen.findByRole('button', { name: 'Queue to merge' })).toBeEnabled();
  });

  it('shows the replay gate running while the entry builds, and nothing once it lands', async () => {
    mockQueue([entry('building')], () => new Response(null, { status: 500 }));
    renderStrip({ detail: BEHIND });
    const building = await screen.findByTestId('pr-queue-building');
    expect(building).toHaveTextContent('3333333 is this head replayed onto main');
    expect(screen.getByTestId('pr-queue-gate-progress')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    vi.restoreAllMocks();

    for (const entries of [[entry('landed')], []]) {
      mockQueue(entries, () => new Response(null, { status: 500 }));
      renderStrip({ detail: BEHIND });
      await waitFor(() => expect(screen.queryByTestId('pr-queue-building')).toBeNull());
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it('says nothing when the queue is not the obstacle, or on a settled pull request', async () => {
    for (const props of [
      { detail: pullDetail({ approvals: 1 }) },
      { detail: BEHIND, enabled: false },
      {},
    ]) {
      mockQueue([], () => new Response(null, { status: 500 }));
      renderStrip(props);
      await waitFor(() => expect(screen.queryByTestId('pr-queue-to-merge')).toBeNull());
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it('stays quiet on a server that predates the merge queue', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'no route' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    );
    renderStrip();
    await waitFor(() => expect(screen.queryByTestId('pr-queue-again')).toBeNull());
  });
});
