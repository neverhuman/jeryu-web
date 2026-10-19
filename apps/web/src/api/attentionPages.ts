// attentionPages.ts — the whole Needs-you inbox, every family.
//
// The server pages `GET /api/v1/attention` (100 items unless asked, most
// severe first), and every page filtered the first page by family itself: on
// 2026-10-19 the jeryu family had 50 rows waiting while Needs you showed 17,
// because the other 33 sat past item 100 of the all-families inbox. Walk the
// pages instead; `counts` and `families` already describe the whole inbox, so
// they are read off the first page.

import { apiGet } from './client';
import { endpoints } from './endpoints';
import type { AttentionResponse } from './types';

/** The most items the server returns per page. */
export const ATTENTION_PAGE_LIMIT = 500;
/** A ceiling on pages, so a server that never says "no more" cannot spin. */
const MAX_PAGES = 20;

export async function fetchAttention(signal?: AbortSignal): Promise<AttentionResponse> {
  let first: AttentionResponse | null = null;
  const items: AttentionResponse['items'] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const answer = await apiGet<AttentionResponse>(
      endpoints.attention({ limit: ATTENTION_PAGE_LIMIT, page }),
      { signal }
    );
    first ??= answer;
    items.push(...answer.items);
    if (!answer.page?.has_more || answer.items.length === 0) break;
  }
  return { ...(first as AttentionResponse), items };
}
