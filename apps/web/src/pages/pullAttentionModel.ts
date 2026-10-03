// pullAttentionModel.ts — the "Needs you" rows that name one pull request,
// filed under that pull request so the timeline can mark its own row instead
// of repeating /needs-you above the list.

import type { AttentionItem } from '../api/types';

/** `owner/name#number`: one repository's pull request. */
export function pullAttentionKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

/** Items that name a repository and a pull request, grouped by that pull request. */
export function attentionByPull(items: AttentionItem[]): Map<string, AttentionItem[]> {
  const byPull = new Map<string, AttentionItem[]>();
  for (const item of items) {
    if (!item.repo || item.pr === null) continue;
    const key = pullAttentionKey(item.repo, item.pr);
    byPull.set(key, [...(byPull.get(key) ?? []), item]);
  }
  return byPull;
}

/** Items no shown row carries: they have no pull request, or theirs is not on the page. */
export function attentionOffRows(items: AttentionItem[], shown: ReadonlySet<string>): AttentionItem[] {
  return items.filter(
    (item) => !item.repo || item.pr === null || !shown.has(pullAttentionKey(item.repo, item.pr))
  );
}
