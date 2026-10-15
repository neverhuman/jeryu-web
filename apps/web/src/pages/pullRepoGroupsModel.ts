// pullRepoGroupsModel.ts — the In flight timeline grouped the way work is
// actually owned: one section per repository, and inside it ONE list of rows.
//
// A row is a branch in flight: either shift work that has reached a branch but
// not yet a pull request, or a pull request. Both sit on the same track —
// Branch, then the PR's stages — so the list reads top to bottom from work
// furthest from done to work already shipped, with no headings between states.
// Rows that only a release will move are not listed one by one: the newest
// merged-not-released PR stands for the rest, and the newest PR each
// environment runs stands for everything below it (history is linear). The
// rest folds into one "History" at the bottom.
//
// States are derived, not stored: a pull request's state is the furthest point
// it has reached (see `pullStateOf`).

import { DEFAULT_FORGE_HOST } from '../hooks/useForgeHost';
import { compareInstants } from '../format/when';
import type { PullReplacement, PullRequestSummary, PullSummaryRow } from '../api/types';
import type { GhostGroup, GhostRow } from './pullGhostsModel';
import { queueHref } from './shift/workPaths';
import { ladderCapped, ladderUndecided, type PipId, type ReleaseLadder } from './releaseChannelsModel';

/** Every state a row can sit at, pipeline order: least far first. */
export type PullStateId =
  | 'draft'
  | 'checks'
  | 'review'
  | 'mergeable'
  | 'merged'
  | PipId
  | 'capped'
  | 'unknown'
  | 'unrecorded'
  | 'closed';

/** The open states, before anything has merged. */
const OPEN_STATES: PullStateId[] = ['draft', 'checks', 'review', 'mergeable'];

/** Merged, but in no environment the page knows of: they wait together. */
const WAITING_STATES: PullStateId[] = ['merged', 'capped', 'unknown', 'unrecorded'];

/** States after the channels: cannot be placed, then work that will never move. */
const TAIL_STATES: PullStateId[] = ['capped', 'unknown', 'unrecorded', 'closed'];

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
  capped: 'Merged · past the compare cap',
  unknown: 'Merged · release unknown',
  unrecorded: 'Merged · no release recorded',
  closed: 'Closed',
};

/**
 * Why a state exists, where the label alone would leave an operator guessing:
 * the row's status carries it as a tooltip. The happy path needs none.
 */
export const PULL_STATE_HINTS: Record<string, string> = {
  merged: 'ready for the next release',
  capped: 'the last release is more commits behind than one compare lists',
  unknown: 'the compare did not answer',
  unrecorded: 'no deployment and no release tag',
};

/**
 * Why this row sits where it does. An undecided release names the compare the
 * row gave up on ("prod v2.3 compare capped"), so the operator knows which
 * release to go and look at rather than only that something was unknown.
 */
export function pullRowHint(row: PullRow): string | undefined {
  if (row.state === 'capped') {
    const behind = ladderCapped(row.row.ladder);
    if (behind) return behind;
  }
  if (row.state === 'unknown') {
    const gaveUp = ladderUndecided(row.row.ladder);
    if (gaveUp) return gaveUp;
  }
  return PULL_STATE_HINTS[row.state];
}

export interface TimelineRow {
  pr: PullSummaryRow;
  ladder: ReleaseLadder;
  /** Closed PRs whose change this one carries instead. */
  supersedes: number[];
  /** Set on a closed row that another PR carried: it is folded away. */
  supersededBy: number | null;
}

/** A shift branch's rolled-up state: someone is working, it waits on a PR, or it is stuck. */
export type BranchStatus = 'active' | 'done' | 'blocked';

/**
 * Shift work that has reached a branch but not a pull request: one row per
 * branch, carrying the todos on it. A todo lands on its shift's branch
 * (`nightshift/2026-09-21`), or on the family's batch branch when unscheduled.
 * Todos still queued are the Work page's; they never make a row here.
 */
export interface BranchRow {
  kind: 'branch';
  /** `nightshift/2026-09-21`, or `batch` for unscheduled work. */
  key: string;
  label: string;
  todos: GhostRow[];
  status: BranchStatus;
  /** One clause for the Branch column: "2 working", "1 needs a human". */
  detail: string;
}

export interface PullRow {
  kind: 'pr';
  row: TimelineRow;
  state: PullStateId;
  /**
   * The newest row at a state only a release moves (merged, or an
   * environment): it stands for the rest, and carries the environment's pill.
   */
  frontier: boolean;
  /** On a not-yet-released frontier: how many more merged PRs wait with it. */
  alsoWaiting: number;
  /**
   * The closed pull requests this one replaced, newest first: they are folded
   * under this row rather than hidden, so a reader of the graph can follow the
   * work from the pull request that was closed to the one that carries it.
   */
  replaced: TimelineRow[];
}

/** A repository's rows in one list: branches, then pull requests from least far to shipped. */
export type FlowRow = BranchRow | PullRow;

export interface RepoCounts {
  inFlight: number;
  awaitingRelease: number;
  released: number;
  /** Merged, but where it shipped is unknown or never recorded. */
  releaseUnknown: number;
  /** Merged, and the last release is further back than one compare reaches. */
  pastCompareCap: number;
  closed: number;
}

export interface RepoGroup {
  /** `owner/name`. */
  repo: string;
  host: string;
  /** In flight, plus one row per state only a release moves. */
  rows: FlowRow[];
  /** Everything those rows stand for, and closed work: the History expander. */
  older: FlowRow[];
  counts: RepoCounts;
}

export interface RepoGroupsOptions {
  ladderFor: (pr: PullRequestSummary) => ReleaseLadder;
  /** Most rows a repository lists at all; the rest are dropped from the page. */
  rowLimit?: number;
  /** Shift work with no pull request yet, to file under the repos it names. */
  ghosts?: readonly GhostGroup[];
  /**
   * A todo names repos bare (`acme-web`); a section is keyed `owner/name`.
   * Return null for a name this page cannot place, and its rows land in
   * `unassigned` rather than being dropped.
   */
  repoKeyFor?: (repo: string) => string | null;
}

/** Rows a repository lists at all. */
export const ROW_LIMIT = 60;

export interface RepoTimeline {
  groups: RepoGroup[];
  /** Merged work that decidedly shipped nowhere: the release manifest. */
  awaitingRelease: number;
  /** Branch rows whose todos name no repository this page can place. */
  unassigned: BranchRow[];
  /** The queue itself is cross-repo, so it is said once, above the sections. */
  shift: { inFlight: number; queued: number; family: string | null } | null;
}

export function buildRepoGroups(
  pulls: readonly PullSummaryRow[],
  options: RepoGroupsOptions
): RepoTimeline {
  const rowLimit = options.rowLimit ?? ROW_LIMIT;
  const rows: TimelineRow[] = pulls.map((pr) => ({
    pr,
    ladder: options.ladderFor(pr),
    supersedes: [],
    supersededBy: null,
  }));
  linkSupersessions(rows);

  const pullsByRepo = new Map<string, PullRow[]>();
  // Numbers repeat across repositories, so a row is keyed by both.
  const byNumber = new Map<string, PullRow>();
  const folded: TimelineRow[] = [];
  let awaitingRelease = 0;
  for (const row of rows) {
    // A closed pull request another one carried is folded under its successor,
    // not listed on its own and not dropped: the replacement row carries it.
    if (row.pr.state === 'closed' && row.supersededBy !== null) {
      folded.push(row);
      continue;
    }
    const state = pullStateOf(row);
    if (state === 'merged') awaitingRelease += 1;
    const repo = repoOf(row.pr);
    const list = pullsByRepo.get(repo) ?? [];
    const pullRow: PullRow = {
      kind: 'pr',
      row,
      state,
      frontier: false,
      alsoWaiting: 0,
      replaced: [],
    };
    list.push(pullRow);
    byNumber.set(`${repo}#${row.pr.number}`, pullRow);
    pullsByRepo.set(repo, list);
  }
  for (const row of folded) {
    const successor =
      row.supersededBy === null
        ? undefined
        : byNumber.get(`${repoOf(row.pr)}#${row.supersededBy}`);
    successor?.replaced.push(row);
  }
  for (const successor of byNumber.values()) successor.replaced.sort(newestFirst);

  const { branchesByRepo, unassigned, shift } = fileGhosts(options);
  const repos = new Set([...pullsByRepo.keys(), ...branchesByRepo.keys()]);
  const groups: RepoGroup[] = [];
  for (const repo of repos) {
    const prs = pullsByRepo.get(repo) ?? [];
    const branches = branchesByRepo.get(repo) ?? [];
    const order = stateOrder(prs.map((row) => row.row));
    const all: FlowRow[] = [...branches, ...prs]
      .sort((a, b) => compareFlow(a, b, order))
      .slice(0, rowLimit);
    const { rows: shown, older } = foldSettled(all);
    groups.push({
      repo,
      host: prs[0]?.row.pr.repo.host ?? DEFAULT_FORGE_HOST,
      rows: shown,
      older,
      counts: countRows(branches, prs),
    });
  }
  return {
    groups: groups.sort(byNewestActivity),
    awaitingRelease,
    unassigned,
    shift,
  };
}

/**
 * What stays in view: every row that can still move on its own (a branch, an
 * open pull request), and ONE row for each state that only a release moves —
 * the newest merged-not-released PR, and the newest PR each environment runs.
 * History is linear, so an environment's newest PR stands for everything
 * merged before it; the rest, and closed work, fold into history.
 */
function foldSettled(all: FlowRow[]): { rows: FlowRow[]; older: FlowRow[] } {
  const rows: FlowRow[] = [];
  const older: FlowRow[] = [];
  const lead = new Map<PullStateId, PullRow>();
  for (const row of all) {
    if (row.kind === 'branch' || OPEN_STATES.includes(row.state)) {
      rows.push(row);
      continue;
    }
    const first = lead.get(row.state);
    if (row.state === 'closed' || first) {
      if (first && WAITING_STATES.includes(row.state)) first.alsoWaiting += 1;
      older.push(row);
      continue;
    }
    row.frontier = true;
    lead.set(row.state, row);
    rows.push(row);
  }
  return { rows, older };
}

function countRows(branches: BranchRow[], prs: PullRow[]): RepoCounts {
  const open = prs.filter((row) => OPEN_STATES.includes(row.state)).length;
  const closed = prs.filter((row) => row.state === 'closed').length;
  const awaiting = prs.filter((row) => row.state === 'merged').length;
  // Merged work the page cannot place is not "released": saying so would be a
  // claim about a release this repository may not record.
  const unplaced = prs.filter((row) => row.state === 'unknown' || row.state === 'unrecorded').length;
  // A capped compare says how far behind the release is, so these are counted
  // apart from the ones nothing is known about.
  const capped = prs.filter((row) => row.state === 'capped').length;
  return {
    inFlight: branches.length + open,
    awaitingRelease: awaiting,
    released: prs.length - open - closed - awaiting - unplaced - capped,
    releaseUnknown: unplaced,
    pastCompareCap: capped,
    closed,
  };
}

/** Which page answers a part of the counts line: Work, Releases, or the History fold. */
export type CountTarget = 'work' | 'releases' | 'history';

export interface CountPart {
  text: string;
  target: CountTarget;
}

/** The counts line's parts, zero parts left out, each with the page that owns it. */
export function countParts(counts: RepoCounts): CountPart[] {
  const parts: CountPart[] = [];
  if (counts.inFlight > 0) parts.push({ text: `${counts.inFlight} in flight`, target: 'work' });
  if (counts.awaitingRelease > 0) {
    parts.push({ text: `${counts.awaitingRelease} awaiting release`, target: 'releases' });
  }
  if (counts.released > 0) parts.push({ text: `${counts.released} released`, target: 'releases' });
  if (counts.pastCompareCap > 0) {
    parts.push({
      text: `${counts.pastCompareCap} merged, past the compare cap`,
      target: 'releases',
    });
  }
  if (counts.releaseUnknown > 0) {
    parts.push({ text: `${counts.releaseUnknown} merged, release unknown`, target: 'releases' });
  }
  if (counts.closed > 0) parts.push({ text: `${counts.closed} closed`, target: 'history' });
  return parts;
}

/** "3 in flight · 1 awaiting release · 82 released", zero parts left out. */
export function countsSentence(counts: RepoCounts): string {
  return countParts(counts).map((part) => part.text).join(' · ') || 'nothing yet';
}

/**
 * One list, furthest from done first: a stuck branch, then branches being
 * worked, then pull requests by state (draft → shipped → closed), newest first
 * within a state.
 */
function compareFlow(a: FlowRow, b: FlowRow, order: PullStateId[]): number {
  return rankOf(a, order) - rankOf(b, order) || activityOf(b).localeCompare(activityOf(a));
}

function rankOf(row: FlowRow, order: PullStateId[]): number {
  if (row.kind === 'branch') return row.status === 'blocked' ? -2 : -1;
  const index = order.indexOf(row.state);
  return index === -1 ? order.length : index;
}

function activityOf(row: FlowRow): string {
  if (row.kind === 'pr') return `${row.row.pr.updated_at}#${String(row.row.pr.number).padStart(9, '0')}`;
  return row.key;
}

/**
 * File each todo that has reached a branch under every repository it names,
 * one row per branch. A todo naming nothing this page can place is returned
 * rather than dropped — untriaged work is exactly what someone needs to see.
 *
 * The queue's own numbers stay cross-repo: they are counted once here and said
 * once above the sections, because `+12 queued` cannot be attributed to a repo.
 */
function fileGhosts(options: RepoGroupsOptions): {
  branchesByRepo: Map<string, BranchRow[]>;
  unassigned: BranchRow[];
  shift: RepoTimeline['shift'];
} {
  const branchesByRepo = new Map<string, BranchRow[]>();
  const ghostGroups = options.ghosts ?? [];
  if (ghostGroups.length === 0) return { branchesByRepo, unassigned: [], shift: null };
  const keyFor = options.repoKeyFor ?? ((repo: string) => (repo.includes('/') ? repo : null));
  const todosByRepo = new Map<string, GhostRow[]>();
  const unplaced: GhostRow[] = [];
  let inFlight = 0;
  let queued = 0;
  let family: string | null = null;
  for (const ghostGroup of ghostGroups) {
    queued += ghostGroup.queued;
    for (const row of ghostGroup.rows) {
      family ??= row.family;
      // Queued work has no branch yet: it belongs to the Work page, counted above.
      if (row.status === 'open') {
        queued += 1;
        continue;
      }
      inFlight += 1;
      const keys = row.repos.map(keyFor).filter((key): key is string => key !== null);
      if (keys.length === 0) {
        unplaced.push(row);
        continue;
      }
      // A todo naming three repos lands on the branch in each of them.
      for (const key of new Set(keys)) {
        const list = todosByRepo.get(key) ?? [];
        list.push(row);
        todosByRepo.set(key, list);
      }
    }
  }
  for (const [repo, todos] of todosByRepo) branchesByRepo.set(repo, branchRows(todos));
  return { branchesByRepo, unassigned: branchRows(unplaced), shift: { inFlight, queued, family } };
}

/** Group todos by the branch they land on, one row each. */
export function branchRows(todos: readonly GhostRow[]): BranchRow[] {
  const byBranch = new Map<string, GhostRow[]>();
  for (const todo of todos) {
    const key = branchKey(todo);
    const list = byBranch.get(key) ?? [];
    list.push(todo);
    byBranch.set(key, list);
  }
  return [...byBranch].map(([key, members]) => branchRow(key, members));
}

function branchKey(todo: GhostRow): string {
  return todo.kind === 'unscheduled' || !todo.date ? 'batch' : `${todo.kind}/${todo.date}`;
}

function branchRow(key: string, todos: GhostRow[]): BranchRow {
  const stuck = todos.filter((todo) => todo.attention).length;
  const working = todos.filter((todo) => todo.status === 'claimed').length;
  const status: BranchStatus = stuck > 0 ? 'blocked' : working > 0 ? 'active' : 'done';
  const detail =
    status === 'blocked'
      ? `${stuck} ${stuck === 1 ? 'needs' : 'need'} a human`
      : status === 'active'
        ? `${working} working`
        : 'no pull request yet';
  return {
    kind: 'branch',
    key,
    label: key === 'batch' ? 'batch branch' : key,
    todos,
    status,
    detail,
  };
}

/**
 * The Work page showing exactly this branch's todos. `?todo=` focuses them;
 * `?family=` is added only when they share one, since the Work page narrows to
 * a family before it looks for the ids.
 */
export function branchWorkHref(row: BranchRow): string {
  const families = new Set(row.todos.map((todo) => todo.family));
  const [family = ''] = families;
  return queueHref(families.size === 1 ? family : '', row.todos.map((todo) => todo.todoId));
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
    if (!ladder.uncertain) return 'merged';
    return ladderCapped(ladder) ? 'capped' : 'unknown';
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

/**
 * `In canary · v8`, or just the state's label: the row's one line of status.
 * Only a state past the merge has a release to name, and there the release is
 * the new information — the label already says which channel.
 */
export function pullRowStatus(row: PullRow): string {
  const label = PULL_STATE_LABELS[row.state] ?? row.state;
  const release = row.row.ladder.release;
  return release ? `${label} · ${release}` : label;
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
  return pulls.filter((pr) => awaitsRelease(pr, ladderFor)).length;
}

function awaitsRelease(
  pr: PullRequestSummary,
  ladderFor: (pr: PullRequestSummary) => ReleaseLadder
): boolean {
  if (pr.state !== 'merged') return false;
  const ladder = ladderFor(pr);
  return ladder.kind !== 'none' && !ladder.furthest && !ladder.uncertain;
}

export interface AwaitingRepo {
  repo: string;
  count: number;
}

/**
 * The same merged-but-shipped-nowhere PRs, per repository, most first: what
 * the page's "not shipped yet" warning names.
 */
export function awaitingReleaseByRepo(
  pulls: readonly PullRequestSummary[],
  ladderFor: (pr: PullRequestSummary) => ReleaseLadder
): AwaitingRepo[] {
  const counts = new Map<string, number>();
  for (const pr of pulls) {
    if (!awaitsRelease(pr, ladderFor)) continue;
    const repo = repoOf(pr);
    counts.set(repo, (counts.get(repo) ?? 0) + 1);
  }
  return [...counts]
    .map(([repo, count]) => ({ repo, count }))
    .sort((a, b) => b.count - a.count || a.repo.localeCompare(b.repo));
}

/** The warning in one line, or null when nothing waits. */
export function awaitingReleaseWarning(repos: readonly AwaitingRepo[], shown = 5): string | null {
  const total = repos.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) return null;
  const head = repos.slice(0, shown).map((entry) => `${entry.repo.split('/')[1] ?? entry.repo} ${entry.count}`);
  const rest = repos.length - head.length;
  const list = rest > 0 ? `${head.join(', ')} and ${rest} more` : head.join(', ');
  const prs = total === 1 ? '1 merged pull request has' : `${total} merged pull requests have`;
  const where = repos.length === 1 ? '1 repository' : `${repos.length} repositories`;
  return `Not shipped yet: ${prs} reached no release in ${where} (${list}).`;
}

/**
 * A closed pull request whose change another one carries. The forge's own
 * record answers it (`superseded_by`, written by a close-as-replaced), and a
 * recorded link is taken whatever state the replacement is in: a replacement
 * still open is exactly the case a reader needs to follow.
 *
 * Without a recorded link the pull requests' own words are read, as before:
 * either the closed one says so (`superseded by #12`, in a label or the title —
 * what the shift driver and pr-redteam write mechanically), or a merged PR has
 * the very same head sha, which means the branch landed under a different
 * number. A derived link only folds a row under a *merged* successor, because
 * pointing at another closed PR on a guess would hide both.
 */
export function linkSupersessions(rows: TimelineRow[]): void {
  const byNumber = new Map(rows.map((row) => [row.pr.number, row]));
  const mergedBySha = new Map<string, TimelineRow>();
  for (const row of rows) {
    if (row.pr.state === 'merged') mergedBySha.set(row.pr.head_sha, row);
  }
  for (const row of rows) {
    const recorded = row.pr.superseded_by ?? null;
    if (recorded !== null) {
      const successor = byNumber.get(recorded);
      if (successor && successor.pr.number !== row.pr.number) {
        if (row.pr.state === 'closed') row.supersededBy = successor.pr.number;
        successor.supersedes.push(row.pr.number);
        continue;
      }
    }
    if (row.pr.state !== 'closed') continue;
    const declared = declaredSuccessor(row.pr);
    const successor =
      (declared !== null ? byNumber.get(declared) : undefined) ??
      mergedBySha.get(row.pr.head_sha) ??
      null;
    if (!successor || successor.pr.state !== 'merged' || successor.pr.number === row.pr.number) {
      continue;
    }
    row.supersededBy = successor.pr.number;
    successor.supersedes.push(row.pr.number);
  }
  for (const row of rows) row.supersedes.sort((a, b) => a - b);
}

/**
 * What a pull request page says about its replacement: the pull request that
 * replaced this one, and the ones it replaced. The forge's record is the
 * source; `supersedes` keeps the order the forge gave (ascending).
 */
export function replacementOf(pr: PullReplacement): {
  supersededBy: number | null;
  /** Where the replacement stands, when the forge said. */
  supersededByState: string | null;
  supersedes: number[];
} {
  return {
    supersededBy: pr.superseded_by ?? null,
    supersededByState: pr.superseded_by_state ?? null,
    supersedes: pr.supersedes ?? [],
  };
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
  return compareInstants(b.pr.updated_at, a.pr.updated_at) || b.pr.number - a.pr.number;
}

/** Repositories with work in flight lead, then the one something happened in most recently. */
function byNewestActivity(a: RepoGroup, b: RepoGroup): number {
  return (
    Number(b.counts.inFlight > 0) - Number(a.counts.inFlight > 0) ||
    lastActivity(b).localeCompare(lastActivity(a)) ||
    a.repo.localeCompare(b.repo)
  );
}

function lastActivity(group: RepoGroup): string {
  let newest = '';
  for (const row of [...group.rows, ...group.older]) {
    if (row.kind === 'pr' && row.row.pr.updated_at > newest) newest = row.row.pr.updated_at;
  }
  return newest;
}
