// useRepoUnreleased.ts — one repository's pull requests classified against
// its newest release: production's live deployment when the forge recorded
// one, else the newest tag on the branch, else "no release recorded".

import { useQuery } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  CompareResponse,
  EnvironmentsResponse,
  ReleaseTagResponse,
} from '../api/types/deployments';
import type { PullRequestListResponse } from '../api/types/pullRequests';
import {
  classifyPulls,
  repoSummary,
  type ReleaseBaseline,
  type RepoSummary,
  type UnreleasedRow,
} from '../pages/unreleasedModel';

export const RELEASE_ENVIRONMENT = 'production';

export interface RepoUnreleased {
  rows: UnreleasedRow[];
  summary: RepoSummary | null;
  baseline: ReleaseBaseline | null;
  isLoading: boolean;
  error: Error | null;
}

export function baselineFrom(
  environments: EnvironmentsResponse | undefined,
  releaseTag: ReleaseTagResponse | undefined
): ReleaseBaseline | null {
  const live = environments?.environments.find((env) => env.name === RELEASE_ENVIRONMENT)?.current;
  if (live) {
    const release = live.deployment.payload?.['release'];
    return {
      kind: 'deployment',
      name: typeof release === 'string' ? release : RELEASE_ENVIRONMENT,
      environment: RELEASE_ENVIRONMENT,
      sha: live.deployment.sha,
      at: live.deployment.created_at,
    };
  }
  if (!releaseTag) return null;
  return releaseTag.tag && releaseTag.sha
    ? { kind: 'tag', name: releaseTag.tag, sha: releaseTag.sha, at: releaseTag.tagged_at }
    : { kind: 'none' };
}

export function useRepoUnreleased(repoId: string, branch: string): RepoUnreleased {
  const [owner = '', repo = ''] = repoId.split('/');
  const enabled = owner !== '' && repo !== '';
  const environments = useQuery({
    queryKey: ['releases', 'environments', repoId],
    queryFn: ({ signal }) =>
      apiGet<EnvironmentsResponse>(endpoints.repoEnvironments(owner, repo), { signal }),
    enabled,
    staleTime: 15_000,
  });
  const pulls = useQuery({
    queryKey: ['releases', 'pulls', repoId],
    queryFn: ({ signal }) =>
      apiGet<PullRequestListResponse>(endpoints.pulls(repoId, 'all'), { signal }),
    enabled,
    staleTime: 30_000,
  });
  const hasDeployment = Boolean(
    environments.data?.environments.some((env) => env.name === RELEASE_ENVIRONMENT && env.current)
  );
  // Tags are only consulted when no deployment settles the question; a repo
  // whose environments cannot be read falls back to its tags too.
  const releaseTag = useQuery({
    queryKey: ['releases', 'release-tag', repoId, branch],
    queryFn: ({ signal }) =>
      apiGet<ReleaseTagResponse>(endpoints.releaseTag(repoId, branch), { signal }),
    enabled: enabled && !environments.isLoading && !hasDeployment,
    staleTime: 30_000,
  });
  const baseline = baselineFrom(environments.data, releaseTag.data);
  const baseSha = baseline && baseline.kind !== 'none' ? baseline.sha : null;
  const compare = useQuery({
    queryKey: ['releases', 'compare', repoId, baseSha, branch],
    queryFn: ({ signal }) =>
      apiGet<CompareResponse>(endpoints.compare(repoId, baseSha ?? '', branch), { signal }),
    enabled: baseSha !== null,
    staleTime: 30_000,
  });

  const items = pulls.data?.items ?? [];
  const rows = baseline ? classifyPulls(items, baseline, compare.data ?? null) : [];
  return {
    rows,
    summary:
      baseline && baseline.kind !== 'none' && compare.error
        ? { state: 'unknown', text: `Could not compare ${branch} with ${baseline.name}` }
        : baseline
          ? repoSummary(baseline, compare.data ?? null, rows, branch)
          : null,
    baseline,
    isLoading: pulls.isLoading || (!baseline && !releaseTag.error),
    error: pulls.error ?? (baseline ? null : releaseTag.error) ?? null,
  };
}
