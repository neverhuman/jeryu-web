// useSubmitReview.ts — `POST /pulls/{number}/reviews` mutation.
//
// Used for "Request changes": the body carries the head SHA the reviewer saw,
// so the server rejects with `merge_sha_stale` when the branch moved, exactly
// like approve. The response is the refreshed PR detail.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';

import { apiSend, ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { PullRequestDetail, SubmitReviewRequest } from '../api/types';

import { invalidateAfterPrChange } from './prInvalidation';
import { pullRequestQueryKey } from './usePullRequest';
import { prThreadsQueryKey } from './usePrThreads';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pull-review-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useSubmitReview(
  repoId: string | null,
  prNumber: string | null
): UseMutationResult<PullRequestDetail, ApiError, SubmitReviewRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SubmitReviewRequest) => {
      if (!repoId || !prNumber) {
        throw new ApiError(0, {
          code: 'invalid_state',
          message: 'Repository or pull request not resolved yet.',
        });
      }
      return apiSend<PullRequestDetail>(endpoints.pullReviews(repoId, prNumber), body, {
        idempotencyKey: newIdempotencyKey(),
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(pullRequestQueryKey(repoId, prNumber), data);
      void queryClient.invalidateQueries({ queryKey: prThreadsQueryKey(repoId, prNumber) });
      invalidateAfterPrChange(queryClient, repoId);
    },
  });
}
