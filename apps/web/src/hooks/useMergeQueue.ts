// useMergeQueue.ts — the repository's merge queue, and joining it again.
//
//   * `GET /api/v1/repos/{id}/merge-queue` lists every entry, whatever state
//     it is in, so the pull request page can say what became of its own.
//   * `POST …/pulls/{number}/queue` enqueues. The call is idempotent on the
//     server and carries an `Idempotency-Key` (§35.1.3) besides, so a double
//     click cannot build the queue commit twice.
//
// A server that predates the merge queue answers 404; `isMergeQueueUnavailable`
// lets the page stay quiet instead of erroring.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { ApiError, apiGet, apiSend } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { QueueEntry, RepoMergeQueueResponse } from '../api/types';

import { newIdempotencyKey } from './useApplySettingsPatch';

export function mergeQueueQueryKey(repoId: string | null): readonly unknown[] {
  return ['repo-merge-queue', repoId];
}

/** True when the server does not implement the merge queue (404, or no route). */
export function isMergeQueueUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 404 || error.code === 'invalid_response' || error.code === 'not_found')
  );
}

export function useRepoMergeQueue(
  repoId: string | null,
  enabled = true
): UseQueryResult<RepoMergeQueueResponse, Error> {
  return useQuery({
    queryKey: mergeQueueQueryKey(repoId),
    queryFn: ({ signal }) =>
      apiGet<RepoMergeQueueResponse>(endpoints.repoMergeQueue(repoId as string), { signal }),
    enabled: enabled && Boolean(repoId),
    staleTime: 10_000,
    refetchInterval: (query) => (query.state.error ? false : 30_000),
    retry: false,
  });
}

export function useEnqueuePr(
  repoId: string | null,
  prNumber: string | null
): UseMutationResult<QueueEntry, ApiError, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!repoId || !prNumber) {
        throw new ApiError(0, {
          code: 'invalid_state',
          message: 'Repository or pull request not resolved yet.',
        });
      }
      return apiSend<QueueEntry>(endpoints.pullQueue(repoId, prNumber), undefined, {
        idempotencyKey: newIdempotencyKey(),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mergeQueueQueryKey(repoId) });
    },
  });
}
