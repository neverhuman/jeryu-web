// useRepoChannels.ts — the release ladder of several repositories at once:
// one baseline per environment that has a live deployment (dev, canary,
// stable, production), else the commit a parent deployment pins, else the
// newest tag on the branch, plus the compare each baseline needs to place a
// merged pull request on it.
//
// Three dependent rounds — environments, then the forge's release pins and
// the tags of whatever they do not cover, then one compare per baseline — so
// a repository that ships inside a parent release costs one shared request
// and one that ships by deployment costs none. The tags are read in batches
// of up to RELEASE_TAGS_BATCH repositories per request
// (`GET /api/v1/release-tags`), where "no tag" is a status, not a 404.
// Everything is cached, so switching family or filter re-reads nothing.
//
// A repository whose batch failed is listed in `deferred`, and its ladder
// should read undecided, not "never released".

import { useQueries, useQuery } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  CompareResponse,
  EnvironmentsResponse,
  ReleasePinsResponse,
  ReleaseTagResponse,
  ReleaseTagsResponse,
} from '../api/types/deployments';
import {
  ladderBaselines,
  releaseTagOf,
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
  /** Repositories whose release falls back to a tag the forge did not answer for. */
  deferred: ReadonlySet<string>;
}

/** The most repositories `GET /api/v1/release-tags` answers in one request. */
export const RELEASE_TAGS_BATCH = 100;

/** `items` in runs of at most `size`, in order. */
export function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
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
  // A repository with no deployed environment ships inside another's release,
  // or is released by tag. The pins are forge-wide, so one request answers for
  // every such repository at once.
  const unDeployed = repos.map(
    (_repo, index) =>
      !environments[index]?.isLoading &&
      !(environments[index]?.data?.environments ?? []).some((env) => env.current)
  );
  const pins = useQuery({
    queryKey: ['releases', 'release-pins'],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiGet<ReleasePinsResponse>(endpoints.releasePins(), { signal }),
    enabled: unDeployed.some(Boolean),
    staleTime: 30_000,
    retry: false,
  });
  const pinsFor = (repo: string) =>
    (pins.data?.pins ?? []).filter((pin) => pin.repo === repo);
  // Only a repository no parent release carries falls back to a tag.
  const needTag = repos.map(
    (repo, index) =>
      unDeployed[index] === true && !pins.isLoading && pinsFor(repo).length === 0
  );
  // Sorted, so the same set of repositories is the same batch however the
  // page ordered them.
  const batches = chunked(
    repos.filter((_repo, index) => needTag[index] === true).sort(),
    RELEASE_TAGS_BATCH
  );
  const tagBatches = useQueries({
    queries: batches.map((batch) => ({
      queryKey: ['releases', 'release-tags', branch, ...batch],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiGet<ReleaseTagsResponse>(endpoints.releaseTags(batch, branch), { signal }),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const tagOf = new Map<string, ReleaseTagResponse>();
  const tagFailed = new Set<string>();
  batches.forEach((batch, index) => {
    const answer = tagBatches[index];
    if (answer?.isError) batch.forEach((repo) => tagFailed.add(repo));
    for (const row of answer?.data?.releases ?? []) tagOf.set(row.repo, releaseTagOf(row, branch));
  });

  // Projections, not state: both are cheap and pure, and every query below is
  // keyed by repo and sha, so recomputing them per render refetches nothing.
  const baselines = repos.map((repo, index) =>
    ladderBaselines(environments[index]?.data, tagOf.get(repo), pinsFor(repo))
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
    isLoading: [...environments, pins, ...tagBatches, ...compares].some((query) => query.isLoading),
    deferred: tagFailed,
  };
}
