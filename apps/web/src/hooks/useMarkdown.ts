// useMarkdown.ts — React Query hook for `GET /api/v1/repos/{id}/readme`
// (W-FE-09).
//
// The README endpoint resolves the canonical README for the repo at `ref`
// and returns a `RenderedMarkdown` payload. `ReadmePanel` treats a 404 as
// "no README" rather than a hard error so the empty-state UX survives
// missing READMEs without spurious red banners.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { ApiError, apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { RenderedMarkdown } from '../api/types';

export function markdownQueryKey(
  repoId: string | null,
  ref: string | undefined,
  dir = ''
): readonly unknown[] {
  return dir
    ? (['repo', repoId, 'readme', ref ?? null, dir] as const)
    : (['repo', repoId, 'readme', ref ?? null] as const);
}

export function useMarkdown(
  repoId: string | null,
  ref?: string,
  /** A folder: its README instead of the repository's. */
  dir = ''
): UseQueryResult<RenderedMarkdown, Error> {
  return useQuery({
    queryKey: markdownQueryKey(repoId, ref, dir),
    queryFn: ({ signal }) =>
      apiGet<RenderedMarkdown>(endpoints.readme(repoId as string, ref, dir || undefined), {
        signal,
      }),
    enabled: typeof repoId === 'string' && repoId.length > 0,
    staleTime: 60_000,
    retry: (failureCount, error) => {
      // 404 from the README endpoint is "no README" — surface to the empty
      // state instead of retrying. Other errors fall through to the global
      // single-retry default.
      if (error instanceof ApiError && error.status === 404) return false;
      if (error instanceof Error && /not_found/.test(error.message)) {
        return false;
      }
      return failureCount < 1;
    },
  });
}
