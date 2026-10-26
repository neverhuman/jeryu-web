// mergeBoxModel.test.ts — the checklist behind the one merge box.
//
// The page used to say BLOCKED four times and never say what to do about it.
// The model here owes the reader: one headline, one row per thing the merge
// waits for, and a link on every row whose answer lives on another tab.

import { describe, expect, it } from 'vitest';

import {
  failingRequiredChecks,
  mergeBlockers,
  mergeChecklist,
  mergeHeadline,
  rowForGate,
  sayBlockersOnce,
} from '../mergeBoxModel';
import { gateExplanation, gateTitle } from '../passportGates';
import {
  pullChecks,
  pullDetail,
} from '../../../test/fixtures/pullRequest';

const HREFS = {
  threads: '/pulls/32#pr-threads',
  conversation: '/pulls/32',
  checks: '/pulls/32/checks',
  commits: '/pulls/32/commits',
};

function rowsFor(
  detail = pullDetail(),
  checks = pullChecks({ requiredFailing: true })
): ReturnType<typeof mergeChecklist> {
  return mergeChecklist(detail, checks, HREFS);
}

describe('mergeChecklist', () => {
  it('always lists the four standing rows, in reading order', () => {
    const keys = rowsFor().map((row) => row.key);
    expect(keys).toEqual(['approvals', 'checks', 'threads', 'draft']);
  });

  it('counts an unmet approval and a failing required check as the blockers', () => {
    const blockers = mergeBlockers(rowsFor());
    expect(blockers.map((row) => row.key)).toEqual(['approvals', 'checks']);
    // Each one points at the tab that answers it.
    expect(blockers[0]?.href).toBe(HREFS.commits);
    expect(blockers[1]?.href).toBe(HREFS.checks);
    expect(blockers[0]?.label).toBe('0 of 1 approvals');
    expect(blockers[1]?.label).toBe('1 required check failing');
  });

  it('says nothing is waiting when every row is done', () => {
    const rows = mergeChecklist(
      pullDetail({ passport: 'pass', approvals: 1, required_approvals: 1 }),
      pullChecks(),
      HREFS
    );
    expect(mergeBlockers(rows)).toHaveLength(0);
    expect(rows.map((row) => row.state)).toEqual(['done', 'done', 'done', 'done']);
  });

  it('counts unresolved threads and a draft, each with its own row', () => {
    const rows = mergeChecklist(
      pullDetail({
        passport: 'pass',
        approvals: 1,
        required_approvals: 1,
        unresolved_threads: 2,
        draft: true,
      }),
      pullChecks(),
      HREFS
    );
    const blockers = mergeBlockers(rows);
    expect(blockers.map((row) => row.key)).toEqual(['threads', 'draft']);
    expect(blockers[0]?.label).toBe('2 unresolved threads');
    expect(blockers[0]?.href).toBe(HREFS.threads);
    // The draft is cleared from inside the box, so the row carries no link.
    expect(blockers[1]?.href).toBeNull();
  });

  it('waits for the checks rather than calling them green', () => {
    const rows = mergeChecklist(pullDetail({ passport: 'pass' }), null, HREFS, {
      checksLoading: true,
    });
    const checksRow = rows.find((row) => row.key === 'checks');
    expect(checksRow?.state).toBe('unknown');
    expect(mergeBlockers(rows).map((row) => row.key)).toEqual(['approvals']);
  });

  it('keeps a Passport gate the four rows do not already say', () => {
    const rows = mergeChecklist(
      pullDetail({
        approvals: 1,
        required_approvals: 1,
        blockers: [
          {
            code: 'passport_blocked_codeowners',
            message: 'CODEOWNERS have not approved.',
            details: '@acme/security owns src/login.rs',
          },
        ],
      }),
      pullChecks(),
      HREFS
    );
    const gate = rows.find((row) => row.key === 'passport_blocked_codeowners');
    expect(gate?.state).toBe('needed');
    expect(gate?.label).toBe('CODEOWNERS approval required');
    expect(gate?.hint).toContain('@acme/security owns src/login.rs');
  });

  it('names an advisory failure without making it a blocker', () => {
    const rows = mergeChecklist(
      pullDetail({ passport: 'pass', approvals: 1, required_approvals: 1 }),
      pullChecks({
        failing: 1,
        passing: 0,
        checks: [
          {
            id: 'advisory-1',
            name: 'jankurai/proof',
            kind: 'check_run',
            status: 'failure',
            conclusion: 'failure',
            details_url: null,
            description: 'score 42 below the floor of 85',
            required: false,
            advisory: null,
            started_at: null,
            completed_at: null,
          },
        ],
      }),
      HREFS
    );
    const checksRow = rows.find((row) => row.key === 'checks');
    expect(checksRow?.state).toBe('done');
    expect(checksRow?.hint).toContain('the merge does not wait for them');
  });
});

describe('mergeHeadline', () => {
  // The head is named in the verdict: a reader who came from a review of an
  // earlier head has to be able to see which head this is about.
  it('counts the blockers, singular and plural, and names the current head', () => {
    expect(mergeHeadline(pullDetail(), rowsFor())).toBe(
      'Blocked at abcdef1: 2 things need doing'
    );
    const oneLeft = mergeChecklist(pullDetail(), pullChecks(), HREFS);
    expect(mergeHeadline(pullDetail(), oneLeft)).toBe(
      'Blocked at abcdef1: 1 thing needs doing'
    );
  });

  it('says ready when nothing is waiting', () => {
    const detail = pullDetail({
      passport: 'pass',
      approvals: 1,
      required_approvals: 1,
    });
    expect(
      mergeHeadline(detail, mergeChecklist(detail, pullChecks(), HREFS))
    ).toBe('Ready to merge at abcdef1');
  });

  it('states a settled pull request rather than a verdict', () => {
    const merged = pullDetail({ state: 'merged' });
    expect(mergeHeadline(merged, mergeChecklist(merged, pullChecks(), HREFS))).toBe(
      'Merged'
    );
    const closed = pullDetail({ state: 'closed' });
    expect(mergeHeadline(closed, mergeChecklist(closed, pullChecks(), HREFS))).toBe(
      'Closed'
    );
  });
});

describe('failingRequiredChecks', () => {
  it('counts only the checks the base branch waits for', () => {
    expect(failingRequiredChecks(pullChecks({ requiredFailing: true }))).toBe(1);
    expect(failingRequiredChecks(pullChecks())).toBe(0);
    expect(failingRequiredChecks(null)).toBe(0);
  });
});

describe('saying each blocker once', () => {
  const row = (key: string, state: 'done' | 'needed' | 'unknown') => ({
    key,
    label: key,
    hint: '',
    state,
    href: null,
  });

  it('lets the gate line say a blocker, and keeps what is met', () => {
    const rows = [row('approvals', 'needed'), row('checks', 'needed'), row('threads', 'done')];
    const reasons = [
      { code: 'passport_blocked_checks' },
      { code: 'passport_blocked_changes_requested' },
    ];
    const once = sayBlockersOnce(rows, reasons);
    // Checks and the approvals row (changes requested is its to say) are the
    // gate lines'; the met row stays.
    expect(once.rows.map((r) => r.key)).toEqual(['threads']);
    expect(once.reasons).toEqual(reasons);
  });

  it('keeps a needed row that holds its own control, and drops the line that repeats it', () => {
    const rows = [row('draft', 'needed'), row('checks', 'needed')];
    const reasons = [{ code: 'passport_blocked_draft' }, { code: 'passport_blocked_checks' }];
    const once = sayBlockersOnce(rows, reasons, (r) => r.key === 'draft');
    expect(once.rows.map((r) => r.key)).toEqual(['draft']);
    expect(once.reasons.map((r) => r.code)).toEqual(['passport_blocked_checks']);
  });

  it('maps a gate the standing rows do not cover to its own row', () => {
    expect(rowForGate('passport_blocked_changes_requested')).toBe('approvals');
    expect(rowForGate('passport_blocked_codeowners')).toBe('passport_blocked_codeowners');
  });

  it('never shows a raw gate code as a label', () => {
    expect(gateExplanation({ code: 'passport_blocked_changes_requested', message: 'x' }).title).toBe(
      'Changes requested'
    );
    expect(gateTitle('passport_blocked_new_rule')).toBe('New rule');
    expect(gateExplanation({ code: 'passport_blocked_new_rule', message: 'A new rule.' })).toEqual({
      title: 'New rule',
      hint: 'A new rule.',
    });
  });
});
