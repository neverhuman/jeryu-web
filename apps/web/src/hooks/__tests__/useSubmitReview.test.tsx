// useSubmitReview.test.tsx — Request changes posts the contract body, and a
// PR change invalidates every view that describes the PR.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { invalidateAfterPrChange } from '../prInvalidation';
import { pullRequestQueryKey } from '../usePullRequest';
import { useSubmitReview } from '../useSubmitReview';

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useSubmitReview', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts a request_changes review pinned to the head SHA and refreshes the PR views', async () => {
    const detail = { summary: { number: 7 } };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(detail), { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSubmitReview('jeryu/jeryu-web', '7'), {
      wrapper: wrapperFor(client),
    });

    result.current.mutate({
      verdict: 'request_changes',
      expected_head_sha: 'abc123',
      body_markdown: 'Please add a test.',
      thread_comments: [],
      evidence: null,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/v1/repos/jeryu%2Fjeryu-web/pulls/7/reviews');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      verdict: 'request_changes',
      expected_head_sha: 'abc123',
      body_markdown: 'Please add a test.',
      thread_comments: [],
      evidence: null,
    });
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
    expect(client.getQueryData(pullRequestQueryKey('jeryu/jeryu-web', '7'))).toEqual(detail);
    const keys = invalidate.mock.calls.map(([filter]) => JSON.stringify(filter?.queryKey));
    expect(keys).toContain(JSON.stringify(['repo-pulls', 'jeryu/jeryu-web']));
    expect(keys).toContain(JSON.stringify(['control-plane', 'status']));
    expect(keys).toContain(JSON.stringify(['releases']));
    expect(keys).toContain(JSON.stringify(['pipeline']));
  });

  it('refuses to post before the repository is resolved', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const client = new QueryClient();
    const { result } = renderHook(() => useSubmitReview(null, null), { wrapper: wrapperFor(client) });
    result.current.mutate({
      verdict: 'request_changes',
      expected_head_sha: 'abc',
      body_markdown: 'x',
      thread_comments: [],
      evidence: null,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe('invalid_state');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('invalidates the PR list, Pull Room, release views, deployments and pipeline reads', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    invalidateAfterPrChange(client, 'r1');
    expect(invalidate.mock.calls.map(([filter]) => filter?.queryKey)).toEqual([
      ['repo-pulls', 'r1'],
      ['control-plane', 'status'],
      ['releases'],
      ['deployments'],
      ['pipeline'],
    ]);
  });
});
