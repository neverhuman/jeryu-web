// useArchiveRepository.ts — archive / unarchive mutation (HTTP PATCH,
// `/api/v1/repos/{id}` with `{ "archived": bool }`).
//
// Archiving makes the repository read-only; nothing is deleted and
// unarchiving restores everything, so both directions ride the same call.
// The server allows it for global admins only (403 otherwise). On success the
// repos list cache is invalidated (every filtered slot and the resolved
// repository hang off the `['repos', ...]` prefix) so the header badge and
// the list's Archived filter pick the new state up.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';

import { apiPatch, ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';

export function useArchiveRepository(
  repoId: string | null
): UseMutationResult<unknown, ApiError, boolean> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (archived: boolean) => {
      if (!repoId) {
        throw new ApiError(0, {
          code: 'invalid_state',
          message: 'Repository not resolved yet.',
        });
      }
      return apiPatch<unknown>(endpoints.repo(repoId), { archived });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['repos'] });
    },
  });
}
