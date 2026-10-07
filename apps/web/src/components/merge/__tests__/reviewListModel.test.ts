// reviewListModel.test.ts — which review a link into the pull request names,
// and which reviews start open.

import { describe, expect, it } from 'vitest';

import { approvalRow } from '../../../test/fixtures/pullRequest';
import {
  changesRequestedReview,
  openReviewIds,
  reviewStateLabel,
  sortReviews,
  targetReviewId,
} from '../reviewListModel';

const APPROVED = approvalRow({ id: 'r1', author: 'dana', submitted_at: '2026-05-26T00:00:00Z' });
const ASKED_EARLIER = approvalRow({
  id: 'r2',
  author: 'globex-bot',
  state: 'CHANGES_REQUESTED',
  submitted_at: '2026-05-27T00:00:00Z',
  stale: true,
});
const ASKING = approvalRow({
  id: 'r3',
  author: 'globex-bot',
  state: 'CHANGES_REQUESTED',
  body_markdown: 'Fix the retry loop.',
  submitted_at: '2026-05-28T00:00:00Z',
});
const REVIEWS = [APPROVED, ASKED_EARLIER, ASKING];

describe('reviewListModel', () => {
  it('lists the newest review first', () => {
    expect(sortReviews(REVIEWS).map((review) => review.id)).toEqual(['r3', 'r2', 'r1']);
  });

  it('words the state plainly, whatever case the server sends', () => {
    expect(reviewStateLabel('CHANGES_REQUESTED')).toBe('Changes requested');
    expect(reviewStateLabel('request_changes')).toBe('Changes requested');
    expect(reviewStateLabel('APPROVED')).toBe('Approved');
    expect(reviewStateLabel('COMMENTED')).toBe('Commented');
  });

  it('finds the review asking for changes now, before one on an earlier head', () => {
    expect(changesRequestedReview(REVIEWS)?.id).toBe('r3');
    expect(changesRequestedReview([APPROVED, ASKED_EARLIER])?.id).toBe('r2');
    expect(changesRequestedReview([APPROVED])).toBeNull();
  });

  it('reads the hash: one review by id, or the review asking for changes', () => {
    expect(targetReviewId(REVIEWS, '#changes-requested')).toBe('r3');
    expect(targetReviewId(REVIEWS, '#review-r1')).toBe('r1');
    expect(targetReviewId(REVIEWS, '#review-missing')).toBeNull();
    expect(targetReviewId(REVIEWS, '#pr-threads')).toBeNull();
    expect(targetReviewId(REVIEWS, '')).toBeNull();
  });

  it('opens the review the link names, else the one the merge waits on', () => {
    expect([...openReviewIds(REVIEWS, '#review-r1')]).toEqual(['r1']);
    expect([...openReviewIds(REVIEWS, '')]).toEqual(['r3']);
    // A request on an earlier head no longer holds the merge: nothing opens by itself.
    expect([...openReviewIds([APPROVED, ASKED_EARLIER], '')]).toEqual([]);
  });
});
