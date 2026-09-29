// pullCloseModel.ts — which of Close / Reopen the pull request page offers,
// and to whom.
//
// A merged pull request has nothing left to settle: its state is history, so
// neither button appears. An open one can be closed; a closed-but-unmerged one
// can be reopened. The forge authorizes every request itself, so the rule here
// only decides what the page shows — a viewer is never offered a button the
// server would refuse: the pull request's author, or a holder of a
// repository-wide write permission (admin / maintainer).

import type { PullRequestDetail } from '../../api/types';

/** The two state transitions the page can ask the forge for. */
export type PullStateAction = 'close' | 'reopen';

/**
 * Global permission keys (§35.1.18) whose holder may settle anyone's pull
 * request in the repository.
 */
const MAINTAINER_PERMISSIONS: readonly string[] = ['repo.admin', 'pr.write'];

export interface PullCloseViewer {
  /** The signed-in login; `null` while the bootstrap is still loading. */
  login: string | null;
  /** The viewer's normalized global permission keys. */
  permissions: readonly string[];
}

/** Logins are written both with and without the `@` sigil; compare the name. */
function sameLogin(a: string, b: string): boolean {
  const bare = (login: string): string =>
    login.trim().replace(/^@/, '').toLowerCase();
  return bare(a) === bare(b) && bare(a).length > 0;
}

/** The author or a repository maintainer may close and reopen. */
export function mayClosePull(
  detail: PullRequestDetail,
  viewer: PullCloseViewer
): boolean {
  if (!viewer.login) return false;
  if (sameLogin(viewer.login, detail.summary.author)) return true;
  return viewer.permissions.some((key) => MAINTAINER_PERMISSIONS.includes(key));
}

/** `null` when the page offers nothing: a merged PR, or a viewer who may not. */
export function pullStateAction(
  detail: PullRequestDetail,
  viewer: PullCloseViewer
): PullStateAction | null {
  if (detail.summary.state === 'merged') return null;
  if (!mayClosePull(detail, viewer)) return null;
  return detail.summary.state === 'closed' ? 'reopen' : 'close';
}

/** The state the forge is asked for, as the GitHub-shaped API spells it. */
export function targetState(action: PullStateAction): 'open' | 'closed' {
  return action === 'close' ? 'closed' : 'open';
}
