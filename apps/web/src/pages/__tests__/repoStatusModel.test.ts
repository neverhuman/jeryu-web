import { describe, expect, it } from 'vitest';

import {
  MIRROR_OPERATOR_SENTENCE,
  attentionRank,
  failingChecks,
  failingLabel,
  mirrorFacts,
  mirrorFailing,
  summaryLines,
  whatToDo,
  newerCopies,
} from '../repoStatusModel';

describe('repoStatusModel', () => {
  it('chooses one next step by check name', () => {
    expect(whatToDo('jankurai/proof')).toMatch(/^Raise the audit score to the floor/);
    expect(whatToDo('jeryu/github-mirror')).toBe(MIRROR_OPERATOR_SENTENCE);
    expect(whatToDo('pr-gate-runner')).toMatch(/required gate is red/);
    expect(whatToDo('jeryu-web/required')).toMatch(/required gate is red/);
    expect(whatToDo('something-else')).toBe('Open the check for its log.');
  });

  it('lists each failing check once, by its newest run, with its own words', () => {
    const checks = failingChecks({
      check_runs: [
        {
          name: 'jankurai/proof',
          conclusion: 'failure',
          completed_at: '2026-09-19T17:00:00Z',
          output: {
            title: 'score 84 < floor 85',
            summary: '- score: 84\n- floor: 85\n\n- caps applied: missing-rendered-ux-qa-lane\n- hard findings: 0\n- more',
          },
        },
        // The same check, an older duplicate.
        { name: 'jankurai/proof', conclusion: 'failure', completed_at: '2026-09-19T16:00:00Z' },
        // Failed once, passed since: not failing.
        { name: 'jeryu-web/required', conclusion: 'failure', completed_at: '2026-09-19T15:00:00Z' },
        { name: 'jeryu-web/required', conclusion: 'success', completed_at: '2026-09-19T16:30:00Z' },
        {
          name: 'jeryu/github-mirror',
          conclusion: 'failure',
          completed_at: '2026-09-19T17:35:00Z',
          details_url: ' https://example.test/run/1 ',
        },
        { conclusion: 'failure' },
      ],
    });
    expect(checks.map((c) => c.name)).toEqual(['jankurai/proof', 'jeryu/github-mirror']);
    expect(checks[0].title).toBe('score 84 < floor 85');
    expect(checks[0].summary).toEqual([
      'score: 84',
      'floor: 85',
      'caps applied: missing-rendered-ux-qa-lane',
      'hard findings: 0',
    ]);
    expect(checks[1].detailsUrl).toBe('https://example.test/run/1');
    expect(checks[1].whatToDo).toBe(MIRROR_OPERATOR_SENTENCE);
  });

  it('never throws on an empty or partial answer', () => {
    expect(failingChecks(null)).toEqual([]);
    expect(failingChecks({})).toEqual([]);
    expect(summaryLines(null)).toEqual([]);
    expect(summaryLines('x'.repeat(300))[0]).toHaveLength(220);
  });

  it('reads the mirror, and ranks what needs a person first', () => {
    const failing = {
      configured: true,
      last_attempt_at: '2026-09-19T17:35:49Z',
      last_attempt_ok: false,
      last_attempt_conclusion: 'failure',
      last_success_at: null,
    };
    expect(mirrorFailing(failing)).toBe(true);
    expect(mirrorFailing(null)).toBe(false);
    expect(mirrorFailing({ ...failing, last_attempt_ok: true })).toBe(false);
    expect(failingLabel(1)).toBe('1 failing check');
    expect(failingLabel(3)).toBe('3 failing checks');
    expect(attentionRank({ failing_checks: 1, mirror: null })).toBeGreaterThan(
      attentionRank({ failing_checks: 0, mirror: failing })
    );
    expect(attentionRank({ failing_checks: 0, mirror: failing })).toBeGreaterThan(
      attentionRank({ failing_checks: 0, mirror: null })
    );

    expect(mirrorFacts(null)).toMatchObject({
      configured: false,
      headline: 'This repository is not mirrored to GitHub.',
    });
    expect(mirrorFacts(failing)).toMatchObject({
      configured: true,
      failing: true,
      lastAttempt: 'failure',
      lastSuccessAt: null,
    });
    expect(mirrorFacts({ ...failing, last_attempt_ok: true, last_success_at: failing.last_attempt_at })).toMatchObject({
      failing: false,
      lastAttempt: 'success',
    });
  });
});

describe('newerCopies', () => {
  const repo = (owner: string, name: string, updated_at: string | null) => ({
    id: { owner, name },
    updated_at,
  });

  it('points the older of two same-named repositories at the newer one', () => {
    const copies = newerCopies([
      repo('jeryu', 'jain', '2026-07-08T00:00:00Z'),
      repo('veox', 'jain', '2026-09-19T00:00:00Z'),
      repo('veox', 'jain-deploy', '2026-09-19T00:00:00Z'),
    ]);
    expect([...copies]).toEqual([['jeryu/jain', { owner: 'veox', name: 'jain' }]]);
  });

  it('leaves copies updated within a week of each other alone, and unique names', () => {
    expect(
      newerCopies([
        repo('veox', 'ai-veox-app', '2026-09-19T10:00:00Z'),
        repo('veox-ai', 'ai-veox-app', '2026-09-19T12:00:00Z'),
        repo('jeryu', 'jeryu-web', null),
      ]).size
    ).toBe(0);
  });

  it('treats a missing or bad date as oldest, never as newest', () => {
    const copies = newerCopies([
      repo('a', 'x', 'not a date'),
      repo('b', 'x', '2026-09-19T00:00:00Z'),
    ]);
    expect(copies.get('a/x')).toEqual({ owner: 'b', name: 'x' });
    expect(copies.has('b/x')).toBe(false);
  });
});
