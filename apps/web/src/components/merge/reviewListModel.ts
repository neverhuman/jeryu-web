// reviewListModel.ts — the reviews of a pull request, in reading order, and
// which one a link into the page is about.
//
// A review that asks for changes is the reason a pull request cannot merge,
// so a "Changes requested" row links straight to it: `#review-<id>` names one
// review, and `#changes-requested` names whichever review currently asks for
// changes, for a link that does not know the review's id.

import type { PullRequestReview } from '../../api/types';
import { compareInstants } from '../../format/when';

/** The hash a link uses for "the review that asks for changes". */
export const CHANGES_REQUESTED_ANCHOR = 'changes-requested';

/** The element id of one review on the Conversation tab. */
export function reviewAnchor(id: string): string {
  return `review-${id}`;
}

function normalState(state: string): string {
  return state.trim().toLowerCase();
}

export function isChangesRequestedState(state: string): boolean {
  const value = normalState(state);
  return value === 'changes_requested' || value === 'request_changes';
}

/** "Changes requested", "Approved", "Commented": the state in words. */
export function reviewStateLabel(state: string): string {
  if (isChangesRequestedState(state)) return 'Changes requested';
  const value = normalState(state);
  if (value === 'approved' || value === 'approve') return 'Approved';
  if (value === 'commented' || value === 'comment') return 'Commented';
  if (value === 'dismissed') return 'Dismissed';
  const words = value.replace(/_+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Reviewed';
}

/** Newest first: the review a reader came for is usually the latest one. */
export function sortReviews(reviews: readonly PullRequestReview[]): PullRequestReview[] {
  return [...reviews].sort(
    (a, b) => compareInstants(b.submitted_at, a.submitted_at) || b.id.localeCompare(a.id)
  );
}

/**
 * The review that asks for changes: the newest one still in force on this
 * head, else the newest one at all. Null when no review asks for changes.
 */
export function changesRequestedReview(
  reviews: readonly PullRequestReview[]
): PullRequestReview | null {
  const asking = sortReviews(reviews).filter((review) => isChangesRequestedState(review.state));
  return asking.find((review) => review.effective && !review.stale) ?? asking[0] ?? null;
}

/**
 * Which review the URL hash points at: `#review-<id>` when that review is on
 * the page, `#changes-requested` for the review asking for changes. Null when
 * the hash names no review here.
 */
export function targetReviewId(
  reviews: readonly PullRequestReview[],
  hash: string
): string | null {
  const name = decodeURIComponent(hash.replace(/^#/, ''));
  if (name === CHANGES_REQUESTED_ANCHOR) return changesRequestedReview(reviews)?.id ?? null;
  const match = reviews.find((review) => reviewAnchor(review.id) === name);
  return match ? match.id : null;
}

/**
 * Which reviews start open: the one the URL points at, else the one asking
 * for changes now, since that is what the merge waits on.
 */
export function openReviewIds(
  reviews: readonly PullRequestReview[],
  hash: string
): Set<string> {
  const target = targetReviewId(reviews, hash);
  if (target) return new Set([target]);
  const asking = changesRequestedReview(reviews);
  return new Set(asking && asking.effective && !asking.stale ? [asking.id] : []);
}
