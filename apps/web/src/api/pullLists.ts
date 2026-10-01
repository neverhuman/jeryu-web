// pullLists.ts — a repository's whole pull request list. The server pages
// `GET /api/v1/repos/{id}/pulls` (oldest first, 100 rows unless asked), so a
// single request silently dropped every pull request after the first page:
// jeryu-deploy's open #115 and #116 never appeared once it passed #100.

import { apiGet } from './client';
import { endpoints } from './endpoints';
import type { PullRequestListResponse } from './types';

/** The most rows the server returns per page. */
export const PULL_PAGE_LIMIT = 500;
/** A ceiling on pages, so a server that never says "no more" cannot spin. */
const MAX_PAGES = 40;

export async function fetchPullList(
  repoId: string,
  state: string | undefined,
  signal?: AbortSignal
): Promise<PullRequestListResponse> {
  const items: PullRequestListResponse['items'] = [];
  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const answer = await apiGet<PullRequestListResponse>(
      endpoints.pulls(repoId, state, { limit: PULL_PAGE_LIMIT, page }),
      { signal }
    );
    items.push(...answer.items);
    total = answer.total;
    if (!answer.page?.has_more || answer.items.length === 0) break;
  }
  return { items, total };
}
