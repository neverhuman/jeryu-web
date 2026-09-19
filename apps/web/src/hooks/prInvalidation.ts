// prInvalidation.ts — what goes stale when a pull request changes.
//
// An approve, a review or a merge changes more than the PR detail: the repo's
// PR list, the Pull Room snapshot, the release views and the Needs-you list all
// describe the same PR. Invalidate them together so no page shows the old state.

import type { QueryClient } from '@tanstack/react-query';

import { CONTROL_PLANE_QUERY_KEY } from './useControlPlane';
import { PIPELINE_KEY } from './usePipeline';

export function invalidateAfterPrChange(queryClient: QueryClient, repoId: string | null): void {
  const keys: ReadonlyArray<readonly unknown[]> = [
    ['repo-pulls', repoId],
    CONTROL_PLANE_QUERY_KEY,
    ['releases'],
    ['deployments'],
    PIPELINE_KEY,
  ];
  for (const queryKey of keys) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
