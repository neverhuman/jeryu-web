import { describe, expect, it } from 'vitest';

import type { PullRequestSummary } from '../../api/types';
import {
  awaitingReleaseCount,
  buildRepoGroups,
  linkSupersessions,
  pullStateOf,
  stateHeading,
  type TimelineRow,
} from '../pullRepoGroupsModel';
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

  it('places a closed pull request where nothing moves again', () => {
    expect(pullStateOf(row(pull(13, 'closed'), ladder('production')))).toBe('closed');
  });
});

describe('buildRepoGroups', () => {
  const ladders = new Map<number, ReleaseLadder>();
  const ladderFor = (pr: PullRequestSummary) => ladders.get(pr.number) ?? UNKNOWN_LADDER;
  const labels = (states: { label: string }[]) => states.map((state) => state.label);

  it('groups by repository and orders states least far first', () => {
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
    expect(labels(groups[0]?.states ?? [])).toEqual([
      'Waiting on checks',
      'Mergeable',
      'Merged · not yet released',
      'In dev',
      'In prod',
      'Closed',
    ]);
  });

  it('shows one row per state — the newest — and folds the older ones', () => {
    ladders.clear();
    for (const number of [40, 41, 42]) ladders.set(number, ladder('dev', 'v9'));
    const { groups } = buildRepoGroups(
      [
        pull(40, 'merged', { updated: '2026-09-10T00:00:00Z' }),
        pull(41, 'merged', { updated: '2026-09-19T00:00:00Z' }),
        pull(42, 'merged', { updated: '2026-09-15T00:00:00Z' }),
      ],
      { ladderFor }
    );
    const dev = groups[0]?.states[0];
    expect(dev?.state).toBe('dev');
    expect(dev?.row.pr.number).toBe(41);
    // Newest first behind the expander, so opening it reads like the page does.
    expect(dev?.older.map((r) => r.pr.number)).toEqual([42, 40]);
    expect(groups[0]?.hidden).toBe(2);
    expect(groups[0]?.total).toBe(3);
  });

  it('caps how many older rows a state keeps', () => {
    ladders.clear();
    const pulls: PullRequestSummary[] = [];
    for (let number = 100; number < 110; number += 1) {
      ladders.set(number, ladder('production', 'v6'));
      pulls.push(pull(number, 'merged', { updated: `2026-09-1${number % 10}T00:00:00Z` }));
    }
    const { groups } = buildRepoGroups(pulls, { ladderFor, olderCap: 3 });
    const prod = groups[0]?.states[0];
    expect(prod?.older).toHaveLength(3);
    expect(groups[0]?.hidden).toBe(3);
    // The count still tells the truth about how many there are in total.
    expect(groups[0]?.total).toBe(10);
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
    expect(groups.every((group) => group.states.length === 1)).toBe(true);
  });

  it('counts open pull requests per repository', () => {
    ladders.clear();
    ladders.set(61, ladder('dev'));
    const { groups } = buildRepoGroups(
      [pull(60, 'open'), pull(61, 'merged'), pull(62, 'closed')],
      { ladderFor }
    );
    expect(groups[0]).toMatchObject({ total: 3, open: 1 });
  });

  it('names the release that carries a state, and says nothing when none does', () => {
    ladders.clear();
    ladders.set(70, ladder('canary', 'v8'));
    ladders.set(71, ladder(null));
    const { groups } = buildRepoGroups([pull(70, 'merged'), pull(71, 'merged')], { ladderFor });
    const headings = (groups[0]?.states ?? []).map(stateHeading);
    expect(headings).toEqual(['Merged · not yet released', 'In canary · v8']);
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
    expect(labels(groups[0]?.states ?? [])).toEqual(['In dev']);
    expect(groups[0]?.states[0]?.row.supersedes).toEqual([90]);
    expect(groups[0]?.total).toBe(1);
  });

  it('keeps a tag-released repository on its own single rung', () => {
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
    expect(groups[0]?.states[0]?.state).toBe('tag');
    expect(stateHeading(groups[0]?.states[0] as never)).toBe('Released · v5.0.0');
  });
});

describe('filing shift work under its repository', () => {
  const ladderFor = () => UNKNOWN_LADDER;
  const ghost = (id: string, repos: string[], status = 'open') => ({
    todoId: id,
    title: `todo ${id}`,
    family: 'jeryu',
    repos,
    status,
    kind: 'bulletshift' as const,
    date: '2026-09-20',
    steps: [],
    when: 'next up',
    attention: false,
    worker: null,
  });
  const group = (rows: ReturnType<typeof ghost>[], queued = 0) => [
    { key: 'bulletshift/2026-09-20', label: 'bulletshift 2026-09-20', hint: '', rows, queued },
  ];

  it('files a row under every repository it names', () => {
    const { groups } = buildRepoGroups([pull(1, 'open')], {
      ladderFor,
      ghosts: group([ghost('t1', ['jeryu-web', 'jeryu-api'])]),
      repoKeyFor: (repo) => `jeryu/${repo}`,
    });
    const byRepo = new Map(groups.map((g) => [g.repo, g]));
    expect(byRepo.get('jeryu/jeryu-web')?.incoming.map((r) => r.todoId)).toEqual(['t1']);
    // The second repository has no pull requests, so the row gives it a section.
    expect(byRepo.get('jeryu/jeryu-api')).toMatchObject({ total: 0, states: [] });
    expect(byRepo.get('jeryu/jeryu-api')?.incoming.map((r) => r.todoId)).toEqual(['t1']);
  });

  it('returns a row naming nothing placeable instead of dropping it', () => {
    const { groups, unassigned } = buildRepoGroups([pull(1, 'open')], {
      ladderFor,
      ghosts: group([ghost('t2', []), ghost('t3', ['who-knows'])]),
      repoKeyFor: (repo) => (repo === 'who-knows' ? null : `jeryu/${repo}`),
    });
    expect(unassigned.map((r) => r.todoId)).toEqual(['t2', 't3']);
    expect(groups.every((g) => g.incoming.length === 0)).toBe(true);
  });

  it('counts the queue once, across repositories', () => {
    const { shift } = buildRepoGroups([pull(1, 'open')], {
      ladderFor,
      ghosts: group(
        [ghost('t4', ['jeryu-web'], 'claimed'), ghost('t5', ['jeryu-web']), ghost('t6', ['jeryu-api'], 'done')],
        7
      ),
      repoKeyFor: (repo) => `jeryu/${repo}`,
    });
    // Two are in flight (claimed, done-without-a-PR); one is merely queued.
    expect(shift).toEqual({ inFlight: 2, queued: 7, family: 'jeryu' });
  });

  it('leads with a repository that has incoming work', () => {
    const { groups } = buildRepoGroups(
      [
        pull(1, 'open', { repo: 'jeryu/jeryu-web', updated: '2026-09-19T00:00:00Z' }),
        pull(2, 'open', { repo: 'jeryu/jeryu-api', updated: '2026-09-11T00:00:00Z' }),
      ],
      {
        ladderFor,
        ghosts: group([ghost('t7', ['jeryu-api'])]),
        repoKeyFor: (repo) => `jeryu/${repo}`,
      }
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
