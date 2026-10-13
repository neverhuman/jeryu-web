// useAttentionAction.ts — run the act a "Needs you" row carries (`action.api`).
//
// The server names one same-origin call per row; the row's button makes it.
// Every attempt carries its own `Idempotency-Key` (§35.1.3), so a retried or
// double click collapses to one act. The pipeline feed, the repo pull lists,
// and the Pull Room snapshot are invalidated afterwards so the row and the
// pull it changed both drop the old state.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { ApiError, apiDelete, apiDeleteWithBody, apiPatch, apiSend } from '../api/client';

import { newIdempotencyKey } from './idempotency';
import { CONTROL_PLANE_QUERY_KEY } from './useControlPlane';
import { PIPELINE_KEY } from './usePipeline';

export interface AttentionApiCall {
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
}

export function useAttentionAction(): UseMutationResult<unknown, ApiError, AttentionApiCall> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ method, path, body }: AttentionApiCall) => {
      const opts = { idempotencyKey: newIdempotencyKey() };
      if (method === 'DELETE') {
        return body === undefined
          ? apiDelete(path, opts)
          : apiDeleteWithBody<unknown>(path, body, opts);
      }
      if (method === 'PATCH') return apiPatch<unknown>(path, body, opts);
      return apiSend<unknown>(path, body, opts);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PIPELINE_KEY });
      void queryClient.invalidateQueries({ queryKey: ['repo-pulls'] });
      void queryClient.invalidateQueries({ queryKey: CONTROL_PLANE_QUERY_KEY });
    },
  });
}
