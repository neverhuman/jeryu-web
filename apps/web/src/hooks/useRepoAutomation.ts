// useRepoAutomation.ts — `GET /api/v1/repos/{id}/automation`.
//
// The repository page's Automation and Mirrors sections read this one query:
// the checks that run, the identities that review and merge (and whether their
// grants exist), the runners and deployers that reported, and the mirrors.
// It is a read of live state, so it goes stale quickly, but it is never the
// reason the page fails: a repository whose automation cannot be read still
// shows its code.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { RepoAutomation } from '../api/types';

export function repoAutomationQueryKey(
  repoId: string | null
): readonly unknown[] {
  return ['repo', repoId, 'automation'] as const;
}

export function useRepoAutomation(
  repoId: string | null
): UseQueryResult<RepoAutomation, Error> {
  return useQuery({
    queryKey: repoAutomationQueryKey(repoId),
    queryFn: ({ signal }) =>
      apiGet<RepoAutomation>(endpoints.repoAutomation(repoId as string), {
        signal,
      }),
    enabled: typeof repoId === 'string' && repoId.length > 0,
    staleTime: 15_000,
  });
}
