// searchModel.ts — what /search?q= shows and how it is addressed.
//
// The records come from one server call (`GET /api/v1/search`, see
// `jeryu-deploy/docs/search.md`), which searches repositories, pull requests,
// issues, todos and — for admins — the activity log. Pages are matched here,
// because only the SPA knows its own nav destinations. Pure functions.

import type { SearchHit, SearchKind } from '../../api/types';
import type { Command } from '../../stores/commandStore';

export const SEARCH_PATH = '/search';

/** The shareable URL of a search. */
export function searchUrl(query: string): string {
  const q = query.trim();
  return q ? `${SEARCH_PATH}?${new URLSearchParams({ q }).toString()}` : SEARCH_PATH;
}

/** Section heading per kind, and the order the sections are rendered in. */
export const KIND_LABELS: Record<SearchKind, string> = {
  repository: 'Repositories',
  pull_request: 'Pull requests',
  issue: 'Issues',
  todo: 'Todos',
  activity: 'Activity',
};

export const KIND_ORDER: SearchKind[] = [
  'repository',
  'pull_request',
  'issue',
  'todo',
  'activity',
];

/** One rendered section: its kind, its hits, and the server's true total. */
export interface HitGroup {
  kind: SearchKind;
  label: string;
  hits: SearchHit[];
  /** Matches before the server's per-kind limit cut the list. */
  total: number;
}

/**
 * The answer split into sections, one per kind the server says it searched —
 * including the kinds that matched nothing, so the page can say "no todo
 * matches" rather than leave the reader guessing whether it looked.
 */
export function hitGroups(
  kinds: readonly SearchKind[],
  results: readonly SearchHit[],
  counts: Partial<Record<SearchKind, number>>
): HitGroup[] {
  const ordered = KIND_ORDER.filter((kind) => kinds.includes(kind));
  return ordered.map((kind) => {
    const hits = results.filter((hit) => hit.kind === kind);
    return { kind, label: KIND_LABELS[kind], hits, total: counts[kind] ?? hits.length };
  });
}

/** How many more matched than are shown, 0 when the section is complete. */
export function hiddenCount(group: HitGroup): number {
  return Math.max(0, group.total - group.hits.length);
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
