// usePromoteStage.ts — the release board's Promote: ask the forge to queue the
// deploy a stage names. The forge takes the release from its own snapshot, so
// the body is only the lane and stage. A second press is the first (the server
// answers with the open ask), and the board refetches afterwards so the cell
// shows the ask's state.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult
} from '@tanstack/react-query';

import { apiSend, type ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { PromoteResponse } from '../api/types/releaseBoard';
import { newIdempotencyKey } from './idempotency';
import { RELEASE_BOARD_KEY } from './useReleaseBoard';

export interface PromoteTarget {
  family: string;
  lane: string;
  stage: string;
}

export function usePromoteStage(): UseMutationResult<
  PromoteResponse,
  ApiError,
  PromoteTarget
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ family, lane, stage }: PromoteTarget) =>
      apiSend<PromoteResponse>(
        endpoints.releaseBoardPromote(family),
        { lane, stage },
        { idempotencyKey: newIdempotencyKey() }
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: RELEASE_BOARD_KEY });
    }
  });
}
