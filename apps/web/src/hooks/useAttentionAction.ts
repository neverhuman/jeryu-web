// useAttentionAction.ts — run the act a "Needs you" row carries (`action.api`).
//
// The server names one same-origin call per row; the row's button makes it.
// Every attempt carries its own `Idempotency-Key` (§35.1.3), so a retried or
// double click collapses to one act, and the pipeline reads are invalidated
// afterwards so the row disappears as soon as its cause is gone.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { ApiError, apiDelete, apiDeleteWithBody, apiSend } from '../api/client';

import { newIdempotencyKey } from './useApplySettingsPatch';
import { PIPELINE_KEY } from './usePipeline';

export interface AttentionApiCall {
  method: 'POST' | 'DELETE';
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
      return apiSend<unknown>(path, body, opts);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PIPELINE_KEY });
    },
  });
}
