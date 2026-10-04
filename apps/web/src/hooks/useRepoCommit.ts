// useRepoCommit.ts — one commit in full: its message and its diff
// (`GET /api/v1/repos/{id}/commit/{sha}`).
//
// A commit never changes, so the answer is cached for the session; only the
// repository being unreadable or the sha being unknown makes it fail, and
// neither is worth a retry.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { RepoCommitDetail } from '../api/types/commits';

export function repoCommitQueryKey(
  repoId: string | null,
  sha: string
): readonly unknown[] {
  return ['repo', repoId, 'commit', sha] as const;
}

export function useRepoCommit(
  repoId: string | null,
  sha: string
): UseQueryResult<RepoCommitDetail, Error> {
  return useQuery({
    queryKey: repoCommitQueryKey(repoId, sha),
    queryFn: ({ signal }) =>
      apiGet<RepoCommitDetail>(endpoints.commit(repoId as string, sha), { signal }),
    enabled: typeof repoId === 'string' && repoId.length > 0 && sha.length > 0,
    staleTime: Infinity,
    retry: false,
  });
}
