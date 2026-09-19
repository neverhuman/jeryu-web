// useBranchProtection.ts — the rule that protects one branch, or null when the
// branch is unprotected (`GET /api/v3/repos/{o}/{r}/branches/{b}/protection`).

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { ApiError, apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { BranchProtection } from '../pages/branchProtectionModel';

export function useBranchProtection(
  owner: string,
  repo: string,
  branch: string
): UseQueryResult<BranchProtection | null, Error> {
  return useQuery({
    queryKey: ['repo', owner, repo, 'protection', branch],
    queryFn: async ({ signal }) => {
      try {
        return await apiGet<BranchProtection>(endpoints.branchProtection(owner, repo, branch), {
          signal,
        });
      } catch (error) {
        // The forge answers 404 for a branch with no rule: a fact, not a failure.
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: owner.length > 0 && repo.length > 0 && branch.length > 0,
    staleTime: 60_000,
    retry: false,
  });
}
