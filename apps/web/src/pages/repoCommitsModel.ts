// repoCommitsModel.ts — pure helpers behind the commits list and the commit
// page.
//
// `…/commits[/<ref>][?path=]` is one page of a ref's history, newest first,
// and `…/commit/<sha>` is one of those commits in full. The file view links
// into both: History to the list narrowed to the file, and each blame gutter
// to the commit that last touched those lines.

import { repoFrontPath } from './repoBrowserModel';
import { formatCount } from '../format/number';

/** Commits per page: enough to scan, small enough to render at once. */
export const COMMITS_PAGE_SIZE = 30;

/** `/repos/<p>/<owner>/<name>/commits/<ref>?path=<path>`. */
export function commitsPath(
  provider: string,
  fullName: string,
  ref?: string,
  path?: string
): string {
  const base = `${repoFrontPath(provider, fullName)}/commits`;
  const withRef = ref ? `${base}/${encodeURIComponent(ref)}` : base;
  return path ? `${withRef}?path=${encodeURIComponent(path)}` : withRef;
}

/** `/repos/<p>/<owner>/<name>/commit/<sha>`: one commit in full. */
export function commitPath(provider: string, fullName: string, sha: string): string {
  return `${repoFrontPath(provider, fullName)}/commit/${encodeURIComponent(sha)}`;
}

/** The page a `?page=` parameter asks for: 1-based, never below 1. */
export function parsePageParam(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/** "Commits 31–60 of 1,204", and "Commits 1–0 of 0" is never shown: see below. */
export function historyRangeLabel(
  page: number,
  limit: number,
  shown: number,
  total: number
): string {
  if (shown === 0) return 'No commits';
  const first = (page - 1) * limit + 1;
  return `Commits ${formatCount(first)}–${formatCount(first + shown - 1)} of ${formatCount(total)}`;
}

/** What the list says it is showing: the whole ref, or one path of it. */
export function historyTitle(refName: string, path: string): string {
  return path ? `History of ${path}` : `Commits on ${refName}`;
}
