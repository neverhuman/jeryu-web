// pullReviewModel.ts — what the pull request page says and offers, as pure
// functions of the PR detail.
//
// A settled pull request (merged or closed) has no merge question left, so
// the page shows one calm line and none of the approve/merge/passport
// controls. An open one has exactly one primary action at a time.

import type { ApiError } from '../../api/client';
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

/** `@alton` and `alton` are the same account. */
function sameAccount(a: string, b: string): boolean {
  const normalize = (value: string): string =>
    value.trim().replace(/^@/, '').toLowerCase();
  const left = normalize(a);
  return left.length > 0 && left === normalize(b);
}

/**
 * Whether the configured approval requirement is already met. Distinct from
 * `approvalsSatisfied`: a pull request that requires no approval at all has
 * no requirement to meet, so its Approve button keeps the exact-SHA wording.
 */
export function approvalRequirementMet(
  review: PullRequestSummary['review']
): boolean {
  return review.required_approvals > 0 && approvalsSatisfied(review);
}

/** One effective approval recorded against the pull request's current head. */
export interface ApprovalCredit {
  author: string;
  /** The short SHA the approval was cast on. */
  shortSha: string;
}

function isApprovalState(state: string): boolean {
  const value = state.trim().toLowerCase();
  return value === 'approved' || value === 'approve';
}

/**
 * Who approved this exact head, from the review audit rows. Rows anchored to
 * another SHA, dismissed rows and rows the server marked ineffective do not
 * count, so the credit always matches the SHA the count is about.
 */
export function approvalCredits(detail: PullRequestDetail): ApprovalCredit[] {
  const headSha = detail.summary.head_sha;
  return (detail.reviews ?? [])
    .filter(
      (row) =>
        row.effective &&
        !row.stale &&
        isApprovalState(row.state) &&
        row.head_sha === headSha
    )
    .map((row) => ({ author: row.author, shortSha: headSha.slice(0, 7) }));
}

/** Name the approvers and the SHA they approved, next to the count. */
export function approvalAttribution(detail: PullRequestDetail): string | null {
  const credits = approvalCredits(detail);
  if (credits.length === 0) return null;
  const parts = credits.map((c) => `${c.author} at ${c.shortSha}`);
  return `Approved by ${parts.join(', ')}`;
}

/** Whether the signed-in account's approval already stands on this head. */
export function viewerApprovedHead(
  detail: PullRequestDetail,
  viewerLogin: string | null | undefined
): boolean {
  if (!viewerLogin) return false;
  return approvalCredits(detail).some((c) => sameAccount(c.author, viewerLogin));
}

/** What the Approve control shows, and how loudly. */
export interface ApproveCta {
  /** False when the viewer's approval already stands on this exact SHA. */
  show: boolean;
  label: string;
  /** True only while the approval is the one thing the merge waits for. */
  emphasized: boolean;
}

/**
 * The Approve control, worded for the approval posture. While the
 * requirement is unmet the exact-SHA approval is the primary action; once it
 * is met an extra approval is welcome but optional, so the control is
 * demoted, and it disappears for a viewer who already approved this head.
 */
export function approveCta(
  detail: PullRequestDetail,
  viewerLogin: string | null | undefined
): ApproveCta {
  if (!approvalRequirementMet(detail.summary.review)) {
    return {
      show: true,
      label: `Approve exact SHA ${detail.summary.head_sha.slice(0, 7)}`,
      emphasized: primaryAction(detail) === 'approve',
    };
  }
  return {
    show: !viewerApprovedHead(detail, viewerLogin),
    label: 'Add your approval',
    emphasized: false,
  };
}

/**
 * Why the merge is blocked, in one line. "Blocked by the Passport" and "a
 * gate failed" are the same thing said twice, so the line names the Passport
 * and the first blocker that holds it shut.
 */
export function mergeBlockedLine(detail: PullRequestDetail): string {
  const first = detail.merge_passport.blockers[0];
  const cause = first?.message.trim() ?? detail.summary.mergeable.reason?.trim();
  if (cause && cause.length > 0) {
    const sentence = /[.!?]$/.test(cause) ? cause : `${cause}.`;
    return `Merge blocked by the Passport: ${sentence}`;
  }
  return 'Merge blocked by the Passport: it has not cleared this head yet.';
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

// ── Who may approve, and what to say when the server says no. ────────────
//
// The forge refuses an author's approval of their own pull request with
// `403 pull_self_approval_forbidden` (see the API's `self_approval_forbidden`).
// The client knows the author and the signed-in account, so it can say so
// before the round-trip; when it cannot tell (the web login and the forge
// handle differ), the refusal arrives from the server and is shown verbatim
// with the one thing that clears it: an independent reviewer.

export interface ApproveAvailability {
  /** False when the signed-in account cannot approve this pull request. */
  enabled: boolean;
  /** What stands in the way and who clears it; null when approval is open. */
  reason: string | null;
}

/**
 * Whether the Approve button accepts a click, given who is signed in.
 * `viewerLogin` is the authenticated account (`GET /auth/me`); when it is
 * unknown the button stays live and the server has the last word.
 */
export function approveAvailability(
  detail: PullRequestDetail,
  viewerLogin: string | null | undefined
): ApproveAvailability {
  const author = detail.summary.author;
  if (viewerLogin && sameAccount(author, viewerLogin)) {
    return {
      enabled: false,
      reason:
        `You opened this pull request, so you cannot approve it. ` +
        `An authenticated reviewer other than ${author} has to approve ` +
        `exact SHA ${detail.summary.head_sha.slice(0, 7)}.`,
    };
  }
  return { enabled: true, reason: null };
}

/** A draft still takes reviews; the merge waits for it to be marked ready. */
export function draftReviewNote(detail: PullRequestDetail): string | null {
  if (!detail.summary.draft || isSettled(detail)) return null;
  return 'This pull request is a draft: a review is recorded now, but the merge waits until it is marked ready for review. Use "Ready for review" below when it is.';
}

/** Word a refused draft transition so the reader knows what to do next. */
export function draftRefusal(
  error: Pick<ApiError, 'code' | 'message' | 'status'>,
  draft: boolean
): string {
  const what = draft ? 'converted to a draft' : 'marked ready for review';
  if (error.code === 'pull_draft_forbidden') {
    return `Not ${what}: ${error.message} Ask the author, or an administrator, to make the change.`;
  }
  if (error.code === 'pull_draft_not_open') {
    return `Not ${what}: ${error.message} Reopen it first.`;
  }
  return `Not ${what}: ${error.message}`;
}

export interface ApproveRefusal {
  /** The server's own message, shown as written. */
  message: string;
  /** The single next step that clears the refusal. */
  guidance: string;
}

/** Word a failed approval so the reviewer knows what to do next. */
export function approveRefusal(
  error: Pick<ApiError, 'code' | 'message' | 'status' | 'details'>,
  detail: PullRequestDetail
): ApproveRefusal {
  const shortSha = detail.summary.head_sha.slice(0, 7);
  const details = error.details ?? {};
  const author =
    typeof details.author === 'string' ? details.author : detail.summary.author;
  if (error.code === 'pull_self_approval_forbidden') {
    const reviewer =
      typeof details.reviewer === 'string' ? details.reviewer : null;
    const identity = reviewer
      ? `you are signed in as ${reviewer}, which is also the author`
      : `you are signed in as the author`;
    return {
      message: error.message,
      guidance:
        `Nothing was approved: ${identity} (${author}). ` +
        `An independent authenticated reviewer with write access has to ` +
        `approve exact SHA ${shortSha}.`,
    };
  }
  if (error.code.includes('draft')) {
    return {
      message: error.message,
      guidance:
        'Nothing was approved: mark the pull request ready for review, then approve it again.',
    };
  }
  if (error.status === 403) {
    return {
      message: error.message,
      guidance:
        'Nothing was approved: this account has no reviewer access on the repository. Ask an administrator for it, then approve again.',
    };
  }
  return {
    message: error.message,
    guidance: `Nothing was approved. Refresh the pull request and approve exact SHA ${shortSha} again.`,
  };
}
