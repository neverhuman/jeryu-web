// reviewHeadsModel.ts — where the review of a pull request stands, one line
// per head, newest first.
//
// A verdict is about the head it was taken on. A page that lists verdicts
// without saying which head is current reads a withdrawn hold as the live one
// (live on 2026-10-22: jeryu/jeryu-ci-runner#109 was held at 91beebd, the
// author pushed edd08c5, the reviewer started reading edd08c5 at 18:44, and
// the page still answered "hold" at 18:50). So the panel is keyed by head:
// the current head's own state first, then the heads before it, each marked
// as the earlier head it is.

import type { PullRequestReview } from '../../api/types';
import type { PullDetailPayload, PullReviewActivity } from '../../api/types';
import { compareInstants, relativeText } from '../../format/when';
import { isChangesRequestedState } from './reviewListModel';

/** Where the review of one head stands. */
export type ReviewHeadState = 'reviewing' | 'hold' | 'approved' | 'none';

/** The four words the current head's state is said in. */
export const REVIEW_HEAD_LABEL: Record<ReviewHeadState, string> = {
  reviewing: 'Reviewing',
  hold: 'Hold',
  approved: 'Approved',
  none: 'Not reviewed yet',
};

export interface ReviewHeadRow {
  sha: string;
  shortSha: string;
  /** True for the head the pull request is at now: the only row in force. */
  current: boolean;
  state: ReviewHeadState;
  /** `Hold`, `Approved`, `Reviewing`, `Not reviewed yet`. */
  label: string;
  /** When the running pass started; set only while `state` is `reviewing`. */
  since: string | null;
  /** When the verdict was recorded; null with no verdict on this head. */
  at: string | null;
  /** The review the verdict came from, for a `#review-<id>` link. */
  reviewId: string | null;
  /** Said on every row but the current head's; null on that one. */
  note: string | null;
}

function isApprovedState(state: string): boolean {
  const value = state.trim().toLowerCase();
  return value === 'approved' || value === 'approve';
}

/** The verdict a review records; a comment records none. */
function verdictOf(review: PullRequestReview): ReviewHeadState | null {
  if (isChangesRequestedState(review.state)) return 'hold';
  if (isApprovedState(review.state)) return 'approved';
  return null;
}

/** Newest first, so the verdict in force on a head is the first one found. */
function newestFirst(reviews: readonly PullRequestReview[]): PullRequestReview[] {
  return [...reviews].sort(
    (a, b) => compareInstants(b.submitted_at, a.submitted_at) || b.id.localeCompare(a.id)
  );
}

/**
 * One row per head, the pull request's current head first and the heads
 * before it after, newest verdict first.
 *
 * `activity` is the pass a reviewer reports as running (`review_activity` on
 * the pull request payload); absent, no row reads `Reviewing`, which is the
 * right answer for a forge that does not report it rather than a guess.
 */
export function reviewHeads(
  detail: Pick<PullDetailPayload, 'summary' | 'reviews'> & {
    review_activity?: PullReviewActivity | null;
  },
  activity: PullReviewActivity | null = detail.review_activity ?? null
): ReviewHeadRow[] {
  const headSha = detail.summary.head_sha;
  const reviews = newestFirst(
    (detail.reviews ?? []).filter((review) => Boolean(review.head_sha))
  );
  const heads: string[] = [headSha];
  for (const review of reviews) {
    const sha = review.head_sha as string;
    if (!heads.includes(sha)) heads.push(sha);
  }
  // A pass on a head nothing has reviewed yet is still a head to show.
  if (activity && !heads.includes(activity.sha)) heads.push(activity.sha);

  return heads.map((sha) => {
    const current = sha === headSha;
    const verdict = reviews.find(
      (review) => review.head_sha === sha && verdictOf(review) !== null
    );
    const state: ReviewHeadState =
      activity?.sha === sha ? 'reviewing' : (verdict && verdictOf(verdict)) || 'none';
    return {
      sha,
      shortSha: sha.slice(0, 7),
      current,
      state,
      label: REVIEW_HEAD_LABEL[state],
      since: state === 'reviewing' ? (activity?.started_at ?? null) : null,
      at: verdict?.submitted_at ?? null,
      reviewId: verdict?.id ?? null,
      note: current ? null : 'on an earlier head',
    };
  });
}

/**
 * The row as one plain-text line: `Reviewing since 6 min ago`, `Hold`,
 * `Approved`, `Not reviewed yet`. Used for the row's accessible name and by
 * the tests; the rendered row says the same with a hoverable instant.
 */
export function reviewHeadLine(row: ReviewHeadRow, now?: Date | number): string {
  const head = row.state === 'reviewing' && row.since
    ? `${row.label} since ${relativeText(row.since, now)}`
    : row.label;
  return row.note ? `${head} (${row.note})` : head;
}
