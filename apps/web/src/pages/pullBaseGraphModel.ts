// pullBaseGraphModel.ts — the In flight timeline ordered by base: each open
// pull request hangs off the commit of its base branch it was opened against,
// the way a source-control graph hangs a branch off the commit it forked from.
//
// The base a pull request carries (`base_sha`) is the base branch's tip when it
// was opened; the forge does not move it when the base moves on. That is the
// base that decides whether it can still land as it is, so it is the one drawn.
// Where that commit sits on the base branch is read from the branch's recent
// history (newest first): its index there is how many commits it is behind.
//
// Only open pull requests are drawn. A branch with no pull request has no base
// yet, and merged work is placed by its release, not its base: both are listed
// after the graph, in the order the pipeline view gives them.

import type { CompareCommit } from '../api/types/deployments';
import type { FlowRow, PullRow } from './pullRepoGroupsModel';

/** How a repository's rows are ordered: by pipeline state, or under their base. */
export type PullOrder = 'state' | 'base';

/** The `?order=` parameter; anything but `base` is the pipeline order. */
export const PULL_ORDER_PARAM = 'order';

export function parsePullOrder(value: string | null | undefined): PullOrder {
  return value === 'base' ? 'base' : 'state';
}

/** How many commits of a base branch are read to place pull requests on it. */
export const BASE_HISTORY_LIMIT = 100;

/** A base branch's recent history, newest first. */
export interface BaseHistory {
  commits: readonly CompareCommit[];
  /** The branch has older commits than `commits` lists. */
  hasMore: boolean;
}

/**
 * Where a base commit sits on its branch: the tip, some commits behind it,
 * further back than the history read, not on the branch at all (it was
 * rewritten), or not known yet (the history has not loaded or did not answer).
 */
export type BasePosition = 'current' | 'behind' | 'beyond' | 'off' | 'unknown';

export interface BaseCommitNode {
  kind: 'base';
  sha: string;
  /** The commit's subject, when the history read reaches it. */
  summary: string | null;
  position: BasePosition;
  /** Commits between this one and the branch tip; null when not counted. */
  behind: number | null;
  /** The open pull requests opened against this commit, pipeline order. */
  rows: PullRow[];
}

/** Commits on the base branch that no open pull request is based on. */
export interface BaseGapNode {
  kind: 'gap';
  commits: number;
}

export type BaseNode = BaseCommitNode | BaseGapNode;

/** One base branch and the pull requests drawn off it. */
export interface BaseLine {
  ref: string;
  /** The open pull request whose branch this is (a stacked PR's base), if any. */
  stackedOn: number | null;
  /** The branch tip, when its history has loaded. */
  tip: string | null;
  nodes: BaseNode[];
}

export interface BaseGraph {
  lines: BaseLine[];
  /** Branches with no pull request yet: they have no base to draw. */
  unbased: FlowRow[];
  /** Merged and closed rows: placed by release, listed as the pipeline orders them. */
  settled: FlowRow[];
}

/**
 * Lays one repository's rows out under their bases. `historyFor` answers a
 * base branch's recent history, or undefined while it is unknown; the graph is
 * drawn either way, with positions unknown until the history arrives.
 */
export function baseGraph(
  rows: readonly FlowRow[],
  historyFor: (ref: string) => BaseHistory | undefined
): BaseGraph {
  const unbased: FlowRow[] = [];
  const settled: FlowRow[] = [];
  const byRef = new Map<string, PullRow[]>();
  for (const row of rows) {
    if (row.kind === 'branch') unbased.push(row);
    else if (row.row.pr.state !== 'open') settled.push(row);
    else {
      const list = byRef.get(row.row.pr.base_ref) ?? [];
      list.push(row);
      byRef.set(row.row.pr.base_ref, list);
    }
  }
  const heads = new Map<string, number>();
  for (const list of byRef.values()) {
    for (const row of list) heads.set(row.row.pr.head_ref, row.row.pr.number);
  }
  const lines = [...byRef]
    .map(([ref, list]) => baseLine(ref, list, historyFor(ref), heads.get(ref) ?? null))
    .sort(byLineWeight);
  return { lines, unbased, settled };
}

function baseLine(
  ref: string,
  rows: PullRow[],
  history: BaseHistory | undefined,
  stackedOn: number | null
): BaseLine {
  const bySha = new Map<string, PullRow[]>();
  for (const row of rows) {
    const list = bySha.get(row.row.pr.base_sha) ?? [];
    list.push(row);
    bySha.set(row.row.pr.base_sha, list);
  }
  const commits = [...bySha]
    .map(([sha, members]) => baseCommit(sha, members, history))
    .sort(byPlace);
  return {
    ref,
    stackedOn,
    tip: history?.commits[0]?.sha ?? null,
    nodes: withGaps(commits),
  };
}

function baseCommit(sha: string, rows: PullRow[], history: BaseHistory | undefined): BaseCommitNode {
  const node = (
    position: BasePosition,
    behind: number | null,
    summary: string | null
  ): BaseCommitNode => ({
    kind: 'base',
    sha,
    summary,
    position,
    behind,
    rows,
  });
  if (!history || !sha) return node('unknown', null, null);
  const index = history.commits.findIndex((commit) => commit.sha === sha);
  if (index === 0) return node('current', 0, history.commits[0]?.summary ?? null);
  if (index > 0) return node('behind', index, history.commits[index]?.summary ?? null);
  // Not in the history read: older than it, or — when that history is the
  // whole branch — not on the branch any more.
  return history.hasMore
    ? node('beyond', history.commits.length, null)
    : node('off', null, null);
}

/** Placed commits by distance from the tip, then the rest by newest activity. */
function byPlace(a: BaseCommitNode, b: BaseCommitNode): number {
  return (
    placeRank(a) - placeRank(b) ||
    (a.behind ?? 0) - (b.behind ?? 0) ||
    newestActivity(b).localeCompare(newestActivity(a)) ||
    a.sha.localeCompare(b.sha)
  );
}

const PLACE_RANK: Record<BasePosition, number> = {
  current: 0,
  behind: 0,
  beyond: 1,
  off: 2,
  unknown: 3,
};

function placeRank(node: BaseCommitNode): number {
  return PLACE_RANK[node.position];
}

function newestActivity(node: BaseCommitNode): string {
  return node.rows.reduce((newest, row) => (row.row.pr.updated_at > newest ? row.row.pr.updated_at : newest), '');
}

/**
 * Commits no pull request is based on, between the tip and the first base and
 * between one base and the next, are said as one gap each — the graph's
 * "14 more commits" — so how far apart two bases are reads off the rail.
 */
function withGaps(commits: BaseCommitNode[]): BaseNode[] {
  const nodes: BaseNode[] = [];
  let above = -1;
  for (const node of commits) {
    // A base past the history read is drawn below its last commit.
    if (node.position === 'current' || node.position === 'behind' || node.position === 'beyond') {
      const between = (node.behind ?? 0) - above - 1;
      if (between > 0) nodes.push({ kind: 'gap', commits: between });
      above = node.behind ?? above;
    }
    nodes.push(node);
  }
  return nodes;
}

/** The base most pull requests target leads; a tie goes to the name. */
function byLineWeight(a: BaseLine, b: BaseLine): number {
  return lineRows(b) - lineRows(a) || a.ref.localeCompare(b.ref);
}

function lineRows(line: BaseLine): number {
  return line.nodes.reduce((sum, node) => sum + (node.kind === 'base' ? node.rows.length : 0), 0);
}

/** "current", "7 behind", "100+ behind", "not on main", or nothing while unknown. */
export function basePositionLabel(node: BaseCommitNode, ref: string): string {
  if (node.position === 'current') return 'current';
  if (node.position === 'behind') return `${node.behind} behind`;
  if (node.position === 'beyond') return `${node.behind}+ behind`;
  if (node.position === 'off') return `not on ${ref}`;
  return '';
}

/** "1 more commit", "14 more commits". */
export function gapLabel(node: BaseGapNode, ref: string): string {
  return `${node.commits} more commit${node.commits === 1 ? '' : 's'} on ${ref}`;
}

/**
 * The base branches a list of pull requests needs history for: one per
 * repository and base, open pull requests only.
 */
export function baseHistoryKeys(
  pulls: readonly { state: string; base_ref: string; repo: { id: string } }[]
): { repoId: string; ref: string }[] {
  const seen = new Map<string, { repoId: string; ref: string }>();
  for (const pr of pulls) {
    if (pr.state !== 'open' || !pr.base_ref || !pr.repo.id) continue;
    seen.set(`${pr.repo.id}\n${pr.base_ref}`, { repoId: pr.repo.id, ref: pr.base_ref });
  }
  return [...seen.values()];
}
