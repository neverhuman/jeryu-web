import { describe, expect, it } from 'vitest';

import type { ControlPullRequest } from '../../api/types';
import {
  DEFAULT_PULL_ROOM_FILTERS,
  filterPullRequests,
  fromControlPullRequest,
  groupPullRequests,
  cardFacts,
  knownSha,
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
      'mergeable',
      'checks failing',
      'evidence failed',
    ]);
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
});

type PrOverrides = Omit<Partial<ControlPullRequest>, 'checks'> & {
  checks?: Partial<ControlPullRequest['checks']>;
};

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
