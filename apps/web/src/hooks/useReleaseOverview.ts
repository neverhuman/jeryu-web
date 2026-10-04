// useReleaseOverview.ts — environments, their compare against the default
// branch, and the repository's pull requests, folded into Releases page rows.

import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import { fetchPullList } from '../api/pullLists';
import type { CompareResponse, EnvironmentsResponse } from '../api/types/deployments';
import { buildEnvironmentRows, type EnvironmentRow } from '../pages/releasesModel';

export interface ReleaseOverview {
  rows: EnvironmentRow[];
  isLoading: boolean;
  /** Set when the environments themselves could not be read. */
  error: Error | null;
  /** Asks for the environments and pull requests again, for a Retry. */
  refetch: () => void;
}

export function useReleaseOverview(repoId: string, defaultBranch: string): ReleaseOverview {
  const [owner = '', repo = ''] = repoId.split('/');
  const environments = useQuery({
    queryKey: ['releases', 'environments', repoId],
    queryFn: ({ signal }) =>
      apiGet<EnvironmentsResponse>(endpoints.repoEnvironments(owner, repo), { signal }),
    enabled: owner !== '' && repo !== '',
    staleTime: 15_000,
  });
  const pulls = useQuery({
    queryKey: ['releases', 'pulls', repoId],
    queryFn: ({ signal }) =>
      fetchPullList(repoId, 'all', signal),
    enabled: owner !== '' && repo !== '',
    staleTime: 30_000,
  });

  const liveShas = useMemo(
    () => [
      ...new Set(
        (environments.data?.environments ?? [])
          .map((env) => env.current?.deployment.sha)
          .filter((sha): sha is string => typeof sha === 'string')
      ),
    ],
    [environments.data]
  );
  const compares = useQueries({
    queries: liveShas.map((sha) => ({
      queryKey: ['releases', 'compare', repoId, sha, defaultBranch],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiGet<CompareResponse>(endpoints.compare(repoId, sha, defaultBranch), { signal }),
      staleTime: 30_000,
    })),
  });

  // A handful of environments: folding them every render is cheaper than
  // memoizing on useQueries' per-render result array.
  const bySha = new Map<string, CompareResponse>();
  compares.forEach((query, index) => {
    const sha = liveShas[index];
    if (query.data && sha) bySha.set(sha, query.data);
  });
  const rows = buildEnvironmentRows(
    environments.data?.environments ?? [],
    bySha,
    pulls.data?.items ?? null
  );

  return {
    rows,
    isLoading: environments.isLoading,
    error: environments.error ?? null,
    refetch: () => {
      void environments.refetch();
      void pulls.refetch();
    },
  };
}
