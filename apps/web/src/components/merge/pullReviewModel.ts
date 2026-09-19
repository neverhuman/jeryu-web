// pullReviewModel.ts — what the pull request page says and offers, as pure
// functions of the PR detail.
//
// A settled pull request (merged or closed) has no merge question left, so
// the page shows one calm line and none of the approve/merge/passport
// controls. An open one has exactly one primary action at a time.

import type { PullRequestDetail, PullRequestSummary } from '../../api/types';

export type PullBadgeTone = 'open' | 'merged' | 'closed' | 'draft';

export interface PullStateBadge {
  label: 'Open' | 'Merged' | 'Closed' | 'Draft';
  tone: PullBadgeTone;
}

export function pullStateBadge(
  summary: Pick<PullRequestSummary, 'state' | 'draft'>
): PullStateBadge {
  if (summary.state === 'merged') return { label: 'Merged', tone: 'merged' };
  if (summary.state === 'closed') return { label: 'Closed', tone: 'closed' };
  if (summary.draft) return { label: 'Draft', tone: 'draft' };
  return { label: 'Open', tone: 'open' };
}

/** The server may say so directly (`merge_applicable: false`); older servers do not. */
function mergeApplicableFlag(detail: object): boolean | null {
  if (!('merge_applicable' in detail)) return null;
  const flag: unknown = detail.merge_applicable;
  return typeof flag === 'boolean' ? flag : null;
}

/** Merged or closed: nothing about this pull request can be approved or merged. */
export function isSettled(detail: PullRequestDetail): boolean {
  const flag = mergeApplicableFlag(detail);
  if (flag === false) return true;
  return detail.summary.state !== 'open';
}

/** One calm sentence for a settled pull request. */
export function settledLine(summary: PullRequestSummary): string {
  const verb = summary.state === 'merged' ? 'Merged' : 'Closed';
  return `${verb} into ${summary.base_ref}. Nothing is waiting on this pull request.`;
}

export function approvalsLabel(review: PullRequestSummary['review']): string {
  const noun = review.approvals === 1 ? 'approval' : 'approvals';
  if (review.required_approvals <= 0) {
    return `${review.approvals} ${noun} (none required)`;
  }
  return `${review.approvals} of ${review.required_approvals} approvals`;
}

export function approvalsSatisfied(review: PullRequestSummary['review']): boolean {
  return review.approvals >= review.required_approvals && review.changes_requested === 0;
}

export function mergeAllowed(detail: PullRequestDetail): boolean {
  return detail.merge_passport.status === 'pass' && detail.summary.mergeable.can_merge;
}

/** Exactly one filled button: Approve until approvals are satisfied, then Merge. */
export function primaryAction(detail: PullRequestDetail): 'approve' | 'merge' | 'none' {
  if (isSettled(detail)) return 'none';
  if (mergeAllowed(detail) && approvalsSatisfied(detail.summary.review)) return 'merge';
  return 'approve';
}

/**
 * A failing check on a pull request whose passport passes is, by definition,
 * not one the merge waits for. The client cannot list required contexts, so
 * the passport verdict is the evidence.
 */
export function failingChecksBlockMerge(detail: PullRequestDetail): boolean {
  return detail.merge_passport.status !== 'pass';
}
