// useRunnerReleaseBoards.ts — every family's release board, read for /runners.
//
// The Runners page links each runner to the board lane that ships its code
// (see pages/fleet/releaseIndex.ts). It reads the same two endpoints the
// Releases page does — the list of families, then each family's snapshot —
// but once, and again at most every 5 minutes: runner rows poll every 15 s
// and must not drag the boards along. The reads are admin-only; the query
// simply errors for anyone else (or on an older server) and the page then
// draws no links. A family whose board cannot be read is left out.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { ReleaseBoard, ReleaseBoardListResponse } from '../api/types/releaseBoard';

/** How often /runners rereads the boards at most. */
export const RUNNER_BOARDS_REFRESH_MS = 5 * 60_000;

export const RUNNER_RELEASE_BOARDS_KEY: readonly ['runners', 'release-boards'] = [
  'runners',
  'release-boards',
];

function readable(
  result: PromiseSettledResult<ReleaseBoard>
): result is PromiseFulfilledResult<ReleaseBoard> {
  return result.status === 'fulfilled';
}

export async function fetchAllReleaseBoards(signal?: AbortSignal): Promise<ReleaseBoard[]> {
  const list = await apiGet<ReleaseBoardListResponse>(endpoints.releaseBoards(), { signal });
  const results = await Promise.allSettled(
    list.boards.map((entry) =>
      apiGet<ReleaseBoard>(endpoints.releaseBoard(entry.family), { signal })
    )
  );
  return results.filter(readable).map((result) => result.value);
}

export function useRunnerReleaseBoards(): UseQueryResult<ReleaseBoard[], Error> {
  return useQuery({
    queryKey: RUNNER_RELEASE_BOARDS_KEY,
    queryFn: ({ signal }) => fetchAllReleaseBoards(signal),
    staleTime: RUNNER_BOARDS_REFRESH_MS,
    refetchInterval: RUNNER_BOARDS_REFRESH_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
