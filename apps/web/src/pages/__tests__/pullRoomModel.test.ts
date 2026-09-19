import { describe, expect, it } from 'vitest';

import type { ControlPullRequest, PullRequestSummary } from '../../api/types';
import {
  DEFAULT_PULL_ROOM_FILTERS,
  filterPullRequests,
  fromControlPullRequest,
  groupPullRequests,
  cardFacts,
  familyOfRepo,
  familyPills,
  filterPullSummaries,
  isBoardView,
  OTHER_FAMILY,
  pullListState,
  reposToLoad,
  scopeToFamily,
  TIMELINE_REPO_LIMIT,
  stateWords,
  knownSha,
  pullRequestPath,
  pullRoomCounts,
  visibleLanes,
} from '../pullRoomModel';

describe('pullRoomModel', () => {
  it('carries the control-plane author login onto the card item', () => {
    expect(fromControlPullRequest(pr({ author: 'bob' })).author).toBe('bob');
    expect(fromControlPullRequest(pr({ author: '' })).author).toBeNull();
  });

  it('groups PRs into check posture lanes', () => {
    const items = [
      pr({ number: 1, checks: { total: 0, missing: true } }),
      pr({ number: 2, checks: { total: 2, failing: 1 } }),
      pr({ number: 3, checks: { total: 1, running: 1 } }),
      pr({ number: 4, checks: { total: 2, successful: 2 } }),
      pr({ number: 5, state: 'merged', checks: { total: 2, successful: 2 } }),
    ].map(fromControlPullRequest);

    const lanes = groupPullRequests(items);

    expect(lanes.find((lane) => lane.id === 'missing_checks')?.items).toHaveLength(1);
    expect(lanes.find((lane) => lane.id === 'failing_checks')?.items).toHaveLength(1);
    expect(lanes.find((lane) => lane.id === 'queued_running_checks')?.items).toHaveLength(1);
    expect(lanes.find((lane) => lane.id === 'ready_reviewable')?.items).toHaveLength(1);
    expect(lanes.find((lane) => lane.id === 'merged_closed')?.items).toHaveLength(1);
  });

  it('filters by repo, evidence state, check posture, and text', () => {
    const items = [
      pr({ repo: 'alice/jeryu', title: 'Fix cache key', stateEvidence: 'missing' }),
      pr({ repo: 'bob/api', title: 'Runner drain', checks: { total: 1, successful: 1 } }),
    ].map(fromControlPullRequest);

    expect(
      filterPullRequests(items, {
        ...DEFAULT_PULL_ROOM_FILTERS,
        repo: 'alice/jeryu',
        evidence: 'missing',
        checkPosture: 'missing',
        search: 'cache',
      }).map((item) => item.title)
    ).toEqual(['Fix cache key']);
  });

  it('hides merged and closed PRs by default and counts only active ones', () => {
    const items = [
      pr({ number: 1, state: 'blockedbychecks', checks: { total: 1, failing: 1 } }),
      pr({ number: 2, state: 'merged', checks: { total: 1, failing: 1 } }),
      pr({ number: 3, state: 'closed', checks: { total: 1, failing: 1 } }),
      pr({ number: 4, state: 'draft', draft: true }),
    ].map(fromControlPullRequest);

    expect(
      filterPullRequests(items, DEFAULT_PULL_ROOM_FILTERS).map((item) => item.number)
    ).toEqual([1, 4]);
    expect(
      filterPullRequests(items, { ...DEFAULT_PULL_ROOM_FILTERS, state: 'all' })
    ).toHaveLength(4);
    expect(pullRoomCounts(items)).toEqual({ open: 2, missingChecks: 1, failingChecks: 1 });
  });

  it('shows only lanes that hold something', () => {
    const items = [pr({ number: 2, checks: { total: 2, failing: 1 } })].map(fromControlPullRequest);
    expect(visibleLanes(groupPullRequests(items)).map((lane) => lane.id)).toEqual(['failing_checks']);
    expect(visibleLanes(groupPullRequests([]))).toEqual([]);
  });

  it('gives a card one chip per fact and drops placeholders', () => {
    const mergeable = fromControlPullRequest(
      pr({ state: 'mergeable', mergeable: true, mergeableState: 'mergeable', checks: { total: 1, failing: 1 } })
    );
    expect(cardFacts({ ...mergeable, evidenceState: 'failed' })).toEqual([
      'can merge',
      'checks failing',
      'jankurai proof failing',
    ]);
    // The API's one-token states read as words; a waiting pull request is not "blocked" twice.
    const waiting = fromControlPullRequest(
      pr({ state: 'blockedbychecks', mergeable: false, mergeableState: 'blocked' })
    );
    expect(cardFacts({ ...waiting, evidenceState: 'missing' })).toEqual([
      'waiting on checks',
      `checks ${waiting.checkPosture}`,
      'no jankurai proof',
    ]);
    expect(stateWords('blockedbychecks')).toBe('waiting on checks');
    expect(stateWords('some_new_state')).toBe('some_new_state');
    const open = fromControlPullRequest(pr({ mergeable: false, mergeableState: 'unknown' }));
    expect(cardFacts({ ...open, changedFileCount: 1, evidenceState: 'fresh' })).toEqual([
      'open',
      `checks ${open.checkPosture}`,
      '1 file',
    ]);
    expect(knownSha('fa808afe1234')).toBe('fa808afe');
    expect(knownSha('base')).toBeNull();
    expect(knownSha('unknown')).toBeNull();
    expect(knownSha('')).toBeNull();
  });
  it('files a repo under its family, and one the forge gives no family under "other"', () => {
    const families = new Map<string, string | null>([
      ['veox/jain-web', 'jain'],
      ['veox/jain-lambda', null],
    ]);
    expect(familyOfRepo('veox/jain-web', families)).toBe('jain');
    expect(familyOfRepo('veox/jain-lambda', families)).toBe(OTHER_FAMILY);
    expect(familyOfRepo('nobody/knows', families)).toBe(OTHER_FAMILY);
  });

  it('makes one pill per family with a pull request in flight, "other" last, finished ones ignored', () => {
    const families = new Map<string, string | null>([
      ['a/web', 'zeta'],
      ['a/api', 'alpha'],
      ['a/misc', null],
    ]);
    const items = [
      fromControlPullRequest(pr({ repo: 'a/web', number: 1 })),
      fromControlPullRequest(pr({ repo: 'a/web', number: 2 })),
      fromControlPullRequest(pr({ repo: 'a/api', number: 3 })),
      fromControlPullRequest(pr({ repo: 'a/misc', number: 4 })),
      fromControlPullRequest(pr({ repo: 'a/api', number: 5, state: 'merged' })),
    ];
    expect(familyPills(items, families)).toEqual([
      { family: 'alpha', count: 1 },
      { family: 'zeta', count: 2 },
      { family: 'other', count: 1 },
    ]);
    expect(scopeToFamily(items, 'zeta', families).map((item) => item.number)).toEqual([1, 2]);
    expect(scopeToFamily(items, 'other', families).map((item) => item.number)).toEqual([4]);
    expect(scopeToFamily(items, '', families)).toHaveLength(5);
  });

  it('asks only the repos the snapshot names, and caps how many', () => {
    const few = [
      fromControlPullRequest(pr({ repo: 'b/two', number: 1 })),
      fromControlPullRequest(pr({ repo: 'a/one', number: 2 })),
      fromControlPullRequest(pr({ repo: 'a/one', number: 3 })),
    ];
    expect(reposToLoad(few)).toEqual({ repos: ['a/one', 'b/two'], skipped: 0 });
    const many = Array.from({ length: TIMELINE_REPO_LIMIT + 3 }, (_, n) =>
      fromControlPullRequest(pr({ repo: `o/r${String(n).padStart(2, '0')}`, number: n + 1 }))
    );
    const wanted = reposToLoad(many);
    expect(wanted.repos).toHaveLength(TIMELINE_REPO_LIMIT);
    expect(wanted.skipped).toBe(3);
  });

  it('loads open lists unless the state filter asks for finished pull requests', () => {
    expect(pullListState('active')).toBe('open');
    expect(pullListState('mergeable')).toBe('open');
    expect(pullListState('draft')).toBe('open');
    expect(pullListState('all')).toBeUndefined();
    expect(pullListState('merged')).toBeUndefined();
    expect(pullListState('closed')).toBeUndefined();
  });

  it('reads the older ?view=queue as the board', () => {
    expect(isBoardView('board')).toBe(true);
    expect(isBoardView('queue')).toBe(true);
    expect(isBoardView('timeline')).toBe(false);
    expect(isBoardView(null)).toBe(false);
  });

  it('filters list summaries the way the board filters its cards', () => {
    const base = {
      entity: { kind: 'pull_request', id: 'x' },
      author: 'alice',
      head_ref: 'feature',
      base_ref: 'main',
      head_sha: 'abc',
      base_sha: 'def',
      draft: false,
      mergeable: { level: 'mergeable', can_merge: true, reason: null, exact_head_sha: 'abc', required_gate: null },
      review: { required_approvals: 1, approvals: 1, changes_requested: 0, unresolved_threads: 0, user_review_state: null },
      agents: { active_sessions: 0, proposed_patches: 0, evidence_packets: 0, blockers: 0 },
      labels: [],
      updated_at: '2026-09-19T00:00:00Z',
      passport_hash: null,
      available_actions: [],
    };
    const summaries: PullRequestSummary[] = [
      { ...base, repo: { id: '1', host: 'jeryu', owner: 'a', name: 'web' }, number: 1, title: 'Fix the list', state: 'open', checks: { total: 1, passing: 1, failing: 0, pending: 0, skipped: 0 } },
      { ...base, repo: { id: '1', host: 'jeryu', owner: 'a', name: 'web' }, number: 2, title: 'Draft idea', state: 'open', draft: true, checks: { total: 0, passing: 0, failing: 0, pending: 0, skipped: 0 } },
      { ...base, repo: { id: '2', host: 'jeryu', owner: 'a', name: 'api' }, number: 3, title: 'Old work', state: 'merged', checks: { total: 1, passing: 1, failing: 0, pending: 0, skipped: 0 } },
    ];
    const numbers = (filters: Partial<typeof DEFAULT_PULL_ROOM_FILTERS>) =>
      filterPullSummaries(summaries, { ...DEFAULT_PULL_ROOM_FILTERS, ...filters }).map((p) => p.number);
    expect(numbers({})).toEqual([1, 2]);
    // The snapshot's word for an open pull request ("mergeable") must not hide the list's "open".
    expect(numbers({ state: 'mergeable' })).toEqual([1, 2]);
    expect(numbers({ state: 'draft' })).toEqual([2]);
    expect(numbers({ state: 'merged' })).toEqual([3]);
    expect(numbers({ state: 'all' })).toEqual([1, 2, 3]);
    expect(numbers({ search: 'fix' })).toEqual([1]);
    expect(numbers({ repo: 'a/api', state: 'all' })).toEqual([3]);
    expect(numbers({ checkPosture: 'missing' })).toEqual([2]);
  });
});

type PrOverrides = Omit<Partial<ControlPullRequest>, 'checks'> & {
  checks?: Partial<ControlPullRequest['checks']>;
};

describe('pullRequestPath', () => {
  it('spells a pull request page one way, never with an encoded slash', () => {
    expect(pullRequestPath('jeryu', 'veox-ai/ai-veox-app', 1)).toBe('/repos/jeryu/veox-ai/ai-veox-app/pulls/1');
    expect(pullRequestPath('jeryu', 'odd owner/na me', 7)).toBe('/repos/jeryu/odd%20owner/na%20me/pulls/7');
  });
});

function pr(overrides: PrOverrides = {}): ControlPullRequest {
  return {
    repo: overrides.repo ?? 'alice/jeryu',
    number: overrides.number ?? 1,
    title: overrides.title ?? `PR ${overrides.number ?? 1}`,
    author: overrides.author ?? 'alice',
    draft: overrides.draft ?? false,
    state: overrides.state ?? 'open',
    headRef: overrides.headRef ?? 'feature',
    headSha: overrides.headSha ?? 'head',
    baseRef: overrides.baseRef ?? 'main',
    baseSha: overrides.baseSha ?? 'base',
    mergeable: overrides.mergeable ?? false,
    mergeableState: overrides.mergeableState ?? 'blocked',
    changedFiles: overrides.changedFiles ?? [],
    stateEvidence: overrides.stateEvidence ?? 'fresh',
    sourceLinks: overrides.sourceLinks ?? [],
    checks: {
      total: 0,
      queued: 0,
      running: 0,
      failing: 0,
      successful: 0,
      missing: false,
      ...overrides.checks,
    },
  };
}
