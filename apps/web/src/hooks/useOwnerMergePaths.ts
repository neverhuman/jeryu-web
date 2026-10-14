// useOwnerMergePaths.ts — `GET /api/v1/repos/{id}/pulls/{number}/owner-paths`.
//
// The merge box already says why the Merge button is disabled. This says what
// the account looking at it can do about each of those reasons — which of them
// a repository admin clears, and the step that clears it. Read only while the
// passport is blocked: a passing head has nothing to explain.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { OwnerMergePaths } from '../api/types';

type OwnerPathsKey = readonly ['pull-owner-paths', string | null, string | null];

export function useOwnerMergePaths(
  repoId: string | null,
  prNumber: string | null,
  enabled = true
): UseQueryResult<OwnerMergePaths, Error> {
  const queryKey: OwnerPathsKey = ['pull-owner-paths', repoId, prNumber];
  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      apiGet<OwnerMergePaths>(
        endpoints.pullOwnerPaths(repoId as string, prNumber as string),
        { signal }
      ),
    enabled: enabled && Boolean(repoId) && Boolean(prNumber),
    staleTime: 15_000,
  });
}
