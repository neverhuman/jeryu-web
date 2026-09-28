// useReleaseBoard.ts — React Query reads behind the family release board.
//
// `GET /api/v1/release-board` lists the families that have reported and
// `GET /api/v1/release-board/{family}` returns one snapshot; both are
// admin-only. They poll every 30 s and refetch at once when the server pushes
// on the pipeline scope (a new snapshot publishes `release_board.updated`).
// Stages linked to a forge environment also read that repository's
// environments, which is how a release shows up before the next snapshot.
// Nothing here retries or swallows errors: the page branches on the status.

import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { EnvironmentSummary, EnvironmentsResponse } from '../api/types/deployments';
import type { ReleaseBoard, ReleaseBoardListResponse } from '../api/types/releaseBoard';
import { BOARD_REFETCH_MS } from '../pages/releaseBoard/model';
import { usePipelineNudge } from './usePipeline';

export const RELEASE_BOARD_KEY = ['release-board'] as const;

export function useReleaseBoardList(
  enabled: boolean
): UseQueryResult<ReleaseBoardListResponse, Error> {
  const list = useQuery({
    queryKey: [...RELEASE_BOARD_KEY, 'list'],
    queryFn: ({ signal }) =>
      apiGet<ReleaseBoardListResponse>(endpoints.releaseBoards(), { signal }),
    enabled,
    staleTime: 10_000,
    refetchInterval: (query) => (query.state.error ? false : BOARD_REFETCH_MS),
    retry: false,
  });
  // Subscribe only once the list has been read, so a non-admin or an older
  // server never joins a scope it cannot use.
  usePipelineNudge(enabled && list.isSuccess, RELEASE_BOARD_KEY);
  return list;
}

export function useReleaseBoard(
  family: string | null,
  enabled: boolean
): UseQueryResult<ReleaseBoard, Error> {
  return useQuery({
    queryKey: [...RELEASE_BOARD_KEY, 'family', family ?? ''],
    queryFn: ({ signal }) =>
      apiGet<ReleaseBoard>(endpoints.releaseBoard(family ?? ''), { signal }),
    enabled: enabled && family !== null && family !== '',
    staleTime: 10_000,
    refetchInterval: (query) => (query.state.error ? false : BOARD_REFETCH_MS),
    retry: false,
  });
}

/**
 * The forge's environments of each repository in `repos`, keyed by
 * `owner/name`. A repository whose read failed is simply absent: the board
 * then shows the snapshot for its stages, which is what it would show anyway.
 */
export function useBoardEnvironments(
  repos: readonly string[]
): ReadonlyMap<string, EnvironmentSummary[]> {
  const results = useQueries({
    queries: repos.map((repo) => {
      const [owner = '', name = ''] = repo.split('/');
      return {
        queryKey: [...RELEASE_BOARD_KEY, 'environments', repo],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          apiGet<EnvironmentsResponse>(endpoints.repoEnvironments(owner, name), { signal }),
        staleTime: 10_000,
        refetchInterval: BOARD_REFETCH_MS,
        retry: false,
      };
    }),
  });
  const byRepo = new Map<string, EnvironmentSummary[]>();
  results.forEach((result, index) => {
    const repo = repos[index];
    if (repo && result.data) byRepo.set(repo, result.data.environments);
  });
  return byRepo;
}
