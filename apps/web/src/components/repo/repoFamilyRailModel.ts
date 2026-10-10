// repoFamilyRailModel.ts — what the family rail needs to know, without React.
//
// The rail stands on the left of every repository page whose repository
// carries a family: the family's rollup on top, its member repositories under
// it. The decisions here are the whole of its behaviour — which member leads,
// where a member link points, which member Alt+Up and Alt+Down move to, and
// which of the three widths the shell is at — so each one is unit-tested
// without a browser.

import type { RepositorySummary } from '../../api/types';
import { repoUrl } from '../../pages/repoBrowserModel';
import { REPO_TABS, type RepoTabKey } from '../../pages/repoShellModel';

import { portalRank } from './familyRollup';

/** Where the rail's open/closed choice is remembered (storage adapter, durable). */
export const FAMILY_RAIL_KEY = 'jeryu.repoFamilyRail.v1';

/** At or above this width the rail is always there; below it, it is a toggle. */
export const FAMILY_RAIL_FULL_WIDTH = 1280;

/** Below this width there is no room for a rail: the header carries a select. */
export const FAMILY_RAIL_SELECT_WIDTH = 720;

/**
 * How the family is offered at this width: the rail itself, a toggle that
 * shows and hides it, or a select in the header.
 */
export type FamilyRailTier = 'rail' | 'toggle' | 'select';

export function familyRailTier(width: number): FamilyRailTier {
  if (width < FAMILY_RAIL_SELECT_WIDTH) return 'select';
  return width >= FAMILY_RAIL_FULL_WIDTH ? 'rail' : 'toggle';
}

/**
 * The family's members in rail order: the repository the family publishes
 * from leads (the forge says which, `repo_role`), then the rest by name.
 */
export function sortFamilyMembers(
  repos: readonly RepositorySummary[]
): RepositorySummary[] {
  return [...repos].sort(
    (a, b) => portalRank(a) - portalRank(b) || a.id.name.localeCompare(b.id.name)
  );
}

/**
 * Where a member of the family goes while the reader is on `tab`: the same tab
 * of that repository, so a switch from one family member's pull requests lands
 * on the next one's. The Code tab's deeper addresses — a file, a folder — name
 * something only the repository being left has, so they drop to the front page.
 */
export function familyMemberHref(repo: RepositorySummary, tab: RepoTabKey): string {
  const suffix = REPO_TABS.find((entry) => entry.key === tab)?.suffix ?? '';
  return `${repoUrl(repo.id)}${suffix}`;
}

/**
 * The member Alt+Up (`-1`) and Alt+Down (`+1`) move to, or null when the
 * family has nowhere to move. The ends wrap, as the tab bar's arrows do.
 */
export function neighbourMember(
  repos: readonly RepositorySummary[],
  currentRepoId: string | null,
  step: -1 | 1
): RepositorySummary | null {
  if (repos.length < 2) return null;
  const index = repos.findIndex((repo) => repo.id.id === currentRepoId);
  if (index === -1) return repos[0] ?? null;
  const next = (index + step + repos.length) % repos.length;
  return repos[next] ?? null;
}

/** "2 open" / "no open pull requests": what a member row says about its PRs. */
export function memberPullsLabel(count: number): string {
  if (count <= 0) return 'no open pull requests';
  return `${count} open pull request${count === 1 ? '' : 's'}`;
}
