// pullTabsModel.ts — the pull request page's tabs: which one a URL is on,
// where each one points, and what each one counts.
//
// One pull request used to be a single three-pane cockpit with everything on
// it at once; Checks and Threads lived below the fold of a 320px scroller.
// Now it is four pages behind one bar — Conversation, Files, Checks, Commits —
// so a new tab is one entry in `PULL_TABS` and a case in `activePullTab`.

import { repoFrontPath } from './repoBrowserModel';

/** The tab bar, in order. Conversation is the pull request's front page. */
export const PULL_TAB_KEYS = [
  'conversation',
  'files',
  'checks',
  'commits',
] as const;

export type PullTabKey = (typeof PULL_TAB_KEYS)[number];

export interface PullTab {
  key: PullTabKey;
  label: string;
  /** Appended to the pull request's base path; empty for Conversation. */
  suffix: string;
}

export const PULL_TABS: readonly PullTab[] = [
  { key: 'conversation', label: 'Conversation', suffix: '' },
  { key: 'files', label: 'Files', suffix: '/files' },
  { key: 'checks', label: 'Checks', suffix: '/checks' },
  { key: 'commits', label: 'Commits', suffix: '/commits' },
];

/** Where the pull request is rooted: `/repos/:provider/:owner/:name/pulls/:n`. */
export function pullBasePath(
  provider: string,
  fullName: string,
  prNumber: string
): string {
  return `${repoFrontPath(provider, fullName)}/pulls/${encodeURIComponent(prNumber)}`;
}

/** Where a tab points for the pull request rooted at `base`. */
export function pullTabHref(base: string, tab: PullTab): string {
  return `${base}${tab.suffix}`;
}

/** Which tab a trailing URL segment is on; anything unknown is Conversation. */
export function activePullTab(segment: string | null): PullTabKey {
  switch (segment) {
    case 'files':
      return 'files';
    case 'checks':
      return 'checks';
    case 'commits':
      return 'commits';
    default:
      return 'conversation';
  }
}

/**
 * Split the repository sub-path tail after `pulls/` into the pull request
 * number and its tab: `"32"` is the Conversation, `"32/files"` the Files tab.
 * A tail with no number at all belongs to the pull request list.
 */
export function parsePullTail(tail: string): {
  prNumber: string | null;
  tab: PullTabKey;
} {
  const segments = tail.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const prNumber = segments[0] ?? null;
  return { prNumber, tab: activePullTab(segments[1] ?? null) };
}

/** Where one file of the diff is read: the Files tab, that file open. */
export function pullFileHref(
  base: string,
  path: string,
  line?: number | null
): string {
  const query = `?path=${encodeURIComponent(path)}`;
  return `${base}/files${query}${line ? `#L${line}` : ''}`;
}

/** A tab's count, or null when it has nothing to count yet. */
export function pullTabCount(
  key: PullTabKey,
  counts: {
    files?: number | null;
    failingChecks?: number | null;
    commits?: number | null;
  }
): number | null {
  const value =
    key === 'files'
      ? counts.files
      : key === 'checks'
        ? counts.failingChecks
        : key === 'commits'
          ? counts.commits
          : null;
  return typeof value === 'number' && value > 0 ? value : null;
}
