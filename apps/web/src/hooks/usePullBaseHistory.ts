// usePullBaseHistory.ts — the recent history of every branch an open pull
// request targets (`GET /api/v1/repos/{id}/commits?ref=&limit=`), so the
// timeline's base order can say how far behind its base each one was opened.
//
// One request per repository and base branch, and only while the base order is
// on. A history that fails or has not loaded yet reads `undefined`: the graph
// still draws, with its positions unknown, rather than holding the page.

import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { PullRequestSummary } from '../api/types';
import type { RepoCommitsResponse } from '../api/types/commits';
import { commitsQueryKey } from './useRepoCommits';
import {
  BASE_HISTORY_LIMIT,
  baseHistoryKeys,
  type BaseHistory,
} from '../pages/pullBaseGraphModel';

export type BaseHistoryLookup = (repoId: string, ref: string) => BaseHistory | undefined;

export function usePullBaseHistory(
  pulls: readonly PullRequestSummary[],
  enabled: boolean
): BaseHistoryLookup {
  const keys = useMemo(() => (enabled ? baseHistoryKeys(pulls) : []), [pulls, enabled]);
  const answers = useQueries({
    queries: keys.map(({ repoId, ref }) => ({
      queryKey: commitsQueryKey(repoId, ref, BASE_HISTORY_LIMIT),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiGet<RepoCommitsResponse>(
          endpoints.commits(repoId, { ref, limit: BASE_HISTORY_LIMIT }),
          { signal }
        ),
      staleTime: 30_000,
      retry: false,
    })),
  });
  const byKey = new Map<string, BaseHistory>();
  keys.forEach(({ repoId, ref }, index) => {
    const data = answers[index]?.data;
    if (data) {
      byKey.set(historyKey(repoId, ref), { commits: data.commits, hasMore: data.page.has_more });
    }
  });
  return (repoId, ref) => byKey.get(historyKey(repoId, ref));
}

function historyKey(repoId: string, ref: string): string {
  return `${repoId}\n${ref}`;
}
