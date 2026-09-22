// searchModel.ts — what /search?q= finds besides repositories (which the
// server matches through `GET /api/v1/repos?q=`): pages by title or keyword,
// and a pull request typed as `owner/name#12`. Pure functions.

import type { Command } from '../../stores/commandStore';

export const SEARCH_PATH = '/search';

/** The shareable URL of a search. */
export function searchUrl(query: string): string {
  const q = query.trim();
  return q ? `${SEARCH_PATH}?${new URLSearchParams({ q }).toString()}` : SEARCH_PATH;
}

export interface PageHit {
  id: string;
  title: string;
  path: string;
}

/** Pages whose title or keywords contain every word of the query. */
export function pageHits(query: string, commands: readonly Command[]): PageHit[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return commands
    .filter((c) => c.target.kind === 'route')
    .filter((c) => {
      const text = `${c.title} ${c.keywords.join(' ')}`.toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .map((c) => ({
      id: c.id,
      title: c.title,
      path: c.target.kind === 'route' ? c.target.path : '',
    }));
}
