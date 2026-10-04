// useRepoCommits.ts — the commits of one ref, with the total count
// (`GET /api/v1/repos/{id}/commits?ref=&path=&limit=&page=`).
//
// The repository page asks for one commit: the last one, plus `page.total` as
// the ref's commit count. A repository whose source lives elsewhere has no git
// data here and answers 404, so the query does not retry.
//
// `useCommitHistory` is the same route paged: the commits page asks for a page
// of a ref's history, narrowed to one file or directory when `path` is set.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { RepoCommitsResponse } from '../api/types/commits';

export function commitsQueryKey(
  repoId: string | null,
  refName: string,
  limit: number
): readonly unknown[] {
  return ['repo', repoId, 'commits', refName, limit] as const;
}

export function useRepoCommits(
  repoId: string | null,
  refName: string,
  limit = 1
): UseQueryResult<RepoCommitsResponse, Error> {
  return useQuery({
    queryKey: commitsQueryKey(repoId, refName, limit),
    queryFn: ({ signal }) =>
      apiGet<RepoCommitsResponse>(
        endpoints.commits(repoId as string, { ref: refName || undefined, limit }),
        { signal }
      ),
    enabled: typeof repoId === 'string' && repoId.length > 0,
    staleTime: 30_000,
    retry: false,
  });
}

/** One page of a ref's history, optionally narrowed to `path`. */
export function useCommitHistory(
  repoId: string | null,
  refName: string,
  options: { path?: string; page: number; limit: number }
): UseQueryResult<RepoCommitsResponse, Error> {
  const { path, page, limit } = options;
  return useQuery({
    queryKey: ['repo', repoId, 'commits', refName, 'path', path ?? '', 'page', page, limit],
    queryFn: ({ signal }) =>
      apiGet<RepoCommitsResponse>(
        endpoints.commits(repoId as string, {
          ref: refName || undefined,
          path: path || undefined,
          limit,
          page,
        }),
        { signal }
      ),
    enabled: typeof repoId === 'string' && repoId.length > 0,
    staleTime: 30_000,
    retry: false,
  });
}
