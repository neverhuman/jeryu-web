// useRepoPullLists.ts — the pull request lists of several repositories at once
// (`GET /api/v1/repos/{owner/name}/pulls`), one query per repo so rows appear
// as each repo answers and one repo's failure stays that repo's.

import { useQueries } from '@tanstack/react-query';

import { fetchPullList } from '../api/pullLists';
import type { PullRequestSummary } from '../api/types';

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
        fetchPullList(repo, state, signal),
      staleTime: 15_000,
      refetchInterval,
    })),
  });
  const lists: RepoPullLists = { pulls: [], loading: [], failed: [] };
  const pulls: PullRequestSummary[] = [];
  results.forEach((result, index) => {
    const repo = repos[index];
    if (result.data) pulls.push(...result.data.items);
    else if (result.error) lists.failed.push({ repo, message: result.error.message });
    else lists.loading.push(repo);
  });
  lists.pulls = uniquePulls(pulls);
  return lists;
}

/**
 * One row per pull request. Two asked-for names can resolve to the same
 * repository (an alias, a rename), and a todo that names two repos can have
 * both answered by one list: its pull request must still be listed once.
 */
export function uniquePulls(pulls: readonly PullRequestSummary[]): PullRequestSummary[] {
  const seen = new Set<string>();
  const out: PullRequestSummary[] = [];
  for (const pr of pulls) {
    const key = `${pr.repo.host}:${pr.repo.owner}/${pr.repo.name}#${pr.number}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pr);
  }
  return out;
}
