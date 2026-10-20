// usePrThreads.ts — React Query hook for `GET /pulls/{number}/threads`
// (W-FE-11).
//
// Invalidated on `pull.thread.*` WS events (repository scope) for this PR so a comment posted
// from another tab/session appears live. The invalidator is installed on
// mount and torn down on unmount via the realtime store's `addInvalidator`
// hook.

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import { useRealtimeStore } from '../stores/realtimeStore';
import type { PullRequestThreadList } from '../api/types';

export function prThreadsQueryKey(
  repoId: string | null,
  prNumber: string | null
): readonly unknown[] {
  return ['pull', repoId, prNumber, 'threads'] as const;
}

/**
 * A `pull.thread.*` frame for exactly this pull request. The forge sends it on
 * the repository's own scope (`repo.<owner>.<name>`, authorized by read access
 * to that repository) with `entity: "pull:<repo_id>:<number>"`. The entity is
 * compared whole: a bare PR number, or a prefix of another id, names nothing.
 */
export function isPrThreadEvent(
  event: { kind: string; scope?: string; entity?: string },
  repoId: string,
  prNumber: string
): boolean {
  return (
    event.kind.startsWith('pull.thread.') &&
    (event.scope?.startsWith('repo.') ?? false) &&
    event.entity === `pull:${repoId}:${prNumber}`
  );
}

export function usePrThreads(
  repoId: string | null,
  prNumber: string | null
): UseQueryResult<PullRequestThreadList, Error> {
  const queryClient = useQueryClient();
  const addInvalidator = useRealtimeStore((s) => s.addInvalidator);

  useEffect(() => {
    if (!repoId || !prNumber) return () => {};
    return addInvalidator((event) => {
      if (isPrThreadEvent(event, repoId, prNumber)) {
        queryClient.invalidateQueries({
          queryKey: prThreadsQueryKey(repoId, prNumber),
        });
      }
    });
  }, [repoId, prNumber, addInvalidator, queryClient]);

  return useQuery({
    queryKey: prThreadsQueryKey(repoId, prNumber),
    queryFn: ({ signal }) =>
      apiGet<PullRequestThreadList>(
        endpoints.pullThreads(repoId as string, prNumber as string),
        { signal }
      ),
    enabled:
      typeof repoId === 'string' &&
      repoId.length > 0 &&
      typeof prNumber === 'string' &&
      prNumber.length > 0,
    staleTime: 10_000,
  });
}
