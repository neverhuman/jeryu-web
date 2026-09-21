// useMergeAttempt.ts — `GET /api/v1/repos/{id}/pulls/{number}/merge-attempt`.
//
// The forge's answer to the last attempt to merge or enqueue this PR, and
// whether the merge identity has a grant on the repository. A reviewer's
// approval that the merger could not land says why here instead of only in
// the merger's journal. Polled at the reviewer's pace so a refusal shows up
// within one pass.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { MergeAttemptResponse } from '../api/types';

type MergeAttemptKey = readonly ['pull-merge-attempt', string | null, string | null];

export function useMergeAttempt(
  repoId: string | null,
  prNumber: string | null,
  enabled = true
): UseQueryResult<MergeAttemptResponse, Error> {
  const queryKey: MergeAttemptKey = ['pull-merge-attempt', repoId, prNumber];
  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      apiGet<MergeAttemptResponse>(
        endpoints.pullMergeAttempt(repoId as string, prNumber as string),
        { signal }
      ),
    enabled: enabled && Boolean(repoId) && Boolean(prNumber),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
