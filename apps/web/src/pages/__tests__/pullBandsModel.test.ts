import { describe, expect, it } from 'vitest';

import type { PullRequestSummary } from '../../api/types';
import {
  awaitingReleaseCount,
  buildTimeline,
  deepestChannel,
  linkSupersessions,
  releaseNames,
  type TimelineRow,
} from '../pullBandsModel';
import {
  CHANNEL_ORDER,
  UNKNOWN_LADDER,
  type ChannelPip,
  type Membership,
  type ReleaseLadder,
} from '../releaseChannelsModel';

const sha = (c: string) => c.repeat(40);

/**
 * A ladder that has reached `furthest` and no deeper, with the four channels
 * present. `null` reaches nothing: merged and unreleased.
 */
function ladder(furthest: string | null, release = 'v1'): ReleaseLadder {
  const reachedIndex = furthest === null ? -1 : CHANNEL_ORDER.indexOf(furthest as never);
  const pips: ChannelPip[] = CHANNEL_ORDER.map((channel, index) => {
    const membership: Membership = index <= reachedIndex ? 'in' : 'out';
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

describe('buildTimeline', () => {
  const ladders = new Map<number, ReleaseLadder>();
  const ladderFor = (pr: PullRequestSummary) => ladders.get(pr.number) ?? UNKNOWN_LADDER;

  it('keeps open rows out of the bands, drafts last', () => {
    const timeline = buildTimeline(
      [
        pull(1, 'open', { updated: '2026-09-10T00:00:00Z' }),
        pull(2, 'open', { draft: true, updated: '2026-09-19T00:00:00Z' }),
        pull(3, 'open', { updated: '2026-09-18T00:00:00Z' }),
      ],
      { ladderFor }
    );
    expect(timeline.open.map((row) => row.pr.number)).toEqual([3, 1, 2]);
    expect(timeline.bands).toEqual([]);
  });

  it('bands merged work by how far out it has shipped, manifest first', () => {
    ladders.clear();
    ladders.set(10, ladder(null));
    ladders.set(11, ladder('dev', 'v9'));
    ladders.set(12, ladder('canary', 'v8'));
    ladders.set(13, ladder('production', 'v6'));
    const timeline = buildTimeline(
      [10, 11, 12, 13].map((number) => pull(number, 'merged')),
      { ladderFor }
    );
    expect(timeline.bands.map((band) => band.id)).toEqual([
      'pending',
      'dev',
      'canary',
      'production',
    ]);
    expect(timeline.bands.map((band) => band.label)).toEqual([
      'Merged · not yet released',
      'In dev, not yet canary',
      'In canary, not yet stable',
      'In prod',
    ]);
    expect(timeline.awaitingRelease).toBe(1);
  });

  it('expands the release manifest and collapses settled history', () => {
    ladders.clear();
    ladders.set(20, ladder(null));
    ladders.set(21, ladder('stable', 'v7'));
    ladders.set(22, ladder('production', 'v6'));
    const timeline = buildTimeline(
      [20, 21, 22].map((number) => pull(number, 'merged')),
      { ladderFor }
    );
    const collapsed = new Map(timeline.bands.map((band) => [band.id, band.collapsed]));
    expect(collapsed.get('pending')).toBe(false);
    expect(collapsed.get('stable')).toBe(false);
    // Everything production runs is settled: one line until it is clicked.
    expect(collapsed.get('production')).toBe(true);
  });

  it('names the releases carrying a band', () => {
    ladders.clear();
    ladders.set(30, ladder('canary', 'v8'));
    ladders.set(31, ladder('canary', 'v8'));
    const timeline = buildTimeline(
      [30, 31].map((number) => pull(number, 'merged')),
      { ladderFor }
    );
    expect(timeline.bands[0]?.hint).toBe('2 PRs · v8');
  });

  it('caps the settled band and says what it left out', () => {
    ladders.clear();
    const pulls = [];
    for (let number = 100; number < 130; number += 1) {
      ladders.set(number, ladder('production', 'v6'));
      pulls.push(pull(number, 'merged'));
    }
    const timeline = buildTimeline(pulls, { ladderFor, floorCap: 5 });
    const band = timeline.bands[0];
    expect(band?.rows).toHaveLength(5);
    expect(band?.hidden).toBe(25);
    expect(timeline.floor).toBe('25 older pull requests are in v6 too and are not listed.');
  });

  it('orders a band newest merge first', () => {
    ladders.clear();
    for (const number of [40, 41, 42]) ladders.set(number, ladder('dev', 'v9'));
    const timeline = buildTimeline(
      [
        pull(40, 'merged', { updated: '2026-09-10T00:00:00Z' }),
        pull(41, 'merged', { updated: '2026-09-19T00:00:00Z' }),
        pull(42, 'merged', { updated: '2026-09-15T00:00:00Z' }),
      ],
      { ladderFor }
    );
    expect(timeline.bands[0]?.rows.map((row) => row.pr.number)).toEqual([41, 42, 40]);
  });

  it('separates work whose release is unknown from work with no release recorded', () => {
    ladders.clear();
    ladders.set(50, UNKNOWN_LADDER);
    ladders.set(51, NO_RELEASES);
    const timeline = buildTimeline(
      [50, 51].map((number) => pull(number, 'merged')),
      { ladderFor }
    );
    expect(timeline.bands.map((band) => band.id)).toEqual(['unknown', 'unrecorded']);
    // Neither counts as the release manifest: only a decided "nowhere yet" does.
    expect(timeline.awaitingRelease).toBe(0);
  });

  it('folds closed pull requests into one collapsed band', () => {
    ladders.clear();
    const timeline = buildTimeline(
      [pull(60, 'closed'), pull(61, 'closed'), pull(62, 'open')],
      { ladderFor }
    );
    const closed = timeline.bands.find((band) => band.id === 'closed');
    expect(closed?.collapsed).toBe(true);
    expect(closed?.rows).toHaveLength(2);
    expect(closed?.hint).toBe('2 PRs · closed without merging');
  });

  it('hides a closed pull request that another one carried, and names it on the successor', () => {
    ladders.clear();
    ladders.set(71, ladder('dev', 'v9'));
    const timeline = buildTimeline(
      [
        pull(70, 'closed', { title: 'first go — superseded by #71' }),
        pull(71, 'merged', { title: 'the change that landed' }),
      ],
      { ladderFor }
    );
    expect(timeline.bands.map((band) => band.id)).toEqual(['dev']);
    expect(timeline.bands[0]?.rows[0]?.supersedes).toEqual([70]);
  });
});

describe('linkSupersessions', () => {
  const rowsOf = (pulls: PullRequestSummary[]): TimelineRow[] =>
    pulls.map((pr) => ({ pr, ladder: UNKNOWN_LADDER, supersedes: [], supersededBy: null }));

  it('reads a declaration from a label as well as the title', () => {
    const rows = rowsOf([
      pull(1, 'closed', { labels: ['superseded by #2'] }),
      pull(2, 'merged'),
    ]);
    linkSupersessions(rows);
    expect(rows[0]?.supersededBy).toBe(2);
    expect(rows[1]?.supersedes).toEqual([1]);
  });

  it('spots a branch that landed under another number by its head sha', () => {
    const rows = rowsOf([
      pull(1, 'closed', { head: 'a' }),
      pull(2, 'merged', { head: 'a' }),
    ]);
    linkSupersessions(rows);
    expect(rows[0]?.supersededBy).toBe(2);
  });

  it('will not fold a closed PR behind another closed one', () => {
    const rows = rowsOf([
      pull(1, 'closed', { title: 'superseded by #2' }),
      pull(2, 'closed'),
    ]);
    linkSupersessions(rows);
    expect(rows[0]?.supersededBy).toBeNull();
  });

  it('ignores a declaration pointing at a pull request that is not loaded', () => {
    const rows = rowsOf([pull(1, 'closed', { title: 'superseded by #999' })]);
    linkSupersessions(rows);
    expect(rows[0]?.supersededBy).toBeNull();
  });

  it('leaves a merged pull request alone', () => {
    const rows = rowsOf([pull(1, 'merged', { title: 'superseded by #2' }), pull(2, 'merged')]);
    linkSupersessions(rows);
    expect(rows[0]?.supersededBy).toBeNull();
    expect(rows[1]?.supersedes).toEqual([]);
  });
});

describe('awaitingReleaseCount', () => {
  it('counts only merged work that decidedly shipped nowhere', () => {
    const ladders = new Map<number, ReleaseLadder>([
      [1, ladder(null)],
      [2, ladder('dev')],
      [3, UNKNOWN_LADDER],
      [4, NO_RELEASES],
      [5, ladder(null)],
    ]);
    const pulls = [
      pull(1, 'merged'),
      pull(2, 'merged'),
      pull(3, 'merged'),
      pull(4, 'merged'),
      pull(5, 'open'),
    ];
    expect(awaitingReleaseCount(pulls, (pr) => ladders.get(pr.number) ?? UNKNOWN_LADDER)).toBe(1);
  });
});

describe('deepestChannel and releaseNames', () => {
  it('reads the floor off the ladders the rows carry', () => {
    const rows: TimelineRow[] = [
      { pr: pull(1, 'merged'), ladder: ladder('dev', 'v9'), supersedes: [], supersededBy: null },
    ];
    expect(deepestChannel(rows)).toBe('production');
    expect(releaseNames(rows)).toEqual(['v9']);
    expect(deepestChannel([])).toBeNull();
  });
});

// ------------------------------------------------------------------ factories

function pull(
  number: number,
  state: PullRequestSummary['state'],
  extra: {
    draft?: boolean;
    updated?: string;
    title?: string;
    labels?: string[];
    head?: string;
  } = {}
): PullRequestSummary {
  return {
    repo: { id: 'r1', host: 'jeryu', owner: 'jeryu', name: 'jeryu-web' },
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
      approvals: 1,
      changes_requested: 0,
      unresolved_threads: 0,
      user_review_state: null,
    },
    checks: { total: 2, passing: 2, failing: 0, pending: 0, skipped: 0 },
    agents: { active_sessions: 0, proposed_patches: 0, evidence_packets: 0, blockers: 0 },
    labels: extra.labels ?? [],
    updated_at: extra.updated ?? '2026-09-18T00:00:00Z',
    passport_hash: null,
    available_actions: [],
  } as PullRequestSummary;
}
