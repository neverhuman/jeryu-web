// useSetPullDraft.ts — the draft lifecycle mutation for the PR page.
//
// `POST /pulls/{number}/ready` marks a draft ready for review; `/draft` puts an
// open pull request back. Both answer the updated `PullRequestDetail`, so the
// page swaps it in and the Passport's draft blocker clears without a reload.
// The forge allows the author and admins and records the transition in the PR's
// pipeline activity ("marked ready by X") and in its own audit trail.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';

import { apiSend, ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { PullRequestDetail } from '../api/types';

import { invalidateAfterPrChange } from './prInvalidation';
import { pullRequestQueryKey } from './usePullRequest';

export function useSetPullDraft(
  repoId: string | null,
  prNumber: string | null
): UseMutationResult<PullRequestDetail, ApiError, { draft: boolean }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft }: { draft: boolean }) => {
      if (!repoId || !prNumber) {
        throw new ApiError(0, {
          code: 'invalid_state',
          message: 'Repository or pull request not resolved yet.',
        });
      }
      const url = draft
        ? endpoints.pullDraft(repoId, prNumber)
        : endpoints.pullReady(repoId, prNumber);
      // The transition is idempotent server-side, so a retried POST is safe.
      return apiSend<PullRequestDetail>(url, {});
    },
    onSuccess: (data) => {
      queryClient.setQueryData(pullRequestQueryKey(repoId, prNumber), data);
      // The lists, the Pull Room and Needs you all describe this PR's state.
      invalidateAfterPrChange(queryClient, repoId);
    },
  });
}
