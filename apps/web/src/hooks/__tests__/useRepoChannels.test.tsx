// useRepoChannels.test.tsx — the tags of the repositories released only by
// tag are read in batches (`GET /api/v1/release-tags`, at most 100 per
// request), where every status but `tagged` is "no tag", never an error, and a
// batch that fails leaves its repositories undecided.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReleaseTagRow } from '../../api/types/deployments';
import { chunked, RELEASE_TAGS_BATCH, useRepoChannels } from '../useRepoChannels';

afterEach(() => vi.restoreAllMocks());

const TAG_SHA = 'a'.repeat(40);

/** What the batch route answers for one repository. */
function row(repo: string): ReleaseTagRow {
  const base = { repo, full_name: repo, branch: 'main', tag: null, sha: null, tagged_at: null };
  if (repo.endsWith('/tagged')) {
    return { ...base, status: 'tagged', tag: 'v1.2.0', sha: TAG_SHA, tagged_at: '2026-10-01T00:00:00Z' };
  }
  if (repo.endsWith('/bare')) return { ...base, status: 'no_git_data', branch: null };
  if (repo.endsWith('/gone')) return { ...base, status: 'not_found', full_name: null, branch: null };
  return { ...base, status: 'untagged' };
}

/**
 * No environment and no parent pin: every repository could only be released
 * by tag. `failBatches` answers the tag batch with a 500.
 */
function serveUndeployed(failBatches = false): string[] {
  const asked: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'https://forge.example');
    asked.push(`${url.pathname}${url.search}`);
    if (url.pathname === '/api/v1/release-tags' && failBatches) {
      return new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } });
    }
    const body = url.pathname.endsWith('/environments')
      ? { total_count: 0, environments: [] }
      : url.pathname === '/api/v1/release-pins'
        ? { pins: [] }
        : url.pathname === '/api/v1/release-tags'
          ? { releases: (url.searchParams.get('repos') ?? '').split(',').map(row) }
          : { ahead_by: 0, behind_by: 0, commits: [], truncated: false };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return asked;
}

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const tagReads = (asked: string[]): string[] => asked.filter((url) => url.includes('release-tag'));

describe('useRepoChannels', () => {
  it('reads every tag in one batch, and only `tagged` is a release', async () => {
    const asked = serveUndeployed();
    const repos = ['acme/tagged', 'acme/plain', 'acme/bare', 'acme/gone'];
    const { result } = renderHook(() => useRepoChannels(repos), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(tagReads(asked)).toEqual([
      '/api/v1/release-tags?repos=acme%2Fbare%2Cacme%2Fgone%2Cacme%2Fplain%2Cacme%2Ftagged&branch=main',
    ]);
    expect(result.current.byRepo.get('acme/tagged')?.baselines).toEqual({
      kind: 'tag',
      baselines: [{ id: 'tag', name: 'v1.2.0', sha: TAG_SHA, at: '2026-10-01T00:00:00Z' }],
    });
    // No tag, no branch data, not readable: each is "no release", none an error.
    for (const repo of ['acme/plain', 'acme/bare', 'acme/gone']) {
      expect(result.current.byRepo.get(repo)?.baselines.kind).toBe('none');
    }
    expect(result.current.deferred.size).toBe(0);
  });

  it('asks in runs of at most 100 repositories', async () => {
    const asked = serveUndeployed();
    const repos = Array.from({ length: RELEASE_TAGS_BATCH + 1 }, (_, n) => `acme/r${String(n).padStart(3, '0')}`);
    const { result } = renderHook(() => useRepoChannels(repos), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const sizes = tagReads(asked).map(
      (url) => (new URL(url, 'https://forge.example').searchParams.get('repos') ?? '').split(',').length
    );
    expect(sizes).toEqual([100, 1]);
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('leaves the repositories of a failed batch undecided, not unreleased', async () => {
    serveUndeployed(true);
    const { result } = renderHook(() => useRepoChannels(['acme/tagged', 'acme/plain']), { wrapper });
    await waitFor(() => expect(result.current.deferred.size).toBe(2));
    expect([...result.current.deferred].sort()).toEqual(['acme/plain', 'acme/tagged']);
  });
});
