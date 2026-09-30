// pullDraftModel.test.ts — the draft filter, the badge and who may move a draft.

import { describe, expect, it } from 'vitest';

import {
  canChangeDraft,
  draftBadgeLabel,
  draftCount,
  draftIdleDays,
  filterByDraft,
  parseDraftFilter,
} from '../pullDraftModel';

const NOW = Date.parse('2026-09-30T12:00:00Z');

function pr(
  over: Partial<{ draft: boolean; state: 'open' | 'closed' | 'merged' }>
): { draft: boolean; state: 'open' | 'closed' | 'merged' } {
  return { draft: over.draft ?? false, state: over.state ?? 'open' };
}

describe('the draft filter', () => {
  const pulls = [
    pr({ draft: true }),
    pr({}),
    pr({ state: 'merged' }),
    pr({ state: 'closed' }),
  ];

  it('reads the URL value, and anything unknown as All', () => {
    expect(parseDraftFilter('drafts')).toBe('drafts');
    expect(parseDraftFilter('ready')).toBe('ready');
    expect(parseDraftFilter(null)).toBe('all');
    expect(parseDraftFilter('sideways')).toBe('all');
  });

  it('narrows to open drafts, to open non-drafts, or to everything', () => {
    expect(filterByDraft(pulls, 'all')).toHaveLength(4);
    expect(filterByDraft(pulls, 'drafts')).toEqual([pulls[0]]);
    expect(filterByDraft(pulls, 'ready')).toEqual([pulls[1]]);
    expect(draftCount(pulls)).toBe(1);
  });
});

describe('how long a draft has sat', () => {
  it('counts whole days and ignores an unparseable or future stamp', () => {
    expect(draftIdleDays('2026-09-26T12:00:00Z', NOW)).toBe(4);
    expect(draftIdleDays('2026-09-30T11:00:00Z', NOW)).toBe(0);
    expect(draftIdleDays('2026-10-02T12:00:00Z', NOW)).toBeNull();
    expect(draftIdleDays('not a date', NOW)).toBeNull();
  });

  it('says only Draft on the first day, and the idle time after that', () => {
    expect(draftBadgeLabel('2026-09-30T11:00:00Z', NOW)).toBe('Draft');
    expect(draftBadgeLabel('2026-09-29T11:00:00Z', NOW)).toBe('Draft · idle 1 day');
    expect(draftBadgeLabel('2026-09-19T11:00:00Z', NOW)).toBe('Draft · idle 11 days');
    expect(draftBadgeLabel('not a date', NOW)).toBe('Draft');
  });
});

describe('who may change the draft state', () => {
  const summary = { author: 'dana', state: 'open' as const };

  it('offers it to the author and to an admin, and to nobody else', () => {
    expect(canChangeDraft(summary, { login: 'dana', role: 'user' })).toBe(true);
    expect(canChangeDraft(summary, { login: '@Dana', role: 'user' })).toBe(true);
    expect(canChangeDraft(summary, { login: 'root', role: 'admin' })).toBe(true);
    expect(canChangeDraft(summary, { login: 'mallory', role: 'user' })).toBe(false);
  });

  it('leaves it in place when the viewer is unknown, and never on a settled PR', () => {
    expect(canChangeDraft(summary, null)).toBe(true);
    expect(
      canChangeDraft({ author: 'dana', state: 'merged' }, { login: 'dana', role: 'user' })
    ).toBe(false);
  });
});
