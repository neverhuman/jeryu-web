import { describe, expect, it } from 'vitest';

import type { PullRequestSummary } from '../../api/types';
import type { CompareCommit } from '../../api/types/deployments';
import {
  baseGraph,
  baseHistoryKeys,
  basePositionLabel,
  gapLabel,
  parsePullOrder,
  type BaseCommitNode,
  type BaseHistory,
  type BaseNode,
} from '../pullBaseGraphModel';
import type { BranchRow, FlowRow, PullRow } from '../pullRepoGroupsModel';
import { UNKNOWN_LADDER } from '../releaseChannelsModel';

const sha = (c: string) => c.repeat(40);

describe('parsePullOrder', () => {
  it('reads only `base` as the base order', () => {
    expect(parsePullOrder('base')).toBe('base');
    expect(parsePullOrder(null)).toBe('state');
    expect(parsePullOrder('state')).toBe('state');
    expect(parsePullOrder('graph')).toBe('state');
  });
});

describe('baseGraph', () => {
  // main, newest first: a is the tip, b one behind, ... h seven behind.
  const main = history('abcdefgh', true);

  it('hangs open pull requests off the base commit they were opened against', () => {
    const graph = baseGraph(
      [row(1, { base: 'a' }), row(2, { base: 'c' }), row(3, { base: 'a' })],
      () => main
    );
    expect(graph.lines).toHaveLength(1);
    const [line] = graph.lines;
    expect(line?.ref).toBe('main');
    expect(line?.tip).toBe(sha('a'));
    expect(shape(line?.nodes ?? [])).toEqual([
      'base a current #1,#3',
      'gap 1',
      'base c 2 behind #2',
    ]);
  });

  it('says the commits above the newest base as a gap below the tip', () => {
    const graph = baseGraph([row(4, { base: 'd' })], () => main);
    expect(shape(graph.lines[0]?.nodes ?? [])).toEqual(['gap 3', 'base d 3 behind #4']);
  });

  it('places a base older than the history read below it, and one not on the branch last', () => {
    const graph = baseGraph(
      [row(5, { base: 'z' }), row(6, { base: 'b' })],
      () => main
    );
    expect(shape(graph.lines[0]?.nodes ?? [])).toEqual([
      'gap 1',
      'base b 1 behind #6',
      'gap 6',
      'base z beyond #5',
    ]);
    const complete = baseGraph([row(7, { base: 'z' })], () => history('ab', false));
    expect(shape(complete.lines[0]?.nodes ?? [])).toEqual(['base z off #7']);
  });

  it('still draws the bases, unplaced, before the history has loaded', () => {
    const graph = baseGraph([row(8, { base: 'a' }), row(9, { base: 'b' })], () => undefined);
    const [line] = graph.lines;
    expect(line?.tip).toBeNull();
    expect(line?.nodes.map((node) => node.kind === 'base' && node.position)).toEqual([
      'unknown',
      'unknown',
    ]);
  });

  it('gives each base branch its own rail, and names the pull request a stacked one sits on', () => {
    const graph = baseGraph(
      [
        row(10, { base: 'a' }),
        row(11, { base: 'b' }),
        row(12, { base: 'x', baseRef: 'feat/10' }),
      ],
      (ref) => (ref === 'main' ? main : history('x', true))
    );
    expect(graph.lines.map((line) => [line.ref, line.stackedOn])).toEqual([
      ['main', null],
      ['feat/10', 10],
    ]);
  });

  it('leaves branches without a pull request and merged work off the rails', () => {
    const branch: BranchRow = {
      kind: 'branch',
      key: 'nightshift/2026-10-12',
      label: 'nightshift/2026-10-12',
      todos: [],
      status: 'active',
      detail: '1 working',
    };
    const merged = row(13, { base: 'a', state: 'merged' });
    const graph = baseGraph([branch, row(14, { base: 'a' }), merged], () => main);
    expect(graph.unbased).toEqual([branch]);
    expect(graph.settled).toEqual([merged]);
    expect(shape(graph.lines[0]?.nodes ?? [])).toEqual(['base a current #14']);
  });

  it('keeps the pipeline order of the rows under one base', () => {
    const graph = baseGraph([row(20, { base: 'a' }), row(15, { base: 'a' })], () => main);
    expect(shape(graph.lines[0]?.nodes ?? [])).toEqual(['base a current #20,#15']);
  });
});

describe('labels', () => {
  it('says where a base sits in words', () => {
    const at = (position: BaseCommitNode['position'], behind: number | null) =>
      basePositionLabel(
        { kind: 'base', sha: sha('a'), summary: null, position, behind, rows: [] },
        'main'
      );
    expect(at('current', 0)).toBe('current');
    expect(at('behind', 7)).toBe('7 behind');
    expect(at('beyond', 100)).toBe('100+ behind');
    expect(at('off', null)).toBe('not on main');
    expect(at('unknown', null)).toBe('');
    expect(gapLabel({ kind: 'gap', commits: 1 }, 'main')).toBe('1 more commit on main');
    expect(gapLabel({ kind: 'gap', commits: 14 }, 'main')).toBe('14 more commits on main');
  });
});

describe('baseHistoryKeys', () => {
  it('asks once per repository and base branch, for open pull requests only', () => {
    const open = (id: string, ref: string) => ({ state: 'open', base_ref: ref, repo: { id } });
    expect(
      baseHistoryKeys([
        open('r1', 'main'),
        open('r1', 'main'),
        open('r1', 'rc/auto'),
        open('r2', 'main'),
        { state: 'merged', base_ref: 'release', repo: { id: 'r1' } },
      ])
    ).toEqual([
      { repoId: 'r1', ref: 'main' },
      { repoId: 'r1', ref: 'rc/auto' },
      { repoId: 'r2', ref: 'main' },
    ]);
  });
});

/** A node list in one line each: what the rail draws, top to bottom. */
function shape(nodes: BaseNode[]): string[] {
  return nodes.map((node) => {
    if (node.kind === 'gap') return `gap ${node.commits}`;
    const where =
      node.position === 'current'
        ? 'current'
        : node.position === 'behind'
          ? `${node.behind} behind`
          : node.position;
    const numbers = node.rows.map((r) => `#${r.row.pr.number}`).join(',');
    return `base ${node.sha[0]} ${where} ${numbers}`;
  });
}

/** One commit per letter, newest first. */
function history(letters: string, hasMore: boolean): BaseHistory {
  const commits: CompareCommit[] = [...letters].map((letter) => ({
    sha: sha(letter),
    summary: `commit ${letter}`,
    author: 'operator',
    committed_at: '2026-10-12T00:00:00Z',
  }));
  return { commits, hasMore };
}

function row(
  number: number,
  extra: { base: string; baseRef?: string; state?: PullRequestSummary['state'] }
): FlowRow {
  const pr: PullRequestSummary = {
    repo: { id: 'repo-1', host: 'jeryu', owner: 'acme', name: 'widgets' },
    number,
    entity: { kind: 'pull_request', id: String(number) },
    title: `change ${number}`,
    author: 'operator',
    head_ref: `feat/${number}`,
    base_ref: extra.baseRef ?? 'main',
    head_sha: sha('9'),
    base_sha: sha(extra.base),
    state: extra.state ?? 'open',
    draft: false,
    mergeable: {
      level: 'mergeable',
      can_merge: true,
      reason: null,
      exact_head_sha: sha('9'),
      required_gate: null,
    },
    review: {
      required_approvals: 1,
      approvals: 1,
      changes_requested: 0,
      unresolved_threads: 0,
      user_review_state: null,
    },
    checks: { total: 1, passing: 1, failing: 0, pending: 0, skipped: 0 },
    agents: { active_sessions: 0, proposed_patches: 0, evidence_packets: 0, blockers: 0 },
    labels: [],
    updated_at: '2026-10-12T00:00:00Z',
    passport_hash: null,
    available_actions: [],
  };
  const flow: PullRow = {
    kind: 'pr',
    row: { pr, ladder: UNKNOWN_LADDER, supersedes: [], supersededBy: null },
    state: 'mergeable',
    frontier: false,
    alsoWaiting: 0,
    replaced: [],
  };
  return flow;
}
