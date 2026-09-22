import { describe, expect, it } from 'vitest';

import type { PullRequestSummary } from '../../api/types';
import {
  awaitingReleaseCount,
  buildRepoGroups,
  linkSupersessions,
  countsSentence,
  pullRowStatus,
  pullStateOf,
  type BranchRow,
  type FlowRow,
  type TimelineRow,
} from '../pullRepoGroupsModel';
import type { GhostRow } from '../pullGhostsModel';
import {
  CHANNEL_ORDER,
  UNKNOWN_LADDER,
  type ChannelPip,
  type Membership,
  type ReleaseLadder,
} from '../releaseChannelsModel';

const sha = (c: string) => c.repeat(40);

/** A ladder that has reached `furthest` and no deeper. `null` reaches nothing. */
function ladder(furthest: string | null, release = 'v1'): ReleaseLadder {
  const reached = furthest === null ? -1 : CHANNEL_ORDER.indexOf(furthest as never);
  const pips: ChannelPip[] = CHANNEL_ORDER.map((channel, index) => {
    const membership: Membership = index <= reached ? 'in' : 'out';
    return {
      id: channel,
      label: channel,
      membership,
      release: membership === 'in' ? release : null,
      at: null,
    };
  });
  return {
    kind: 'channels',
    pips,
    furthest: furthest === null ? null : (furthest as never),
    release: furthest === null ? null : release,
    uncertain: false,
  };
}

const NO_RELEASES: ReleaseLadder = {
  kind: 'none',
  pips: [],
  furthest: null,
  release: null,
  uncertain: false,
};

const row = (pr: PullRequestSummary, l: ReleaseLadder = UNKNOWN_LADDER): TimelineRow => ({
  pr,
  ladder: l,
  supersedes: [],
  supersededBy: null,
});

describe('pullStateOf', () => {
  it('places open work at the furthest point it has reached', () => {
    expect(pullStateOf(row(pull(1, 'open', { draft: true })))).toBe('draft');
    expect(pullStateOf(row(pull(2, 'open', { checks: { total: 0 } })))).toBe('checks');
    expect(pullStateOf(row(pull(3, 'open', { checks: { failing: 1 } })))).toBe('checks');
    expect(pullStateOf(row(pull(4, 'open', { checks: { pending: 1 } })))).toBe('checks');
    expect(pullStateOf(row(pull(5, 'open', { approvals: 0 })))).toBe('review');
    expect(pullStateOf(row(pull(6, 'open', { changes: 1 })))).toBe('review');
    expect(pullStateOf(row(pull(7, 'open')))).toBe('mergeable');
  });

  it('places merged work by its release ladder', () => {
    expect(pullStateOf(row(pull(8, 'merged'), ladder(null)))).toBe('merged');
    expect(pullStateOf(row(pull(9, 'merged'), ladder('canary')))).toBe('canary');
    expect(pullStateOf(row(pull(10, 'merged'), ladder('production')))).toBe('production');
    // Undecided is its own state: it is not the same as "shipped nowhere".
    expect(pullStateOf(row(pull(11, 'merged'), UNKNOWN_LADDER))).toBe('unknown');
    expect(pullStateOf(row(pull(12, 'merged'), NO_RELEASES))).toBe('unrecorded');
  });

  it('heads an undecided release with the compare it gave up on', () => {
    const capped: ReleaseLadder = {
      kind: 'channels',
      pips: [
        { id: 'production', label: 'prod', membership: 'unknown', release: null, at: null, baseline: 'v2.3', undecided: 'capped' },
      ],
      furthest: null,
      release: null,
      uncertain: true,
    };
    const { groups } = buildRepoGroups([pull(81, 'merged')], { ladderFor: () => capped });
    expect(groups[0]?.states[0]).toMatchObject({ state: 'unknown', hint: 'prod v2.3 compare capped' });
  });

  it('places a closed pull request where nothing moves again', () => {
    expect(pullStateOf(row(pull(13, 'closed'), ladder('production')))).toBe('closed');
  });
});

describe('buildRepoGroups', () => {
  const ladders = new Map<number, ReleaseLadder>();
  const ladderFor = (pr: PullRequestSummary) => ladders.get(pr.number) ?? UNKNOWN_LADDER;
  const numbers = (rows: FlowRow[]) =>
    rows.map((r) => (r.kind === 'pr' ? r.row.pr.number : r.key));

  it('lists a repository as one run of rows, furthest from done first', () => {
    ladders.clear();
    ladders.set(30, ladder(null));
    ladders.set(31, ladder('dev', 'v9'));
    ladders.set(32, ladder('production', 'v6'));
    const { groups } = buildRepoGroups(
      [
        pull(30, 'merged'),
        pull(31, 'merged'),
        pull(32, 'merged'),
        pull(33, 'open', { checks: { failing: 1 } }),
        pull(34, 'open'),
        pull(35, 'closed'),
      ],
      { ladderFor }
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.repo).toBe('jeryu/jeryu-web');
    expect(numbers(groups[0]?.rows ?? [])).toEqual([33, 34, 30, 31, 32]);
    // Closed work never moves again: it is history, not a row.
    expect(numbers(groups[0]?.older ?? [])).toEqual([35]);
    expect(
      (groups[0]?.rows ?? []).map((r) => (r.kind === 'pr' ? pullRowStatus(r) : r.label))
    ).toEqual([
      'Waiting on checks',
      'Mergeable',
      'Merged · not yet released',
      'In dev · v9',
      'In prod · v6',
    ]);
  });

  it('keeps in-flight work in view and one row for each state only a release moves', () => {
    ladders.clear();
    for (const number of [40, 41, 42]) ladders.set(number, ladder(null));
    for (const number of [43, 44]) ladders.set(number, ladder('production', 'v6'));
    ladders.set(45, ladder('dev', 'v9'));
    const { groups } = buildRepoGroups(
      [
        pull(38, 'open', { checks: { failing: 1 } }),
        pull(39, 'open', { checks: { failing: 1 }, updated: '2026-09-11T00:00:00Z' }),
        pull(40, 'merged', { updated: '2026-09-10T00:00:00Z' }),
        pull(41, 'merged', { updated: '2026-09-19T00:00:00Z' }),
        pull(42, 'merged', { updated: '2026-09-15T00:00:00Z' }),
        pull(43, 'merged', { updated: '2026-09-08T00:00:00Z' }),
        pull(44, 'merged', { updated: '2026-09-09T00:00:00Z' }),
        pull(45, 'merged', { updated: '2026-09-09T00:00:00Z' }),
        pull(46, 'closed'),
      ],
      { ladderFor }
    );
    const group = groups[0]!;
    // Both open PRs can stall on their own, so both show; merged work shows its
    // newest per state — #41 for the three waiting, #45 in dev, #44 in prod.
    expect(numbers(group.rows)).toEqual([38, 39, 41, 45, 44]);
    expect(numbers(group.older)).toEqual([42, 40, 43, 46]);
    const waiting = group.rows[2];
    expect(waiting?.kind === 'pr' && [waiting.frontier, waiting.alsoWaiting]).toEqual([true, 2]);
    const prod = group.rows[4];
    expect(prod?.kind === 'pr' && [prod.frontier, prod.alsoWaiting]).toEqual([true, 0]);
    // Open rows are never a frontier: they carry no pill and stand for nothing.
    expect(group.rows[0]?.kind === 'pr' && group.rows[0].frontier).toBe(false);
  });

  it('stops listing past the limit but counts everything', () => {
    ladders.clear();
    const pulls: PullRequestSummary[] = [];
    for (let number = 100; number < 110; number += 1) {
      ladders.set(number, ladder('production', 'v6'));
      pulls.push(pull(number, 'merged', { updated: `2026-09-1${number % 10}T00:00:00Z` }));
    }
    const { groups } = buildRepoGroups(pulls, { ladderFor, rowLimit: 7 });
    expect(numbers(groups[0]?.rows ?? [])).toEqual([109]);
    expect(numbers(groups[0]?.older ?? [])).toEqual([108, 107, 106, 105, 104, 103]);
    expect(groups[0]?.counts.released).toBe(10);
  });

  it('separates repositories and leads with the one that moved most recently', () => {
    ladders.clear();
    const { groups } = buildRepoGroups(
      [
        pull(50, 'open', { repo: 'jeryu/jeryu-api', updated: '2026-09-11T00:00:00Z' }),
        pull(51, 'open', { repo: 'jeryu/jeryu-web', updated: '2026-09-19T00:00:00Z' }),
        pull(52, 'open', { repo: 'veox/jain-web', updated: '2026-09-19T00:00:00Z' }),
      ],
      { ladderFor }
    );
    expect(groups.map((group) => group.repo)).toEqual([
      'jeryu/jeryu-web',
      'veox/jain-web',
      'jeryu/jeryu-api',
    ]);
  });

  it('counts a repository in words, leaving out what is zero', () => {
    ladders.clear();
    ladders.set(61, ladder('dev'));
    ladders.set(63, ladder(null));
    const { groups } = buildRepoGroups(
      [pull(60, 'open'), pull(61, 'merged'), pull(62, 'closed'), pull(63, 'merged')],
      { ladderFor }
    );
    expect(groups[0]?.counts).toEqual({
      inFlight: 1,
      awaitingRelease: 1,
      released: 1,
      releaseUnknown: 0,
      closed: 1,
    });
    expect(countsSentence(groups[0]!.counts)).toBe(
      '1 in flight · 1 awaiting release · 1 released · 1 closed'
    );
    expect(
      countsSentence({ inFlight: 0, awaitingRelease: 0, released: 4, releaseUnknown: 2, closed: 0 })
    ).toBe(
      '4 released · 2 merged, release unknown'
    );
  });

  it('counts the release manifest across every repository', () => {
    ladders.clear();
    ladders.set(80, ladder(null));
    ladders.set(81, ladder(null));
    ladders.set(82, ladder('dev'));
    const { awaitingRelease } = buildRepoGroups(
      [
        pull(80, 'merged'),
        pull(81, 'merged', { repo: 'jeryu/jeryu-api' }),
        pull(82, 'merged'),
        pull(83, 'open'),
      ],
      { ladderFor }
    );
    expect(awaitingRelease).toBe(2);
  });

  it('hides a closed pull request another one carried and names it on the successor', () => {
    ladders.clear();
    ladders.set(91, ladder('dev', 'v9'));
    const { groups } = buildRepoGroups(
      [pull(90, 'closed', { title: 'first go — superseded by #91' }), pull(91, 'merged')],
      { ladderFor }
    );
    const rows = groups[0]?.rows ?? [];
    expect(numbers(rows)).toEqual([91]);
    expect(rows[0]?.kind === 'pr' && rows[0].row.supersedes).toEqual([90]);
  });

  it('names the release on a tag-released row', () => {
    ladders.clear();
    const tagged: ReleaseLadder = {
      kind: 'tag',
      pips: [{ id: 'tag', label: 'v5.0.0', membership: 'in', release: 'v5.0.0', at: null }],
      furthest: 'tag',
      release: 'v5.0.0',
      uncertain: false,
    };
    ladders.set(95, tagged);
    const { groups } = buildRepoGroups([pull(95, 'merged')], { ladderFor });
    const first = groups[0]?.rows[0];
    expect(first?.kind === 'pr' && first.state).toBe('tag');
    expect(first?.kind === 'pr' && pullRowStatus(first)).toBe('Released · v5.0.0');
  });
});

describe('shift work as branch rows', () => {
  const ladderFor = () => UNKNOWN_LADDER;
  const ghost = (
    id: string,
    repos: string[],
    status = 'claimed',
    extra: Partial<GhostRow> = {}
  ): GhostRow => ({
    todoId: id,
    title: `todo ${id}`,
    family: 'jeryu',
    repos,
    status,
    kind: 'bulletshift',
    date: '2026-09-20',
    steps: [],
    when: 'hands off in 1h',
    attention: false,
    worker: null,
    ...extra,
  });
  const group = (rows: GhostRow[], queued = 0) => [
    { key: 'bulletshift/2026-09-20', label: 'bulletshift 2026-09-20', hint: '', rows, queued },
  ];
  const keyFor = (repo: string) => `jeryu/${repo}`;
  const branches = (rows: FlowRow[]) => rows.filter((r): r is BranchRow => r.kind === 'branch');

  it('rolls the todos on one branch into one row, filed under every repository they name', () => {
    const { groups } = buildRepoGroups([pull(1, 'open')], {
      ladderFor,
      ghosts: group([ghost('t1', ['jeryu-web', 'jeryu-api']), ghost('t2', ['jeryu-web'], 'done')]),
      repoKeyFor: keyFor,
    });
    const byRepo = new Map(groups.map((g) => [g.repo, g]));
    const web = branches(byRepo.get('jeryu/jeryu-web')?.rows ?? []);
    expect(web).toHaveLength(1);
    expect(web[0]).toMatchObject({ key: 'bulletshift/2026-09-20', status: 'active', detail: '1 working' });
    expect(web[0]?.todos.map((t) => t.todoId)).toEqual(['t1', 't2']);
    // The branch leads the pull request: it is further from done.
    expect(byRepo.get('jeryu/jeryu-web')?.rows[0]?.kind).toBe('branch');
    // The second repository has no pull requests, so the branch gives it a section.
    expect(branches(byRepo.get('jeryu/jeryu-api')?.rows ?? [])[0]?.todos.map((t) => t.todoId)).toEqual([
      't1',
    ]);
  });

  it('puts unscheduled work on the batch branch and says when it waits on its PR', () => {
    const { groups } = buildRepoGroups([], {
      ladderFor,
      ghosts: group([ghost('t3', ['jeryu-web'], 'done', { kind: 'unscheduled', date: null })]),
      repoKeyFor: keyFor,
    });
    expect(groups[0]?.rows[0]).toMatchObject({
      kind: 'branch',
      key: 'batch',
      label: 'batch branch',
      status: 'done',
      detail: 'no PR yet',
    });
  });

  it('lifts a stuck branch to the top of its repository', () => {
    const { groups } = buildRepoGroups([pull(1, 'open', { draft: true })], {
      ladderFor,
      ghosts: [
        ...group([ghost('t4', ['jeryu-web'])]),
        {
          key: 'nightshift/2026-09-21',
          label: 'nightshift 2026-09-21',
          hint: '',
          queued: 0,
          rows: [
            ghost('t5', ['jeryu-web'], 'blocked', {
              kind: 'nightshift',
              date: '2026-09-21',
              attention: true,
            }),
          ],
        },
      ],
      repoKeyFor: keyFor,
    });
    const rows = groups[0]?.rows ?? [];
    expect(rows.map((r) => (r.kind === 'branch' ? r.key : r.row.pr.number))).toEqual([
      'nightshift/2026-09-21',
      'bulletshift/2026-09-20',
      1,
    ]);
    expect(rows[0]).toMatchObject({ status: 'blocked', detail: '1 needs a human' });
  });

  it('leaves queued todos to the Work page and only counts them', () => {
    const { groups, shift } = buildRepoGroups([], {
      ladderFor,
      ghosts: group([ghost('t6', ['jeryu-web'], 'open'), ghost('t7', ['jeryu-web'], 'done')], 7),
      repoKeyFor: keyFor,
    });
    const todos = branches(groups[0]?.rows ?? []).flatMap((b) => b.todos.map((t) => t.todoId));
    expect(todos).toEqual(['t7']);
    // One on a branch; the shown queued one plus the seven behind it are queued.
    expect(shift).toEqual({ inFlight: 1, queued: 8, family: 'jeryu' });
  });

  it('returns work naming nothing placeable instead of dropping it', () => {
    const { groups, unassigned } = buildRepoGroups([pull(1, 'open')], {
      ladderFor,
      ghosts: group([ghost('t8', []), ghost('t9', ['who-knows'])]),
      repoKeyFor: (repo) => (repo === 'who-knows' ? null : keyFor(repo)),
    });
    expect(unassigned.flatMap((b) => b.todos.map((t) => t.todoId))).toEqual(['t8', 't9']);
    expect(groups.every((g) => branches(g.rows).length === 0)).toBe(true);
  });

  it('leads with a repository that has work in flight', () => {
    const { groups } = buildRepoGroups(
      [
        pull(1, 'merged', { repo: 'jeryu/jeryu-web', updated: '2026-09-19T00:00:00Z' }),
        pull(2, 'merged', { repo: 'jeryu/jeryu-api', updated: '2026-09-11T00:00:00Z' }),
      ],
      { ladderFor, ghosts: group([ghost('t10', ['jeryu-api'])]), repoKeyFor: keyFor }
    );
    expect(groups.map((g) => g.repo)).toEqual(['jeryu/jeryu-api', 'jeryu/jeryu-web']);
  });

  it('says nothing about shifts when no ghosts are passed', () => {
    const { shift, unassigned } = buildRepoGroups([pull(1, 'open')], { ladderFor });
    expect(shift).toBeNull();
    expect(unassigned).toEqual([]);
  });
});

describe('linkSupersessions', () => {
  const rowsOf = (pulls: PullRequestSummary[]): TimelineRow[] => pulls.map((pr) => row(pr));

  it('reads a declaration from a label as well as the title', () => {
    const rows = rowsOf([pull(1, 'closed', { labels: ['superseded by #2'] }), pull(2, 'merged')]);
    linkSupersessions(rows);
    expect(rows[0]?.supersededBy).toBe(2);
    expect(rows[1]?.supersedes).toEqual([1]);
  });

  it('spots a branch that landed under another number by its head sha', () => {
    const rows = rowsOf([pull(1, 'closed', { head: 'a' }), pull(2, 'merged', { head: 'a' })]);
    linkSupersessions(rows);
    expect(rows[0]?.supersededBy).toBe(2);
  });

  it('will not fold a closed PR behind another closed one', () => {
    const rows = rowsOf([pull(1, 'closed', { title: 'superseded by #2' }), pull(2, 'closed')]);
    linkSupersessions(rows);
    expect(rows[0]?.supersededBy).toBeNull();
  });

  it('ignores a declaration pointing at a pull request that is not loaded', () => {
    const rows = rowsOf([pull(1, 'closed', { title: 'superseded by #999' })]);
    linkSupersessions(rows);
    expect(rows[0]?.supersededBy).toBeNull();
  });
});

describe('awaitingReleaseCount', () => {
  it('counts only merged work that decidedly shipped nowhere', () => {
    const ladders = new Map<number, ReleaseLadder>([
      [1, ladder(null)],
      [2, ladder('dev')],
      [3, UNKNOWN_LADDER],
      [4, NO_RELEASES],
    ]);
    const pulls = [pull(1, 'merged'), pull(2, 'merged'), pull(3, 'merged'), pull(4, 'merged'), pull(5, 'open')];
    expect(awaitingReleaseCount(pulls, (pr) => ladders.get(pr.number) ?? UNKNOWN_LADDER)).toBe(1);
  });
});

// ------------------------------------------------------------------ factories

function pull(
  number: number,
  state: PullRequestSummary['state'],
  extra: {
    repo?: string;
    draft?: boolean;
    updated?: string;
    title?: string;
    labels?: string[];
    head?: string;
    checks?: Partial<PullRequestSummary['checks']>;
    approvals?: number;
    changes?: number;
  } = {}
): PullRequestSummary {
  const [owner = 'jeryu', name = 'jeryu-web'] = (extra.repo ?? 'jeryu/jeryu-web').split('/');
  return {
    repo: { id: `${owner}/${name}`, host: 'jeryu', owner, name },
    number,
    entity: { kind: 'pull_request', id: String(number) },
    title: extra.title ?? `change ${number}`,
    author: 'alton',
    head_ref: `feat/${number}`,
    base_ref: 'main',
    head_sha: sha(extra.head ?? String(number % 10)),
    base_sha: sha('0'),
    state,
    draft: extra.draft ?? false,
    mergeable: {
      level: 'mergeable',
      can_merge: true,
      reason: null,
      exact_head_sha: sha('1'),
      required_gate: null,
    },
    review: {
      required_approvals: 1,
      approvals: extra.approvals ?? 1,
      changes_requested: extra.changes ?? 0,
      unresolved_threads: 0,
      user_review_state: null,
    },
    checks: { total: 2, passing: 2, failing: 0, pending: 0, skipped: 0, ...extra.checks },
    agents: { active_sessions: 0, proposed_patches: 0, evidence_packets: 0, blockers: 0 },
    labels: extra.labels ?? [],
    updated_at: extra.updated ?? '2026-09-18T00:00:00Z',
    passport_hash: null,
    available_actions: [],
  } as PullRequestSummary;
}
