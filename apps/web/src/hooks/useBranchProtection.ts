// useBranchProtection.ts — the rule that protects one branch
// (`GET /api/v3/repos/{o}/{r}/branches/{b}/protection`). The forge answers 404
// for a branch with no rule; `isUnprotected` reads that answer.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { ApiError, apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { BranchProtection } from '../pages/branchProtectionModel';

export function useBranchProtection(
  owner: string,
  repo: string,
  branch: string
): UseQueryResult<BranchProtection, Error> {
  return useQuery({
    queryKey: ['repo', owner, repo, 'protection', branch],
    queryFn: ({ signal }) =>
      apiGet<BranchProtection>(endpoints.branchProtection(owner, repo, branch), { signal }),
    enabled: owner.length > 0 && repo.length > 0 && branch.length > 0,
    staleTime: 60_000,
    retry: false,
  });
}

/** A 404 from the protection endpoint is a fact (no rule), not a failure. */
export function isUnprotected(error: Error | null): boolean {
  return error instanceof ApiError && error.status === 404;
}
