// The review panel is keyed by head: the current head's state is the answer,
// and every verdict below it is marked as the earlier head it was taken on.

import { describe, expect, it } from 'vitest';

import type { PullRequestReview } from '../../../api/types';
import { HEAD_SHA, pullDetail } from '../../../test/fixtures/pullRequest';
import { reviewHeadLine, reviewHeads } from '../reviewHeadsModel';

const OLD_HEAD = '91beebd9f2f4b1c3d5e7a9b1c3d5e7a9b1c3d5e7';
const NOW = new Date('2026-10-22T18:50:00Z');

function review(over: Partial<PullRequestReview> = {}): PullRequestReview {
  return {
    id: 'rv-1',
    author: 'pr-redteam',
    state: 'changes_requested',
    body_markdown: 'Round 2 of 4.',
    submitted_at: '2026-10-22T18:11:00Z',
    head_sha: OLD_HEAD,
    dismissed_review_id: null,
    effective: false,
    stale: true,
    ...over,
  };
}

describe('reviewHeads', () => {
  it('says the current head is not reviewed yet when nothing has looked at it', () => {
    const rows = reviewHeads(pullDetail());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sha: HEAD_SHA,
      current: true,
      state: 'none',
      label: 'Not reviewed yet',
      note: null,
    });
    expect(reviewHeadLine(rows[0], NOW)).toBe('Not reviewed yet');
  });

  // The defect: a hold at 91beebd, the fix pushed, the reviewer already on
  // it. One line per head says so; the hold is visibly history.
  it('puts the running review on the current head and marks the old hold stale', () => {
    const rows = reviewHeads(
      pullDetail({ reviews: [review()] }),
      { sha: HEAD_SHA, started_at: '2026-10-22T18:44:12Z' }
    );
    expect(rows.map((row) => row.sha)).toEqual([HEAD_SHA, OLD_HEAD]);
    expect(rows[0]).toMatchObject({ current: true, state: 'reviewing', note: null });
    expect(reviewHeadLine(rows[0], NOW)).toBe('Reviewing since 6 min ago');
    expect(rows[1]).toMatchObject({
      current: false,
      state: 'hold',
      label: 'Hold',
      note: 'on an earlier head',
      reviewId: 'rv-1',
      at: '2026-10-22T18:11:00Z',
    });
    expect(reviewHeadLine(rows[1], NOW)).toBe('Hold (on an earlier head)');
  });

  it('calls a hold on the current head a hold, with nobody reviewing', () => {
    const held = review({ head_sha: HEAD_SHA, effective: true, stale: false });
    const rows = reviewHeads(pullDetail({ reviews: [held] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: 'hold', label: 'Hold', note: null });
  });

  it('reads an approval of the current head as approved, newest verdict first', () => {
    const rows = reviewHeads(
      pullDetail({
        reviews: [
          review({ head_sha: HEAD_SHA, effective: true, stale: false }),
          review({
            id: 'rv-2',
            state: 'approved',
            submitted_at: '2026-10-22T18:46:00Z',
            head_sha: HEAD_SHA,
            effective: true,
            stale: false,
          }),
        ],
      })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: 'approved', reviewId: 'rv-2' });
  });

  it('ignores a comment with no verdict and keeps the head unreviewed', () => {
    const rows = reviewHeads(
      pullDetail({
        reviews: [
          review({ state: 'commented', head_sha: HEAD_SHA, effective: true, stale: false }),
        ],
      })
    );
    expect(rows[0]).toMatchObject({ state: 'none', label: 'Not reviewed yet' });
  });

  // A pass on a head that is itself gone must not read as the current head's.
  it('reports a review of an older head on that head, not on the current one', () => {
    const rows = reviewHeads(pullDetail(), {
      sha: OLD_HEAD,
      started_at: '2026-10-22T18:44:12Z',
    });
    expect(rows.map((row) => [row.sha, row.state])).toEqual([
      [HEAD_SHA, 'none'],
      [OLD_HEAD, 'reviewing'],
    ]);
    expect(reviewHeadLine(rows[1], NOW)).toBe(
      'Reviewing since 6 min ago (on an earlier head)'
    );
  });

  it('reads the activity off the payload when none is passed', () => {
    const detail = {
      ...pullDetail(),
      review_activity: { sha: HEAD_SHA, started_at: '2026-10-22T18:44:12Z' },
    };
    expect(reviewHeads(detail)[0].state).toBe('reviewing');
  });
});
