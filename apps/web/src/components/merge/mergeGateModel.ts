// mergeGateModel.ts — why the Merge button is not pressable yet, in words an
// operator can act on.
//
// The button is always on the page: a reader who sees no button and no
// sentence has to guess whether the merge is forbidden, still being worked
// out, or simply not offered by this page. So when the Passport has not
// cleared the head the button stays, disabled, and every blocker the server
// named gets one line beside it — what is happening, and the page that
// clears it.
//
// Source of truth is `merge_passport.blockers` (code, message, details). The
// summary's `mergeable.reason` is the fallback for a refusal the Passport
// listed no blocker for.

import type {
  MergePassportBlocker,
  PullRequestChecks,
  PullRequestDetail,
} from '../../api/types';
import { pendingRun } from './ChecksPanel';
import { changesRequestedReview, reviewAnchor } from './reviewListModel';
import { mergeAllowed } from './pullReviewModel';
import { gateExplanation } from './passportGates';
import type { ChecklistHrefs } from './mergeBoxModel';

/** One line beside the disabled Merge button. */
export interface MergeGateReason {
  /** The blocker's code, or `mergeable` for a summary-only refusal. */
  code: string;
  /** What is happening and what the reader should do, in one sentence. */
  text: string;
  /** The page that clears it; null when there is nowhere to send the reader. */
  href: string | null;
  /** True when `href` is a forge page outside this app. */
  external: boolean;
  /** The required context this line is about, when it names one. */
  context: string | null;
}

/** The required context a checks blocker is about: `` `acme/required` ``. */
function blockerContext(blocker: MergePassportBlocker): string | null {
  const quoted = /`([^`]+)`/.exec(blocker.message);
  if (quoted) return quoted[1] ?? null;
  const details = blocker.details?.trim();
  return details ? details : null;
}

/** The check of this head with that context name, when the page has it. */
function checkFor(
  checks: PullRequestChecks | null | undefined,
  context: string | null
): PullRequestChecks['checks'][number] | null {
  if (!context) return null;
  return (checks?.checks ?? []).find((check) => check.name === context) ?? null;
}

/** The check's own page, when it has one that is not an `/api/` route. */
function checkHref(
  check: PullRequestChecks['checks'][number] | null
): string | null {
  return check?.web_url ?? check?.details_url ?? null;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function approvalsText(detail: PullRequestDetail): string {
  const review = detail.summary.review;
  const missing = Math.max(1, review.required_approvals - review.approvals);
  return `Needs ${missing} approving ${plural(missing, 'review', 'reviews')} on this head`;
}

function changesRequestedReason(
  detail: PullRequestDetail,
  hrefs: ChecklistHrefs
): { text: string; href: string | null } {
  const review = changesRequestedReview(detail.reviews ?? []);
  const anchor = review
    ? `${hrefs.conversation}#${reviewAnchor(review.id)}`
    : `${hrefs.conversation}#changes-requested`;
  return {
    text: review
      ? `Changes requested by ${review.author} — read the review`
      : 'Changes requested on this head — read the review',
    href: anchor,
  };
}

/** What the forge's own merge gate is saying, by `mergeable_state`. */
function mergeabilityText(
  detail: PullRequestDetail,
  blocker: MergePassportBlocker
): string {
  const state = blocker.details?.trim().toLowerCase() ?? '';
  if (state === 'behind') return 'Base branch moved — update the branch';
  if (state === 'dirty' || state === 'conflicting') {
    return `This head conflicts with ${detail.summary.base_ref} — merge the base branch in and push`;
  }
  if (state === 'unknown' || state === 'unstable' || state === '') {
    return 'The forge is still working out whether this head can merge — refresh in a moment';
  }
  return blocker.message;
}

function reasonFor(
  blocker: MergePassportBlocker,
  detail: PullRequestDetail,
  checks: PullRequestChecks | null | undefined,
  hrefs: ChecklistHrefs
): MergeGateReason {
  const context = blockerContext(blocker);
  const check = checkFor(checks, context);
  const base = { code: blocker.code, external: false, context };
  switch (blocker.code) {
    case 'passport_blocked_pending_checks': {
      const href = checkHref(check);
      return {
        ...base,
        text: context
          ? `Waiting for ${context} to finish`
          : 'Waiting for a required check to finish',
        href: href ?? hrefs.checks,
        external: href !== null,
      };
    }
    case 'passport_blocked_checks': {
      const href = checkHref(check);
      return {
        ...base,
        text: context
          ? `Required check ${context} failed — open the log`
          : 'A required check failed — open the log',
        href: href ?? hrefs.checks,
        external: href !== null,
      };
    }
    case 'passport_blocked_checks_missing':
      return {
        ...base,
        text: context
          ? `Required check ${context} has not run on this head — open the checks tab`
          : 'A required check has not run on this head — open the checks tab',
        href: hrefs.checks,
      };
    case 'passport_blocked_approvals':
      return { ...base, text: approvalsText(detail), href: hrefs.commits };
    case 'passport_blocked_changes_requested':
      return { ...base, ...changesRequestedReason(detail, hrefs) };
    case 'passport_blocked_threads': {
      const unresolved = Math.max(1, detail.summary.review.unresolved_threads);
      return {
        ...base,
        text: `${unresolved} review ${plural(unresolved, 'thread', 'threads')} still unresolved — answer and resolve them`,
        href: hrefs.threads,
      };
    }
    case 'passport_blocked_draft':
      return {
        ...base,
        text: 'Still a draft — mark it ready for review',
        href: null,
      };
    case 'passport_blocked_stale_base':
      return { ...base, text: 'Base branch moved — update the branch', href: null };
    case 'passport_blocked_mergeability':
      return { ...base, text: mergeabilityText(detail, blocker), href: null };
    default: {
      const { title, hint } = gateExplanation(blocker);
      const sentence = title === blocker.code ? hint : `${title} — ${hint}`;
      return {
        ...base,
        text: blocker.details ? `${sentence} ${blocker.details}` : sentence,
        href: null,
      };
    }
  }
}

/**
 * Every reason the merge is not offered, the one a reader should look at
 * first in front. Empty when the merge is allowed, so the caller can treat
 * "no reasons" and "pressable" as the same answer.
 */
export function mergeGateReasons(
  detail: PullRequestDetail,
  checks: PullRequestChecks | null | undefined,
  hrefs: ChecklistHrefs
): MergeGateReason[] {
  if (mergeAllowed(detail)) return [];
  const blockers = detail.merge_passport.blockers;
  if (blockers.length > 0) {
    return blockers.map((blocker) => reasonFor(blocker, detail, checks, hrefs));
  }
  const reason = detail.summary.mergeable.reason?.trim();
  return [
    {
      code: 'mergeable',
      text: reason
        ? `The forge will not merge this head yet: ${reason}`
        : 'The forge will not merge this head yet, and named no reason — refresh the page.',
      href: null,
      external: false,
      context: null,
    },
  ];
}

/**
 * The run to show progress for: only when a pending required check is the
 * single thing left, since then the button enables itself as soon as the gate
 * goes green and the wait is the whole story.
 */
export function pendingGateRun(
  reasons: readonly MergeGateReason[],
  checks: PullRequestChecks | null | undefined
): ReturnType<typeof pendingRun> {
  if (reasons.length !== 1) return null;
  const only = reasons[0];
  if (!only || only.code !== 'passport_blocked_pending_checks') return null;
  const check = checkFor(checks, only.context);
  return check ? pendingRun(check) : null;
}
