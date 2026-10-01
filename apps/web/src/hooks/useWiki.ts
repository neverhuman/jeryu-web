// useWiki.ts — what the wiki reader reads from its repository: every Markdown
// page, one page's text, who last changed each of its lines, and the page's
// first and newest commits.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { RepoCommitsResponse } from '../api/types/commits';
import type { CompareCommit } from '../api/types/deployments';
import type { BlameResponse, PagesResponse } from '../api/types/wiki';

export function useWikiPages(
  repoId: string | null,
  ref: string
): UseQueryResult<PagesResponse, Error> {
  return useQuery({
    queryKey: ['repo', repoId, 'pages', ref],
    queryFn: ({ signal }) =>
      apiGet<PagesResponse>(endpoints.pages(repoId as string, ref), { signal }),
    enabled: Boolean(repoId) && ref.length > 0,
    staleTime: 30_000,
  });
}

export function useBlame(
  repoId: string | null,
  ref: string,
  path: string | null
): UseQueryResult<BlameResponse, Error> {
  return useQuery({
    queryKey: ['repo', repoId, 'blame', ref, path],
    queryFn: ({ signal }) =>
      apiGet<BlameResponse>(endpoints.blame(repoId as string, { ref, path: path as string }), {
        signal,
      }),
    enabled: Boolean(repoId) && ref.length > 0 && Boolean(path),
    staleTime: 30_000,
    // Margin notes are an extra: a server without blame shows the page without them.
    retry: false,
  });
}

export interface PageHistory {
  /** How many commits touched the page. */
  revisions: number;
  newest: CompareCommit | null;
  oldest: CompareCommit | null;
}

/**
 * The newest commit and the revision count come from one request; the oldest
 * is the last page of a one-per-page listing, read once the count is known.
 */
export function usePageHistory(
  repoId: string | null,
  ref: string,
  path: string | null
): { data: PageHistory | undefined; isPending: boolean } {
  const enabled = Boolean(repoId) && ref.length > 0 && Boolean(path);
  const newest = useQuery({
    queryKey: ['repo', repoId, 'commits', ref, 'path', path, 'newest'],
    queryFn: ({ signal }) =>
      apiGet<RepoCommitsResponse>(
        endpoints.commits(repoId as string, { ref, path: path as string, limit: 1 }),
        { signal }
      ),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
  const total = newest.data?.page.total ?? 0;
  const oldest = useQuery({
    queryKey: ['repo', repoId, 'commits', ref, 'path', path, 'oldest', total],
    queryFn: ({ signal }) =>
      apiGet<RepoCommitsResponse>(
        endpoints.commits(repoId as string, {
          ref,
          path: path as string,
          limit: 1,
          page: total,
        }),
        { signal }
      ),
    enabled: enabled && total > 1,
    staleTime: 30_000,
    retry: false,
  });
  if (!newest.data) return { data: undefined, isPending: newest.isPending };
  const first = newest.data.commits[0] ?? null;
  return {
    isPending: false,
    data: {
      revisions: total,
      newest: first,
      oldest: total > 1 ? (oldest.data?.commits[0] ?? null) : first,
    },
  };
}
