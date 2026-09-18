// useDeployedRepositories.ts — every readable repository's live production
// deployment and lag, keyed by `owner/name`, from one request.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  DeployedRepositoriesResponse,
  DeployedRepository,
} from '../api/types/deployments';

export function useDeployedRepositories(
  environment = 'production'
): ReadonlyMap<string, DeployedRepository> {
  const query = useQuery({
    queryKey: ['deployments', environment],
    queryFn: ({ signal }) =>
      apiGet<DeployedRepositoriesResponse>(endpoints.deployedRepositories(environment), {
        signal,
      }),
    staleTime: 30_000,
    // A forge without the route answers 404; the column then reads "not deployed".
    retry: false,
  });
  return useMemo(
    () => new Map((query.data?.repositories ?? []).map((row) => [row.repo, row])),
    [query.data]
  );
}
