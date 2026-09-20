// useDependencyGraph.ts - the repo graph with its `depends_on` edges.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { RepoGraphResponse } from '../api/types';

export const DEPENDENCY_GRAPH_QUERY_KEY: readonly [
  'control-plane',
  'repo-graph',
  'depends_on',
] = ['control-plane', 'repo-graph', 'depends_on'];

/**
 * Asks for the dependency edges explicitly: the snapshot graph carries repos,
 * pulls and checks, and a server that does not know `depends_on` answers with
 * the edges it does have rather than an error.
 */
export function useDependencyGraph(): UseQueryResult<RepoGraphResponse, Error> {
  return useQuery({
    queryKey: DEPENDENCY_GRAPH_QUERY_KEY,
    queryFn: ({ signal }) =>
      apiGet<RepoGraphResponse>(
        endpoints.controlPlaneRepoGraph({ include: ['depends_on'] }),
        { signal }
      ),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}
