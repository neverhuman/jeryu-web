// usePullCommits.ts — the commits of one pull request, oldest first
// (`GET /api/v3/repos/{o}/{r}/pulls/{n}/commits`).

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { PullCommit } from '../pages/pullCommitsModel';

/** The first page is all a review needs; a longer PR keeps paging by `Link`. */
const PER_PAGE = 100;

export function pullCommitsQueryKey(
  owner: string,
  repo: string,
  prNumber: string | null
): readonly unknown[] {
  return ['repo', owner, repo, 'pull', prNumber, 'commits'] as const;
}

export function usePullCommits(
  owner: string,
  repo: string,
  prNumber: string | null
): UseQueryResult<PullCommit[], Error> {
  return useQuery({
    queryKey: pullCommitsQueryKey(owner, repo, prNumber),
    queryFn: ({ signal }) =>
      apiGet<PullCommit[]>(
        endpoints.pullCommits(owner, repo, prNumber as string, {
          perPage: PER_PAGE,
        }),
        { signal }
      ),
    enabled:
      owner.length > 0 &&
      repo.length > 0 &&
      typeof prNumber === 'string' &&
      prNumber.length > 0,
    staleTime: 30_000,
    retry: false,
  });
}
