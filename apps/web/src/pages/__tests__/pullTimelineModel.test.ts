import { describe, expect, it } from 'vitest';

import type { PullRequestSummary } from '../../api/types';
import { pullStages, timelineOrder, timelineSentence } from '../pullTimelineModel';

describe('pullTimelineModel', () => {
  const statuses = (p: PullRequestSummary) => pullStages(p).map((s) => s.status);

  it('walks a merged PR all the way to done', () => {
    // The sixth stage is `released`, and nothing has said where it shipped.
    expect(statuses(pr({ state: 'merged' }))).toEqual([
      'done',
      'done',
      'done',
      'done',
      'done',
      'unknown',
    ]);
  });

  it('keeps a merge over failing checks and without review visible', () => {
    const p = pr({
      state: 'merged',
      checks: { total: 2, passing: 0, failing: 2, pending: 0, skipped: 0 },
      review: { approvals: 0, required: 1 },
      canMerge: false,
    });
    expect(statuses(p)).toEqual(['done', 'blocked', 'skipped', 'done', 'done', 'unknown']);
  });

  it('stops at failing checks', () => {
    const stages = pullStages(pr({ checks: { total: 3, passing: 2, failing: 1, pending: 0, skipped: 0 }, canMerge: false }));
    expect(stages[1]).toMatchObject({ status: 'blocked', detail: '1 failing' });
    expect(stages[3].status).toBe('pending');
  });

  it('shows running checks and a missing approval as in progress', () => {
    const p = pr({
      checks: { total: 2, passing: 1, failing: 0, pending: 1, skipped: 0 },
      review: { approvals: 0, required: 1 },
      canMerge: false,
    });
    expect(statuses(p)).toEqual(['done', 'active', 'pending', 'pending', 'pending', 'pending']);
  });

  it('marks mergeability blocked when checks and review are green but merge is refused', () => {
    expect(pullStages(pr({ canMerge: false }))[3].status).toBe('blocked');
  });

  it('marks changes requested as blocked and a draft as still opening', () => {
    const p = pr({ draft: true, review: { approvals: 1, required: 2, changes: 1 }, canMerge: false });
    expect(statuses(p).slice(0, 3)).toEqual(['active', 'done', 'blocked']);
  });

  it('ends a closed PR blocked at merged and skips what it never reached', () => {
    const p = pr({ state: 'closed', review: { approvals: 0, required: 1 }, canMerge: false });
    expect(statuses(p)).toEqual(['done', 'done', 'skipped', 'skipped', 'blocked', 'skipped']);
  });

  it('reports where a merged PR shipped when the ladder says, and unknown when it does not', () => {
    const merged = pr({ state: 'merged' });
    const inCanary = pullStages(merged, {
      kind: 'channels',
      pips: [
        { id: 'dev', label: 'dev', membership: 'in', release: 'v9', at: null },
        { id: 'canary', label: 'canary', membership: 'in', release: 'v8', at: null },
        { id: 'production', label: 'prod', membership: 'out', release: null, at: null },
      ],
      furthest: 'canary',
      release: 'v8',
      uncertain: false,
    })[5];
    expect(inCanary).toMatchObject({ status: 'active', detail: 'canary \u00b7 v8' });
    // Without a ladder the stage says nothing was looked up, not "unreleased".
    expect(pullStages(merged)[5]).toMatchObject({ status: 'unknown', detail: 'release unknown' });
    expect(pullStages(pr({ state: 'open' }))[5]).toMatchObject({ status: 'pending', detail: 'not yet' });
  });

  it('adds the release manifest to the one-line summary once it is known', () => {
    const pulls = [pr({ number: 1 }), pr({ number: 2, state: 'merged' })];
    expect(timelineSentence(pulls, 3)).toBe(
      '1 open \u00b7 0 waiting on checks \u00b7 0 stopped by a failing check \u00b7 3 merged, not yet released'
    );
    expect(timelineSentence(pulls, 0)).toBe(
      '1 open \u00b7 0 waiting on checks \u00b7 0 stopped by a failing check'
    );
  });

  it('orders open PRs first, newest update first', () => {
    const rows = [
      pr({ number: 1, state: 'merged', updated: '2026-09-18T00:00:00Z' }),
      pr({ number: 2, updated: '2026-09-01T00:00:00Z' }),
      pr({ number: 3, updated: '2026-09-10T00:00:00Z' }),
    ].sort(timelineOrder);
    expect(rows.map((r) => r.number)).toEqual([3, 2, 1]);
  });
  it('says the page in one line, and a red check that does not stop the merge is not "stopped"', () => {
    const pulls = [
      pr({ number: 1 }),
      pr({ number: 2, checks: { total: 2, passing: 1, failing: 0, pending: 1, skipped: 0 } }),
      pr({ number: 3, checks: { total: 0, passing: 0, failing: 0, pending: 0, skipped: 0 } }),
      pr({ number: 4, checks: { total: 1, passing: 0, failing: 1, pending: 0, skipped: 0 }, canMerge: false }),
      // jankurai/proof red but not required: the forge says it can merge.
      pr({ number: 5, checks: { total: 2, passing: 1, failing: 1, pending: 0, skipped: 0 }, canMerge: true }),
      pr({ number: 6, state: 'merged' }),
    ];
    expect(timelineSentence(pulls)).toBe('5 open · 2 waiting on checks · 1 stopped by a failing check');
    expect(timelineSentence([])).toBe('0 open · 0 waiting on checks · 0 stopped by a failing check');
  });
});

function pr(o: {
  number?: number;
  state?: PullRequestSummary['state'];
  draft?: boolean;
  checks?: PullRequestSummary['checks'];
  review?: { approvals: number; required: number; changes?: number };
  canMerge?: boolean;
  updated?: string;
}): PullRequestSummary {
  return {
    repo: { id: 'repo-1', host: 'jeryu', owner: 'veox', name: 'jain-web' },
    number: o.number ?? 1,
    entity: { kind: 'pull_request', id: 'repo-1#1' },
    title: 'A change',
    author: 'alton',
    head_ref: 'feature',
    base_ref: 'main',
    head_sha: 'abc',
    base_sha: 'def',
    state: o.state ?? 'open',
    draft: o.draft ?? false,
    mergeable: {
      level: o.canMerge === false ? 'blocked' : 'mergeable',
      can_merge: o.canMerge ?? true,
      reason: null,
      exact_head_sha: 'abc',
      required_gate: null,
    },
    review: {
      required_approvals: o.review?.required ?? 1,
      approvals: o.review?.approvals ?? 1,
      changes_requested: o.review?.changes ?? 0,
      unresolved_threads: 0,
      user_review_state: null,
    },
    checks: o.checks ?? { total: 1, passing: 1, failing: 0, pending: 0, skipped: 0 },
    agents: { active_sessions: 0, proposed_patches: 0, evidence_packets: 0, blockers: 0 },
    labels: [],
    updated_at: o.updated ?? '2026-09-18T00:00:00Z',
    passport_hash: null,
    available_actions: [],
  } as PullRequestSummary;
}
