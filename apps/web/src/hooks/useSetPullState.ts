// useSetPullState.ts — close or reopen a pull request.
//
// The forge's GitHub-shaped edge owns this transition:
// `PATCH /api/v3/repos/{owner}/{repo}/pulls/{number}` with `{"state":"closed"}`
// closes an open pull request and `{"state":"open"}` reopens a closed one. An
// optional comment is posted first, to the pull request's issue thread, so the
// reason is on the record before the state changes (as the forge's own close
// flow does).
//
// On success the cached `PullRequestDetail` is rewritten in place with the new
// state so the cockpit repaints as closed (or open) without a reload, and the
// detail query is invalidated so the server's own copy replaces it next.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';

import { apiPatch, apiSend, ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { PullRequestDetail, RepositoryId } from '../api/types';

import { invalidateAfterPrChange } from './prInvalidation';
import { pullRequestQueryKey } from './usePullRequest';

export interface SetPullStateInput {
  /** The state to leave the pull request in. */
  state: 'open' | 'closed';
  /** Posted to the issue thread before the state changes, when non-empty. */
  comment?: string | null;
}

export function useSetPullState(
  repo: RepositoryId | null,
  prNumber: string | null
): UseMutationResult<PullRequestDetail | null, ApiError, SetPullStateInput> {
  const queryClient = useQueryClient();
  const repoId = repo?.id ?? null;
  return useMutation({
    mutationFn: async (input: SetPullStateInput) => {
      if (!repo || !prNumber) {
        throw new ApiError(0, {
          code: 'invalid_state',
          message: 'Repository or pull request not resolved yet.',
        });
      }
      const comment = input.comment?.trim() ?? '';
      if (comment.length > 0) {
        await apiSend<unknown>(
          endpoints.githubIssueComments(repo.owner, repo.name, prNumber),
          { body: comment }
        );
      }
      // The GitHub-shaped reply is a pull request JSON, not the SPA's
      // `PullRequestDetail`; the cached detail is patched from the state we
      // asked for and refreshed from `/api/v1` right after.
      await apiPatch<unknown>(
        endpoints.githubPull(repo.owner, repo.name, prNumber),
        { state: input.state }
      );
      const cached = queryClient.getQueryData<PullRequestDetail>(
        pullRequestQueryKey(repoId, prNumber)
      );
      if (!cached) return null;
      return {
        ...cached,
        summary: {
          ...cached.summary,
          state: input.state === 'closed' ? ('closed' as const) : ('open' as const),
        },
      };
    },
    onSuccess: (detail) => {
      if (detail) {
        queryClient.setQueryData(pullRequestQueryKey(repoId, prNumber), detail);
      }
      void queryClient.invalidateQueries({
        queryKey: pullRequestQueryKey(repoId, prNumber),
      });
      // The PR list, Pull Room, release views and Needs you all describe this PR.
      invalidateAfterPrChange(queryClient, repoId);
    },
  });
}
