// useCommitCheckRuns.ts — the check runs of one commit-ish, fetched only while
// something shows them (`GET /api/v3/repos/{o}/{r}/commits/{ref}/check-runs`).

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { CheckRunsResponse } from '../pages/repoStatusModel';

export function useCommitCheckRuns(
  owner: string,
  repo: string,
  ref: string,
  enabled: boolean
): UseQueryResult<CheckRunsResponse, Error> {
  return useQuery({
    queryKey: ['repo', owner, repo, 'check-runs', ref],
    queryFn: ({ signal }) =>
      apiGet<CheckRunsResponse>(endpoints.commitCheckRuns(owner, repo, ref), {
        signal
      }),
    enabled: enabled && owner.length > 0 && repo.length > 0 && ref.length > 0,
    staleTime: 30_000,
    retry: false
  });
}
