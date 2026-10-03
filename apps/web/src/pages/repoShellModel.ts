// repoShellModel.ts — the repository shell's tabs: which one a URL is on,
// where each one points, and who may see Settings.
//
// Every repository sub-page is drawn inside one shell (components/repo/
// RepoLayout): one header naming the repository, then this tab bar. The
// functions here are the whole of its routing knowledge, so a new tab is one
// entry in `REPO_TABS` and a case in `activeRepoTab`.

/** The tab bar, in order. */
export const REPO_TAB_KEYS = [
  'code',
  'pulls',
  'automation',
  'agents',
  'activity',
  'settings',
] as const;

export type RepoTabKey = (typeof REPO_TAB_KEYS)[number];

export interface RepoTab {
  key: RepoTabKey;
  label: string;
  /** Appended to the repository base path; empty for Code, the front page. */
  suffix: string;
  /** Only an administrator or a writer sees this tab. */
  writersOnly?: boolean;
}

export const REPO_TABS: readonly RepoTab[] = [
  { key: 'code', label: 'Code', suffix: '' },
  { key: 'pulls', label: 'Pull requests', suffix: '/pulls' },
  { key: 'automation', label: 'Automation', suffix: '/automation' },
  { key: 'agents', label: 'Agents', suffix: '/agents' },
  { key: 'activity', label: 'Activity', suffix: '/activity' },
  { key: 'settings', label: 'Settings', suffix: '/settings', writersOnly: true },
];

/** Where a tab points for the repository rooted at `base`. */
export function repoTabHref(base: string, tab: RepoTab): string {
  return `${base}${tab.suffix}`;
}

/** Which tab the sub-path of a repository URL is on.
 *
 *  Code owns the front page and every route that reads the tree: a blob, a
 *  folder and a commit are all "the code at a ref".
 */
export function activeRepoTab(subPath: string | null): RepoTabKey {
  switch (subPath) {
    case 'pulls':
      return 'pulls';
    case 'automation':
      return 'automation';
    case 'agents':
      return 'agents';
    case 'activity':
      return 'activity';
    case 'settings':
      return 'settings';
    default:
      return 'code';
  }
}

/** Settings changes the repository, so only an administrator or a writer sees it. */
export function canSeeRepoSettings(
  role: string | null | undefined,
  permissions: readonly string[] = []
): boolean {
  if (role === 'admin') return true;
  return permissions.includes('repo.admin') || permissions.includes('code.write');
}

/** The tabs this viewer may see. */
export function visibleRepoTabs(canSeeSettings: boolean): readonly RepoTab[] {
  return REPO_TABS.filter((tab) => canSeeSettings || !tab.writersOnly);
}

/** A tab's count, or null when the tab carries none. */
export function repoTabCount(
  key: RepoTabKey,
  counts: { openPullRequests?: number | null; activeAgents?: number | null }
): number | null {
  const value =
    key === 'pulls'
      ? counts.openPullRequests
      : key === 'agents'
        ? counts.activeAgents
        : null;
  return typeof value === 'number' && value > 0 ? value : null;
}

/** Where arrow keys move from `index` in a bar of `length` tabs; it wraps. */
export function rovingIndex(index: number, length: number, key: string): number | null {
  if (length === 0) return null;
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % length;
    case 'ArrowLeft':
      return (index - 1 + length) % length;
    case 'Home':
      return 0;
    case 'End':
      return length - 1;
    default:
      return null;
  }
}
