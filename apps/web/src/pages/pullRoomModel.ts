import type {
  ControlPullRequest,
  EvidenceState,
  PullRequestSummary,
} from '../api/types';

export type CheckPosture =
  | 'missing'
  | 'failing'
  | 'running'
  | 'queued'
  | 'passing';

export type PullLaneId =
  | 'missing_checks'
  | 'failing_checks'
  | 'queued_running_checks'
  | 'ready_reviewable'
  | 'merged_closed';

export interface PullRoomFilters {
  repo: string;
  state: string;
  evidence: string;
  checkPosture: string;
  search: string;
}

export interface PullListItem {
  repo: string;
  repoHost: string;
  repoId: string | null;
  number: number;
  title: string;
  author: string | null;
  draft: boolean;
  state: string;
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
  mergeable: boolean;
  mergeableState: string;
  changedFileCount: number;
  evidenceState: EvidenceState;
  checkPosture: CheckPosture;
  checks: {
    total: number;
    queued: number;
    running: number;
    failing: number;
    successful: number;
    missing: boolean;
  };
  url: string;
  updatedAt: string | null;
}

export interface PullLane {
  id: PullLaneId;
  title: string;
  items: PullListItem[];
}

/** State filter value that hides merged and closed PRs. */
export const ACTIVE_STATE_FILTER = 'active';

export const DEFAULT_PULL_ROOM_FILTERS: PullRoomFilters = {
  repo: 'all',
  state: ACTIVE_STATE_FILTER,
  evidence: 'all',
  checkPosture: 'all',
  search: '',
};

export const PULL_LANE_TITLES: Record<PullLaneId, string> = {
  missing_checks: 'Missing checks',
  failing_checks: 'Failing checks',
  queued_running_checks: 'Queued / running',
  ready_reviewable: 'Ready / reviewable',
  merged_closed: 'Merged / closed',
};

const LANE_ORDER: PullLaneId[] = [
  'missing_checks',
  'failing_checks',
  'queued_running_checks',
  'ready_reviewable',
  'merged_closed',
];

export function fromControlPullRequest(pr: ControlPullRequest): PullListItem {
  return {
    repo: pr.repo,
    repoHost: 'jeryu',
    repoId: null,
    number: pr.number,
    title: pr.title,
    author: pr.author || null,
    draft: pr.draft,
    state: pr.state,
    headRef: pr.headRef,
    headSha: pr.headSha,
    baseRef: pr.baseRef,
    baseSha: pr.baseSha,
    mergeable: pr.mergeable,
    mergeableState: pr.mergeableState,
    changedFileCount: pr.changedFiles.length,
    evidenceState: pr.stateEvidence,
    checkPosture: checkPosture(pr.checks),
    checks: pr.checks,
    url: pullRequestPath('jeryu', pr.repo, pr.number),
    updatedAt: null,
  };
}

export function fromPullRequestSummary(pr: PullRequestSummary): PullListItem {
  const repo = `${pr.repo.owner}/${pr.repo.name}`;
  const checks = {
    total: pr.checks.total,
    queued: 0,
    running: pr.checks.pending,
    failing: pr.checks.failing,
    successful: pr.checks.passing,
    missing: pr.checks.total === 0,
  };
  return {
    repo,
    repoHost: pr.repo.host,
    repoId: pr.repo.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    draft: pr.draft,
    state: pr.state,
    headRef: pr.head_ref,
    headSha: pr.head_sha,
    baseRef: pr.base_ref,
    baseSha: pr.base_sha,
    mergeable: pr.mergeable.can_merge,
    mergeableState: pr.mergeable.level,
    changedFileCount: 0,
    evidenceState: pr.checks.total === 0 ? 'missing' : 'fresh',
    checkPosture: checkPosture(checks),
    checks,
    url: pullRequestPath(pr.repo.host, repo, pr.number),
    updatedAt: pr.updated_at,
  };
}

export function checkPosture(item: PullListItem['checks']): CheckPosture {
  if (item.missing || item.total === 0) return 'missing';
  if (item.failing > 0) return 'failing';
  if (item.running > 0) return 'running';
  if (item.queued > 0) return 'queued';
  return 'passing';
}

export function filterPullRequests(
  items: PullListItem[],
  filters: PullRoomFilters
): PullListItem[] {
  const needle = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.repo !== 'all' && item.repo !== filters.repo) return false;
    if (filters.state === ACTIVE_STATE_FILTER) {
      if (isFinished(item)) return false;
    } else if (filters.state !== 'all' && item.state !== filters.state) {
      return false;
    }
    if (
      filters.evidence !== 'all' &&
      item.evidenceState !== filters.evidence
    ) {
      return false;
    }
    if (
      filters.checkPosture !== 'all' &&
      item.checkPosture !== filters.checkPosture
    ) {
      return false;
    }
    if (!needle) return true;
    return [
      item.repo,
      String(item.number),
      item.title,
      item.headRef,
      item.baseRef,
      item.headSha,
      item.author ?? '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });
}

export function isFinished(item: PullListItem): boolean {
  return item.state === 'merged' || item.state === 'closed';
}

/**
 * Header counts over PRs that are still in flight. The snapshot summary
 * counts every PR it knows about, merged and closed included, and every
 * failing check run, so it cannot answer "how many are open".
 */
export function pullRoomCounts(items: PullListItem[]): {
  open: number;
  missingChecks: number;
  failingChecks: number;
} {
  const active = items.filter((item) => !isFinished(item));
  return {
    open: active.length,
    missingChecks: active.filter((item) => item.checkPosture === 'missing').length,
    failingChecks: active.filter((item) => item.checkPosture === 'failing').length,
  };
}

export function laneForPullRequest(item: PullListItem): PullLaneId {
  if (isFinished(item)) {
    return 'merged_closed';
  }
  if (item.checkPosture === 'missing') return 'missing_checks';
  if (item.checkPosture === 'failing') return 'failing_checks';
  if (item.checkPosture === 'queued' || item.checkPosture === 'running') {
    return 'queued_running_checks';
  }
  return 'ready_reviewable';
}

export function groupPullRequests(items: PullListItem[]): PullLane[] {
  const grouped = new Map<PullLaneId, PullListItem[]>(
    LANE_ORDER.map((lane) => [lane, []])
  );
  for (const item of items) {
    grouped.get(laneForPullRequest(item))?.push(item);
  }
  return LANE_ORDER.map((id) => ({
    id,
    title: PULL_LANE_TITLES[id],
    items: grouped.get(id) ?? [],
  }));
}

export function repoOptions(items: PullListItem[]): string[] {
  return Array.from(new Set(items.map((item) => item.repo))).sort();
}

/** Lanes that hold something; an empty lane is a header over nothing. */
export function visibleLanes(lanes: PullLane[]): PullLane[] {
  return lanes.filter((lane) => lane.items.length > 0);
}

/** A full or short commit sha, or null for the placeholders the snapshot may carry. */
export function knownSha(sha: string | null | undefined): string | null {
  return sha && /^[0-9a-f]{7,64}$/i.test(sha) ? sha.slice(0, 8) : null;
}

/**
 * One chip per fact. The snapshot's `state` is already `mergeable` for a PR
 * that can merge, so the merge chip is only added when it says something new,
 * and evidence is only named when it is a problem.
 */
/**
 * The forge's pull request states, in words. The API sends them as one
 * lowercase token ("blockedbychecks"); anything not listed is shown as sent.
 */
const STATE_WORDS: Record<string, string> = {
  mergeable: 'can merge',
  blockedbychecks: 'waiting on checks',
  blockedbyreview: 'waiting on review',
  blockedbyreviews: 'waiting on review',
  blockedbyconflict: 'has conflicts',
  blockedbyconflicts: 'has conflicts',
  blocked: 'blocked',
  open: 'open',
  draft: 'draft',
  merged: 'merged',
  closed: 'closed',
};

/** One state token in words; an unlisted one passes through. */
export function stateWords(state: string): string {
  return STATE_WORDS[state.toLowerCase().replace(/[^a-z]/g, '')] ?? state;
}

export function cardFacts(item: PullListItem): string[] {
  const state = stateWords(item.draft ? 'draft' : item.state);
  const facts = [state, `checks ${item.checkPosture}`];
  // The merge state repeats the state for most pull requests; say it only when
  // it adds something ("can merge" beside "open").
  const merge = item.mergeable ? 'can merge' : stateWords(item.mergeableState);
  if (merge !== 'blocked' || state === 'open') facts.push(merge);
  if (item.changedFileCount > 0) {
    facts.push(`${item.changedFileCount} ${item.changedFileCount === 1 ? 'file' : 'files'}`);
  }
  if (item.evidenceState === 'failed') facts.push('jankurai proof failing');
  if (item.evidenceState === 'missing') facts.push('no jankurai proof');
  return Array.from(new Set(facts.filter((fact) => fact && fact !== 'unknown')));
}

/** Pull Room filtered to one repo (`owner/name`). */
export function pullRoomHref(repo: string): string {
  return `/pull-room?repo=${encodeURIComponent(repo)}`;
}

/** Pull Room scoped to the repos of one family. */
export function pullRoomFamilyHref(family: string): string {
  return `/pull-room?family=${encodeURIComponent(family)}`;
}

/** Keep only PRs whose repo (`owner/name`) is in `repos`; `null` keeps all. */
export function scopeToRepos(
  items: PullListItem[],
  repos: ReadonlySet<string> | null
): PullListItem[] {
  return repos ? items.filter((item) => repos.has(item.repo)) : items;
}

/**
 * The one spelling of a pull request's page: `/repos/<host>/<owner>/<name>/pulls/<n>`.
 * Encoding the whole `owner/name` turned its slash into `%2F`, a second URL for
 * the same page that the nav and breadcrumbs did not recognise.
 */
export function pullRequestPath(host: string, fullName: string, number: number): string {
  const name = fullName.split('/').map(encodeURIComponent).join('/');
  return `/repos/${encodeURIComponent(host)}/${name}/pulls/${number}`;
}

/** `?view=` values that mean the lane board (`queue` is its older name). */
export function isBoardView(view: string | null): boolean {
  return view === 'board' || view === 'queue';
}

/**
 * What a reader calls a family: the repositories list says `jeryu-split`, the
 * shift queue and Needs you say `jeryu`. One name on every page; the URL keeps
 * the forge's own key so existing `?family=jeryu-split` links still work.
 */
export function familyLabel(family: string): string {
  return family.replace(/-split$/, '');
}

/** Family of repos the forge assigns no family to. */
export const OTHER_FAMILY = 'other';

/** The family a repo (`owner/name`) belongs to; unknown or unassigned is "other". */
export function familyOfRepo(
  repo: string,
  families: ReadonlyMap<string, string | null>
): string {
  return families.get(repo) || OTHER_FAMILY;
}

/** Keep the pull requests of one family; an empty family keeps them all. */
export function scopeToFamily(
  items: PullListItem[],
  family: string,
  families: ReadonlyMap<string, string | null>
): PullListItem[] {
  return family ? items.filter((item) => familyOfRepo(item.repo, families) === family) : items;
}

export interface FamilyPill {
  family: string;
  count: number;
}

/**
 * One pill per family that has a pull request in flight, with its count,
 * alphabetical with "other" last. Merged and closed ones do not make a pill.
 */
export function familyPills(
  items: PullListItem[],
  families: ReadonlyMap<string, string | null>
): FamilyPill[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (isFinished(item)) continue;
    const family = familyOfRepo(item.repo, families);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return Array.from(counts, ([family, count]) => ({ family, count })).sort((a, b) => {
    if (a.family === OTHER_FAMILY) return 1;
    if (b.family === OTHER_FAMILY) return -1;
    return a.family.localeCompare(b.family);
  });
}

/** The most repos the timeline loads at once; the rest are named, not fetched. */
export const TIMELINE_REPO_LIMIT = 24;

/**
 * The repos whose pull request lists the timeline needs: the snapshot says
 * which repos hold a pull request that passes the filters, so only those are
 * asked for their lists.
 */
export function reposToLoad(items: PullListItem[]): { repos: string[]; skipped: number } {
  const repos = repoOptions(items);
  return {
    repos: repos.slice(0, TIMELINE_REPO_LIMIT),
    skipped: Math.max(0, repos.length - TIMELINE_REPO_LIMIT),
  };
}

/**
 * The repos the timeline reads, the way one repository's Pull requests page
 * reads its own: every repository in scope, not only the ones the snapshot
 * names. The snapshot holds open pull requests only, so a history view built
 * from it alone is empty whenever nothing is open. `history` false keeps the
 * snapshot's answer, which is already right for open-only filters.
 */
export function timelineRepos(
  snapshotItems: PullListItem[],
  known: string[],
  scope: { repo: string; family: string; history: boolean },
  families: ReadonlyMap<string, string | null>
): { repos: string[]; skipped: number } {
  const all = new Set(repoOptions(snapshotItems));
  if (scope.history) {
    for (const repo of known) {
      if (scope.repo !== 'all' && repo !== scope.repo) continue;
      if (scope.family && familyOfRepo(repo, families) !== scope.family) continue;
      all.add(repo);
    }
  }
  const repos = Array.from(all).sort();
  return {
    repos: repos.slice(0, TIMELINE_REPO_LIMIT),
    skipped: Math.max(0, repos.length - TIMELINE_REPO_LIMIT),
  };
}

/** `state` for the per-repo list: only open ones unless the filter asks for finished ones. */
export function pullListState(stateFilter: string): 'open' | undefined {
  return stateFilter === 'all' || stateFilter === 'merged' || stateFilter === 'closed'
    ? undefined
    : 'open';
}

/** The summaries that pass the page's filters, judged as the board judges its cards. */
export function filterPullSummaries(
  pulls: PullRequestSummary[],
  filters: PullRoomFilters
): PullRequestSummary[] {
  // The snapshot calls an open pull request by its merge state ("mergeable",
  // "blockedbychecks"); the list calls it "open". A state filter other than the
  // finished ones was already applied when the repos were chosen.
  const relaxed =
    filters.state === 'merged' || filters.state === 'closed' || filters.state === 'all'
      ? filters
      : { ...filters, state: ACTIVE_STATE_FILTER };
  return pulls.filter(
    (pr) =>
      (filters.state !== 'draft' || pr.draft) &&
      filterPullRequests([fromPullRequestSummary(pr)], relaxed).length === 1
  );
}

