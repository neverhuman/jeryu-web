import { describe, expect, it } from 'vitest';

import type { PullRequestDetail } from '../../../api/types';
import {
  approvalsLabel,
  approveAvailability,
  approveRefusal,
  draftReviewNote,
  failingChecksBlockMerge,
  isSettled,
  primaryAction,
  pullStateBadge,
  settledLine,
} from '../pullReviewModel';

const SHA = 'abcdef1234567890abcdef1234567890abcdef12';

function detail(over: {
  state?: 'open' | 'closed' | 'merged';
  draft?: boolean;
  passport?: 'pass' | 'blocked';
  approvals?: number;
  required?: number;
  changesRequested?: number;
  extra?: Record<string, unknown>;
}): PullRequestDetail {
  const passport = over.passport ?? 'pass';
  const base: PullRequestDetail = {
    summary: {
      repo: { id: 'r1', host: 'jeryu', owner: 'jeryu', name: 'jeryu-web' },
      number: 38,
      entity: { kind: 'pull_request', id: 'r1#38' },
      title: 'Ready to pin',
      author: 'alton2',
      head_ref: 'alton/pin-visibility',
      base_ref: 'main',
      head_sha: SHA,
      base_sha: SHA,
      state: over.state ?? 'open',
      draft: over.draft ?? false,
      mergeable: {
        level: passport === 'pass' ? 'mergeable' : 'blocked',
        can_merge: passport === 'pass',
        reason: null,
        exact_head_sha: SHA,
        required_gate: null,
      },
      review: {
        required_approvals: over.required ?? 1,
        approvals: over.approvals ?? 0,
        changes_requested: over.changesRequested ?? 0,
        unresolved_threads: 0,
        user_review_state: null,
      },
      checks: { total: 1, passing: 0, failing: 1, pending: 0, skipped: 0 },
      agents: { active_sessions: 0, proposed_patches: 0, evidence_packets: 0, blockers: 0 },
      labels: [],
      updated_at: '2026-09-19T15:00:00Z',
      passport_hash: null,
      available_actions: [],
    },
    description: null,
    merge_passport: { status: passport, head_sha: SHA, blockers: [], evaluated_at: '2026-09-19T15:00:00Z' },
    passport_hash: null,
  };
  return { ...base, ...(over.extra ?? {}) };
}

describe('pull review model', () => {
  it('names the state, with Draft only for an open draft', () => {
    expect(pullStateBadge({ state: 'open', draft: false }).label).toBe('Open');
    expect(pullStateBadge({ state: 'open', draft: true }).label).toBe('Draft');
    expect(pullStateBadge({ state: 'merged', draft: true }).label).toBe('Merged');
    expect(pullStateBadge({ state: 'closed', draft: false }).tone).toBe('closed');
  });

  it('treats merged and closed pull requests as settled, and honours the server flag', () => {
    expect(isSettled(detail({ state: 'open' }))).toBe(false);
    expect(isSettled(detail({ state: 'merged', passport: 'blocked' }))).toBe(true);
    expect(isSettled(detail({ state: 'closed' }))).toBe(true);
    expect(isSettled(detail({ state: 'open', extra: { merge_applicable: false } }))).toBe(true);
    expect(isSettled(detail({ state: 'open', extra: { merge_applicable: 'no' } }))).toBe(false);
    expect(settledLine(detail({ state: 'merged' }).summary)).toBe(
      'Merged into main. Nothing is waiting on this pull request.'
    );
  });

  it('words approvals for a person', () => {
    expect(approvalsLabel(detail({ approvals: 1, required: 0 }).summary.review)).toBe(
      '1 approval (none required)'
    );
    expect(approvalsLabel(detail({ approvals: 0, required: 0 }).summary.review)).toBe(
      '0 approvals (none required)'
    );
    expect(approvalsLabel(detail({ approvals: 1, required: 2 }).summary.review)).toBe(
      '1 of 2 approvals'
    );
  });

  it('picks exactly one primary action', () => {
    expect(primaryAction(detail({ approvals: 0, required: 1 }))).toBe('approve');
    expect(primaryAction(detail({ approvals: 1, required: 1 }))).toBe('merge');
    expect(primaryAction(detail({ approvals: 1, required: 1, changesRequested: 1 }))).toBe('approve');
    expect(primaryAction(detail({ approvals: 1, required: 1, passport: 'blocked' }))).toBe('approve');
    expect(primaryAction(detail({ state: 'merged', approvals: 1, required: 1 }))).toBe('none');
  });

  it('a failing check blocks the merge only when the passport does not pass', () => {
    expect(failingChecksBlockMerge(detail({ passport: 'pass' }))).toBe(false);
    expect(failingChecksBlockMerge(detail({ passport: 'blocked' }))).toBe(true);
  });
});

describe('approveAvailability', () => {
  it('refuses the author their own approval and names the short SHA', () => {
    const availability = approveAvailability(detail({}), 'alton2');
    expect(availability.enabled).toBe(false);
    expect(availability.reason).toContain('You opened this pull request');
    expect(availability.reason).toContain('other than alton2');
    expect(availability.reason).toContain(SHA.slice(0, 7));
  });

  it('matches the author across the @ prefix and letter case', () => {
    expect(approveAvailability(detail({}), '@Alton2').enabled).toBe(false);
  });

  it('leaves the button live for another reviewer or an unknown viewer', () => {
    expect(approveAvailability(detail({}), 'reviewer')).toEqual({
      enabled: true,
      reason: null,
    });
    expect(approveAvailability(detail({}), null).enabled).toBe(true);
    expect(approveAvailability(detail({}), '').enabled).toBe(true);
  });
});

describe('draftReviewNote', () => {
  it('explains that a draft takes the review but not the merge', () => {
    expect(draftReviewNote(detail({ draft: true }))).toMatch(
      /merge waits until it is marked ready/
    );
  });

  it('says nothing for a ready or a settled pull request', () => {
    expect(draftReviewNote(detail({}))).toBeNull();
    expect(draftReviewNote(detail({ draft: true, state: 'merged' }))).toBeNull();
  });
});

describe('approveRefusal', () => {
  const pr = detail({});

  it('names the shared identity and the independent reviewer needed', () => {
    const refusal = approveRefusal(
      {
        status: 403,
        code: 'pull_self_approval_forbidden',
        message: 'pull request authors cannot approve their own changes',
        details: { author: 'alton', reviewer: 'alton' },
      },
      pr
    );
    expect(refusal.message).toBe(
      'pull request authors cannot approve their own changes'
    );
    expect(refusal.guidance).toContain('signed in as alton, which is also the author');
    expect(refusal.guidance).toContain('independent authenticated reviewer');
    expect(refusal.guidance).toContain(SHA.slice(0, 7));
  });

  it('falls back to the summary author when the server sends no details', () => {
    const refusal = approveRefusal(
      {
        status: 403,
        code: 'pull_self_approval_forbidden',
        message: 'no',
        details: undefined,
      },
      pr
    );
    expect(refusal.guidance).toContain('signed in as the author (alton2)');
  });

  it('asks for reviewer access on any other 403', () => {
    expect(
      approveRefusal(
        { status: 403, code: 'permission_denied', message: 'nope', details: {} },
        pr
      ).guidance
    ).toContain('no reviewer access on the repository');
  });

  it('asks for the draft to be marked ready', () => {
    expect(
      approveRefusal(
        {
          status: 409,
          code: 'pull_is_draft',
          message: 'draft',
          details: {},
        },
        pr
      ).guidance
    ).toContain('mark the pull request ready for review');
  });

  it('asks for a refresh on anything else', () => {
    expect(
      approveRefusal(
        { status: 500, code: 'internal', message: 'boom', details: {} },
        pr
      ).guidance
    ).toContain('Refresh the pull request');
  });
});
