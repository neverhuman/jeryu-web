// useRepoPullLists.ts — the pull request lists of several repositories at once
// (`GET /api/v1/repos/{owner/name}/pulls`), one query per repo so rows appear
// as each repo answers and one repo's failure stays that repo's.

import { useQueries } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { PullRequestListResponse, PullRequestSummary } from '../api/types';

export interface RepoPullLists {
  pulls: PullRequestSummary[];
  /** Repos still loading their first answer. */
  loading: string[];
  /** Repos whose list could not be loaded, with why. */
  failed: { repo: string; message: string }[];
}

export function useRepoPullLists(
  repos: string[],
  state: 'open' | undefined,
  refetchInterval: number
): RepoPullLists {
  const results = useQueries({
    queries: repos.map((repo) => ({
      queryKey: ['repo-pulls', repo, state ?? 'all'],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiGet<PullRequestListResponse>(endpoints.pulls(repo, state), { signal }),
      staleTime: 15_000,
      refetchInterval,
    })),
  });
  const lists: RepoPullLists = { pulls: [], loading: [], failed: [] };
  results.forEach((result, index) => {
    const repo = repos[index];
    if (result.data) lists.pulls.push(...result.data.items);
    else if (result.error) lists.failed.push({ repo, message: result.error.message });
    else lists.loading.push(repo);
  });
  return lists;
}
