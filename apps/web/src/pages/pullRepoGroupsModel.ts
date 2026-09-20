// pullRepoGroupsModel.ts — the Pull requests timeline grouped the way work is
// actually owned: one section per repository, and inside it one row per state
// of the pipeline, least far first.
//
// A repository's pull requests pile up at a handful of states, and between the
// newest change at a state and the older ones there is usually nothing an
// operator needs. So each state shows its FRONTIER — the most recent pull
// request that has got that far — and the rest sit behind one expander. The
// frontier rows read top to bottom as the pipeline itself: still opening,
// waiting on checks, waiting on review, mergeable, merged, then out through
// dev, canary, stable and production.
//
// States are derived, not stored: a pull request's state is the furthest point
// it has reached (see `pullStateOf`), which is what makes "the last one at each
// state" well defined without the server keeping a status column.

import type { PullRequestSummary } from '../api/types';
import type { PipId, ReleaseLadder } from './releaseChannelsModel';

/** Every state a row can sit at, pipeline order: least far first. */
export type PullStateId =
  | 'draft'
  | 'checks'
  | 'review'
  | 'mergeable'
  | 'merged'
  | PipId
  | 'unknown'
  | 'unrecorded'
  | 'closed';

/** The open states, before anything has merged. */
const OPEN_STATES: PullStateId[] = ['draft', 'checks', 'review', 'mergeable'];

/** States after the channels: cannot be placed, then work that will never move. */
const TAIL_STATES: PullStateId[] = ['unknown', 'unrecorded', 'closed'];

export const PULL_STATE_LABELS: Record<string, string> = {
  draft: 'Draft',
  checks: 'Waiting on checks',
  review: 'Waiting on review',
  mergeable: 'Mergeable',
  merged: 'Merged · not yet released',
  dev: 'In dev',
  canary: 'In canary',
  stable: 'In stable',
  production: 'In prod',
  tag: 'Released',
  unknown: 'Merged · release unknown',
  unrecorded: 'Merged · no release recorded',
  closed: 'Closed',
};

/**
 * Why a state exists, where the label alone would leave an operator guessing.
 * The states on the happy path need no explanation; these three do.
 */
export const PULL_STATE_HINTS: Record<string, string> = {
  merged: 'ready for the next release',
  unknown: 'the compare was capped or did not answer',
  unrecorded: 'no deployment and no release tag',
};

export interface TimelineRow {
  pr: PullRequestSummary;
  ladder: ReleaseLadder;
  /** Closed PRs whose change this one carries instead. */
  supersedes: number[];
  /** Set on a closed row that another PR carried: it is folded away. */
  supersededBy: number | null;
}

export interface StateRow {
  state: PullStateId;
  label: string;
  /** One clause on why this state exists, or null for the happy path. */
  hint: string | null;
  /** The most recent pull request at this state. */
  row: TimelineRow;
  /** The rest at the same state, newest first, behind the expander. */
  older: TimelineRow[];
}

export interface RepoGroup {
  /** `owner/name`. */
  repo: string;
  host: string;
  /** Pull requests this group covers, superseded ones excluded. */
  total: number;
  open: number;
  /** One row per state the repository has work at, least far first. */
  states: StateRow[];
  /** How many rows the expanders hold across every state. */
  hidden: number;
}

export interface RepoGroupsOptions {
  ladderFor: (pr: PullRequestSummary) => ReleaseLadder;
  /** Most `older` rows kept per state; the rest are dropped from the page. */
  olderCap?: number;
}

/** Older rows kept per state before the page stops listing them. */
export const OLDER_CAP = 25;

export interface RepoTimeline {
  groups: RepoGroup[];
  /** Merged work that decidedly shipped nowhere: the release manifest. */
  awaitingRelease: number;
}

export function buildRepoGroups(
  pulls: readonly PullRequestSummary[],
  options: RepoGroupsOptions
): RepoTimeline {
  const olderCap = options.olderCap ?? OLDER_CAP;
  const rows: TimelineRow[] = pulls.map((pr) => ({
    pr,
    ladder: options.ladderFor(pr),
    supersedes: [],
    supersededBy: null,
  }));
  linkSupersessions(rows);

  const byRepo = new Map<string, TimelineRow[]>();
  for (const row of rows) {
    // A closed pull request another one carried is a line on its successor.
    if (row.pr.state === 'closed' && row.supersededBy !== null) continue;
    const repo = repoOf(row.pr);
    const existing = byRepo.get(repo);
    if (existing) existing.push(row);
    else byRepo.set(repo, [row]);
  }

  const groups: RepoGroup[] = [];
  let awaitingRelease = 0;
  for (const [repo, members] of byRepo) {
    const grouped = new Map<PullStateId, TimelineRow[]>();
    for (const row of members) {
      const state = pullStateOf(row);
      if (state === 'merged') awaitingRelease += 1;
      const existing = grouped.get(state);
      if (existing) existing.push(row);
      else grouped.set(state, [row]);
    }
    const states: StateRow[] = [];
    let hidden = 0;
    for (const state of stateOrder(members)) {
      const atState = (grouped.get(state) ?? []).sort(newestFirst);
      const [newest, ...older] = atState;
      if (!newest) continue;
      const kept = older.slice(0, olderCap);
      hidden += kept.length;
      states.push({
        state,
        label: PULL_STATE_LABELS[state] ?? state,
        hint: PULL_STATE_HINTS[state] ?? null,
        row: newest,
        older: kept,
      });
    }
    groups.push({
      repo,
      host: members[0]?.pr.repo.host ?? 'jeryu',
      total: members.length,
      open: members.filter((row) => row.pr.state === 'open').length,
      states,
      hidden,
    });
  }
  return { groups: groups.sort(byNewestActivity), awaitingRelease };
}

/**
 * The furthest point a pull request has reached. Merged work is placed by its
 * release ladder, so "the last one at each state" means the newest change at
 * each rung — including the rungs past the merge.
 */
export function pullStateOf(row: TimelineRow): PullStateId {
  const { pr, ladder } = row;
  if (pr.state === 'closed') return 'closed';
  if (pr.state === 'merged') {
    if (ladder.kind === 'none') return 'unrecorded';
    if (ladder.furthest) return ladder.furthest;
    return ladder.uncertain ? 'unknown' : 'merged';
  }
  if (pr.draft) return 'draft';
  if (pr.checks.total === 0 || pr.checks.failing > 0 || pr.checks.pending > 0) return 'checks';
  const { approvals, required_approvals, changes_requested } = pr.review;
  if (changes_requested > 0 || approvals < Math.max(required_approvals, 1)) return 'review';
  return 'mergeable';
}

/** Open states, then the channels this repository reports, then the tail. */
function stateOrder(rows: readonly TimelineRow[]): PullStateId[] {
  return [...OPEN_STATES, 'merged', ...channelsPresent(rows), ...TAIL_STATES];
}

/** Pip ids in ladder order (shallowest first), as the repository reports them. */
function channelsPresent(rows: readonly TimelineRow[]): PipId[] {
  const seen: PipId[] = [];
  for (const row of rows) {
    for (const pip of row.ladder.pips) {
      if (!seen.includes(pip.id)) seen.push(pip.id);
    }
  }
  return seen;
}

/** The release carrying a row at its deepest channel, for the state's summary. */
export function stateRelease(stateRow: StateRow): string | null {
  return stateRow.row.ladder.release;
}

/**
 * `In canary · v8`, or just the label. Only a state past the merge has a
 * release to name, and there the release is the new information — the label
 * already says which channel.
 */
export function stateHeading(stateRow: StateRow): string {
  const release = stateRelease(stateRow);
  return release ? `${stateRow.label} · ${release}` : stateRow.label;
}

export function repoOf(pr: PullRequestSummary): string {
  return `${pr.repo.owner}/${pr.repo.name}`;
}

/**
 * How many merged PRs have shipped nowhere yet, across every repository: the
 * release manifest's size, for the one-line summary above the timeline.
 */
export function awaitingReleaseCount(
  pulls: readonly PullRequestSummary[],
  ladderFor: (pr: PullRequestSummary) => ReleaseLadder
): number {
  return pulls.filter((pr) => {
    if (pr.state !== 'merged') return false;
    const ladder = ladderFor(pr);
    return ladder.kind !== 'none' && !ladder.furthest && !ladder.uncertain;
  }).length;
}

/**
 * A closed pull request whose change another one carries: either it says so
 * (`superseded by #12`, in a label or the title — what the shift driver and
 * pr-redteam can write mechanically), or a merged PR has the very same head
 * sha, which means the branch landed under a different number.
 */
export function linkSupersessions(rows: TimelineRow[]): void {
  const byNumber = new Map(rows.map((row) => [row.pr.number, row]));
  const mergedBySha = new Map<string, TimelineRow>();
  for (const row of rows) {
    if (row.pr.state === 'merged') mergedBySha.set(row.pr.head_sha, row);
  }
  for (const row of rows) {
    if (row.pr.state !== 'closed') continue;
    const declared = declaredSuccessor(row.pr);
    const successor =
      (declared !== null ? byNumber.get(declared) : undefined) ??
      mergedBySha.get(row.pr.head_sha) ??
      null;
    // Only a merged successor folds a closed row away: pointing at another
    // closed PR would hide both.
    if (!successor || successor.pr.state !== 'merged' || successor.pr.number === row.pr.number) {
      continue;
    }
    row.supersededBy = successor.pr.number;
    successor.supersedes.push(row.pr.number);
  }
  for (const row of rows) row.supersedes.sort((a, b) => a - b);
}

const SUPERSEDED_BY = /supersed(?:ed|es)\s*(?:by)?\s*#(\d+)/i;

function declaredSuccessor(pr: PullRequestSummary): number | null {
  for (const text of [pr.title, ...(pr.labels ?? [])]) {
    const match = SUPERSEDED_BY.exec(text ?? '');
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

/** Newest activity first; a tie falls back to the higher number. */
function newestFirst(a: TimelineRow, b: TimelineRow): number {
  return b.pr.updated_at.localeCompare(a.pr.updated_at) || b.pr.number - a.pr.number;
}

/** The repository something happened in most recently leads the page. */
function byNewestActivity(a: RepoGroup, b: RepoGroup): number {
  return lastActivity(b).localeCompare(lastActivity(a)) || a.repo.localeCompare(b.repo);
}

function lastActivity(group: RepoGroup): string {
  let newest = '';
  for (const state of group.states) {
    for (const row of [state.row, ...state.older]) {
      if (row.pr.updated_at > newest) newest = row.pr.updated_at;
    }
  }
  return newest;
}
