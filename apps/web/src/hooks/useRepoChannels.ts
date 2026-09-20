// useRepoChannels.ts — the release ladder of several repositories at once:
// one baseline per environment that has a live deployment (dev, canary,
// stable, production), else the newest tag on the branch, plus the compare
// each baseline needs to place a merged pull request on it.
//
// Three dependent rounds — environments, then tags only where no environment
// answered, then one compare per baseline — so a repository that ships by tag
// costs one extra request and one that ships by deployment costs none.
// Everything is cached by repo, so switching family or filter re-reads nothing.

import { useQueries } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  CompareResponse,
  EnvironmentsResponse,
  ReleaseTagResponse,
} from '../api/types/deployments';
import {
  ladderBaselines,
  ladderCompares,
  NO_LADDER,
  type LadderBaselines,
  type PipId,
} from '../pages/releaseChannelsModel';

export interface RepoChannels {
  baselines: LadderBaselines;
  /** `<baseline sha>..branch` per pip; a missing entry is undecided. */
  compares: Map<PipId, CompareResponse | null>;
}

export interface RepoChannelsMap {
  /** Keyed by `owner/name`; a repo that has not answered yet is absent. */
  byRepo: Map<string, RepoChannels>;
  /** True while any environment, tag or compare is still in flight. */
  isLoading: boolean;
}

/** The ladder of a repository that has answered nothing yet. */
export const EMPTY_CHANNELS: RepoChannels = { baselines: NO_LADDER, compares: new Map() };

export function useRepoChannels(repos: string[], branch = 'main'): RepoChannelsMap {
  const environments = useQueries({
    queries: repos.map((repo) => {
      const [owner = '', name = ''] = repo.split('/');
      return {
        queryKey: ['releases', 'environments', repo],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          apiGet<EnvironmentsResponse>(endpoints.repoEnvironments(owner, name), { signal }),
        enabled: owner !== '' && name !== '',
        staleTime: 30_000,
        retry: false,
      };
    }),
  });
  // A repository with no deployed environment is released by tag instead.
  const needTag = repos.map(
    (_repo, index) =>
      !environments[index]?.isLoading &&
      !(environments[index]?.data?.environments ?? []).some((env) => env.current)
  );
  const tags = useQueries({
    queries: repos.map((repo, index) => ({
      queryKey: ['releases', 'release-tag', repo, branch],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiGet<ReleaseTagResponse>(endpoints.releaseTag(repo, branch), { signal }),
      enabled: needTag[index] === true,
      staleTime: 60_000,
      retry: false,
    })),
  });

  // Projections, not state: both are cheap and pure, and every query below is
  // keyed by repo and sha, so recomputing them per render refetches nothing.
  const baselines = repos.map((_repo, index) =>
    ladderBaselines(environments[index]?.data, tags[index]?.data)
  );

  // One compare per baseline, flattened so React Query sees a flat list.
  const wanted = repos.flatMap((repo, index) =>
    ladderCompares(baselines[index] ?? NO_LADDER).map((entry) => ({ repo, ...entry }))
  );
  const compares = useQueries({
    queries: wanted.map((entry) => ({
      queryKey: ['releases', 'compare', entry.repo, entry.base, branch],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiGet<CompareResponse>(endpoints.compare(entry.repo, entry.base, branch), { signal }),
      staleTime: 30_000,
      retry: false,
    })),
  });

  const byRepo = new Map<string, RepoChannels>();
  repos.forEach((repo, index) => {
    byRepo.set(repo, { baselines: baselines[index] ?? NO_LADDER, compares: new Map() });
  });
  wanted.forEach((entry, index) => {
    const channels = byRepo.get(entry.repo);
    // A failed compare stays absent from the map: undecided, not "released".
    if (channels && compares[index]?.data) {
      channels.compares.set(entry.id, compares[index]?.data ?? null);
    }
  });
  return {
    byRepo,
    isLoading: [...environments, ...tags, ...compares].some((query) => query.isLoading),
  };
}
