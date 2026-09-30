// pullDraftModel.ts — the draft lifecycle as pure functions, shared by the
// pull request page and the pull request lists.
//
// A draft says "not yet". It does not merge, no automation reviews it and the
// merge queue will not take it, so the one thing a reader needs from a list is
// which pull requests are drafts and how long each has sat. The transition out
// of a draft is a person's: the author's, or an admin's on their behalf.

import type { PullRequestSummary } from '../api/types';

/** The draft filter a pull request list offers. */
export type PullDraftFilter = 'all' | 'ready' | 'drafts';

export const PULL_DRAFT_FILTERS: readonly PullDraftFilter[] = [
  'all',
  'ready',
  'drafts',
];

const FILTER_LABELS: Record<PullDraftFilter, string> = {
  all: 'All',
  ready: 'Ready',
  drafts: 'Drafts',
};

export function draftFilterLabel(filter: PullDraftFilter): string {
  return FILTER_LABELS[filter];
}

/** `?drafts=` from the URL; anything else reads as the default, All. */
export function parseDraftFilter(value: string | null): PullDraftFilter {
  return PULL_DRAFT_FILTERS.includes(value as PullDraftFilter)
    ? (value as PullDraftFilter)
    : 'all';
}

/**
 * Ready means open and not a draft. A merged or closed pull request is neither
 * ready nor a draft, so only All shows it: the two narrow views answer "what
 * is waiting to be reviewed" and "what is not offered for review yet".
 */
export function filterByDraft<T extends Pick<PullRequestSummary, 'draft' | 'state'>>(
  pulls: readonly T[],
  filter: PullDraftFilter
): T[] {
  if (filter === 'all') return [...pulls];
  if (filter === 'drafts') return pulls.filter((pr) => pr.draft && pr.state === 'open');
  return pulls.filter((pr) => !pr.draft && pr.state === 'open');
}

/** How many of these are open drafts, for the filter's own count. */
export function draftCount(
  pulls: readonly Pick<PullRequestSummary, 'draft' | 'state'>[]
): number {
  return filterByDraft(pulls, 'drafts').length;
}

/**
 * How long a draft has sat, in whole days, or `null` when the timestamp does
 * not parse or lies in the future. Whole days, because the question a stranded
 * draft raises is measured in days, not minutes.
 */
export function draftIdleDays(updatedAt: string, now: number = Date.now()): number | null {
  const then = new Date(updatedAt).getTime();
  if (!Number.isFinite(then)) return null;
  const days = Math.floor((now - then) / 86_400_000);
  return days >= 0 ? days : null;
}

/**
 * The badge a draft row carries: "Draft" on its first day, and after that the
 * idle time too, so a draft nobody has touched says so without being opened.
 */
export function draftBadgeLabel(updatedAt: string, now: number = Date.now()): string {
  const days = draftIdleDays(updatedAt, now);
  if (days === null || days < 1) return 'Draft';
  return `Draft · idle ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Whether the viewer may change this pull request's draft state. The forge
 * allows the author and admins; the client hides a control it knows would be
 * refused and leaves it in place when it cannot tell who is signed in.
 */
export function canChangeDraft(
  summary: Pick<PullRequestSummary, 'author' | 'state'>,
  viewer: { login: string; role: 'admin' | 'user' } | null
): boolean {
  if (summary.state !== 'open') return false;
  if (!viewer) return true;
  if (viewer.role === 'admin') return true;
  const normalize = (value: string): string =>
    value.trim().replace(/^@/, '').toLowerCase();
  return normalize(summary.author) === normalize(viewer.login);
}
