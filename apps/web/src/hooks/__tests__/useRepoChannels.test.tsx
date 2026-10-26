// useRepoChannels.test.tsx — a repository released only by tag is asked for
// its tag when the caller says so, not on first paint: most such repositories
// have no tag, and each one answered 404.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useRepoChannels } from '../useRepoChannels';

afterEach(() => vi.restoreAllMocks());

/** No environment and no parent pin: the repository could only be released by tag. */
function serveUndeployed(): string[] {
  const asked: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    asked.push(url);
    const body = url.includes('/environments')
      ? { total_count: 0, environments: [] }
      : url.includes('/release-pins')
        ? { pins: [] }
        : { tag: null, sha: null, tagged_at: null };
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

const tagAsked = (asked: string[]): boolean => asked.some((url) => url.includes('release-tag'));

describe('useRepoChannels', () => {
  it('holds a tag lookup back until the caller names the repository', async () => {
    const asked = serveUndeployed();
    const { result, rerender } = renderHook(
      (tagRepos: ReadonlySet<string>) => useRepoChannels(['acme/widgets'], 'main', tagRepos),
      { wrapper, initialProps: new Set<string>() }
    );
    await waitFor(() => expect(result.current.deferred.has('acme/widgets')).toBe(true));
    expect(tagAsked(asked)).toBe(false);

    rerender(new Set(['acme/widgets']));
    await waitFor(() => expect(tagAsked(asked)).toBe(true));
    expect(result.current.deferred.size).toBe(0);
  });

  it('asks every repository that needs a tag when the caller names none', async () => {
    const asked = serveUndeployed();
    const { result } = renderHook(() => useRepoChannels(['acme/widgets']), { wrapper });
    await waitFor(() => expect(tagAsked(asked)).toBe(true));
    expect(result.current.deferred.size).toBe(0);
  });
});
