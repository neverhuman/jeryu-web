// mergeBoxModel.ts — what the one merge box says: a headline, and a checklist
// row per thing the merge waits for.
//
// The page used to state the same verdict four times (a header pill, a
// "merge blocked" line, a Passport card and the blocker cards below it). The
// verdict is one sentence now — the headline — and every row says what to do
// and where to do it, so nothing repeats the word and nothing is left to
// guess at.

import type {
  PullRequestChecks,
  PullRequestDetail,
  PullRequestSummary,
} from '../../api/types';
import { approvalsLabel, approvalsSatisfied, isSettled } from './pullReviewModel';
import { gateExplanation } from './passportGates';

/** Where a row stands: done, waiting on somebody, or not yet known. */
export type ChecklistState = 'done' | 'needed' | 'unknown';

/** The four rows every pull request has; a Passport gate adds its own code. */
export const CHECKLIST_KEYS = ['approvals', 'checks', 'threads', 'draft'] as const;

export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export interface ChecklistRow {
  /** One of `CHECKLIST_KEYS`, or the code of the Passport gate it stands for. */
  key: string;
  /** The row's own line, e.g. `0 of 1 approvals`. */
  label: string;
  /** What clears the row, in one sentence. */
  hint: string;
  state: ChecklistState;
  /** The tab that owns this row; null when the row's control is in the box. */
  href: string | null;
}

/** Where each checklist row points, given the pull request's base path. */
export interface ChecklistHrefs {
  /** The Conversation tab, threads anchor included. */
  threads: string;
  /** The Checks tab. */
  checks: string;
  /** The Commits tab: which commits the approvals are counted against. */
  commits: string;
}

function failingStatus(status: string | null | undefined): boolean {
  const value = status?.toLowerCase() ?? '';
  return value === 'failure' || value === 'failing' || value === 'error';
}

/** How many checks the base branch waits for are failing on this head. */
export function failingRequiredChecks(
  checks: PullRequestChecks | null | undefined
): number {
  return (checks?.checks ?? []).filter(
    (check) => failingStatus(check.status) && check.required === true
  ).length;
}

/** Whether the Passport names the required checks as one of its blockers. */
function passportFlagsChecks(detail: PullRequestDetail): boolean {
  return detail.merge_passport.blockers.some(
    (blocker) => blocker.code === 'passport_blocked_checks'
  );
}

function approvalsRow(
  review: PullRequestSummary['review'],
  author: string,
  shortSha: string,
  href: string
): ChecklistRow {
  const satisfied = approvalsSatisfied(review);
  const label =
    review.changes_requested > 0
      ? `${approvalsLabel(review)}, ${review.changes_requested} asking for changes`
      : approvalsLabel(review);
  return {
    key: 'approvals',
    label,
    hint: satisfied
      ? 'The approval requirement is met on this head.'
      : `A reviewer other than ${author} has to approve exact SHA ${shortSha}.`,
    state: satisfied ? 'done' : 'needed',
    href,
  };
}

function checksRow(
  detail: PullRequestDetail,
  checks: PullRequestChecks | null | undefined,
  isLoading: boolean,
  href: string
): ChecklistRow {
  const failing = failingRequiredChecks(checks);
  if (failing > 0 || (!checks && passportFlagsChecks(detail))) {
    const count = failing > 0 ? failing : null;
    return {
      key: 'checks',
      label:
        count === null
          ? 'Required checks are not green'
          : `${count} required ${count === 1 ? 'check' : 'checks'} failing`,
      hint: 'Open the Checks tab for the reason, then push a fix or re-run it.',
      state: 'needed',
      href,
    };
  }
  if (isLoading || !checks) {
    return {
      key: 'checks',
      label: 'Required checks: reading…',
      hint: 'The checks of this head have not been read yet.',
      state: 'unknown',
      href,
    };
  }
  return {
    key: 'checks',
    label:
      checks.total === 0
        ? 'No checks have run on this head'
        : 'Every required check is green',
    hint:
      checks.failing > 0
        ? `${checks.failing} advisory ${checks.failing === 1 ? 'check' : 'checks'} failing; the merge does not wait for them.`
        : 'Nothing the merge waits for is failing.',
    state: checks.total === 0 ? 'unknown' : 'done',
    href,
  };
}

function threadsRow(
  review: PullRequestSummary['review'],
  href: string
): ChecklistRow {
  const unresolved = review.unresolved_threads;
  return {
    key: 'threads',
    label:
      unresolved > 0
        ? `${unresolved} unresolved ${unresolved === 1 ? 'thread' : 'threads'}`
        : 'No unresolved threads',
    hint:
      unresolved > 0
        ? 'Answer each thread and resolve it, in the Conversation.'
        : 'Every conversation on this pull request is resolved.',
    state: unresolved > 0 ? 'needed' : 'done',
    href,
  };
}

function draftRow(summary: PullRequestSummary): ChecklistRow {
  if (summary.draft) {
    return {
      key: 'draft',
      label: 'Still a draft',
      hint: 'Mark it ready for review when it is; the author or an admin can.',
      state: 'needed',
      href: null,
    };
  }
  return {
    key: 'draft',
    label: 'Ready for review',
    hint: 'This pull request is open for review, not a draft.',
    state: 'done',
    href: null,
  };
}

/**
 * The whole checklist, in the order a reader works through it. Every row is
 * always present: a row that is done is as much of an answer as one that is
 * not, and a list that changes length is a list nobody learns.
 */
export function mergeChecklist(
  detail: PullRequestDetail,
  checks: PullRequestChecks | null | undefined,
  hrefs: ChecklistHrefs,
  options: { checksLoading?: boolean } = {}
): ChecklistRow[] {
  const summary = detail.summary;
  return [
    approvalsRow(
      summary.review,
      summary.author,
      summary.head_sha.slice(0, 7),
      hrefs.commits
    ),
    checksRow(detail, checks, options.checksLoading ?? false, hrefs.checks),
    threadsRow(summary.review, hrefs.threads),
    draftRow(summary),
    ...gateRows(detail),
  ];
}

/**
 * A row per Passport gate the four rows above do not already stand for — a
 * CODEOWNERS team, branch protection, a secret-scanning finding. Without
 * these a reader would see a clear checklist and a merge that still refuses.
 */
function gateRows(detail: PullRequestDetail): ChecklistRow[] {
  if (isSettled(detail)) return [];
  return detail.merge_passport.blockers
    .filter((blocker) => !COVERED_GATES.has(blocker.code))
    .map((blocker) => {
      const { title, hint } = gateExplanation(blocker);
      return {
        key: blocker.code,
        label: title,
        hint: blocker.details ? `${hint} ${blocker.details}` : hint,
        state: 'needed' as const,
        href: null,
      };
    });
}

/** The Passport gates the four standing rows already say. */
const COVERED_GATES = new Set([
  'passport_blocked_approvals',
  'passport_blocked_checks',
  'passport_blocked_threads',
  'passport_blocked_draft',
]);

/** The rows somebody still has to do something about. */
export function mergeBlockers(rows: readonly ChecklistRow[]): ChecklistRow[] {
  return rows.filter((row) => row.state === 'needed');
}

/**
 * The verdict, in one sentence: the only place on the page that says the
 * merge is held up.
 */
export function mergeHeadline(
  detail: PullRequestDetail,
  rows: readonly ChecklistRow[]
): string {
  if (isSettled(detail)) {
    return detail.summary.state === 'merged' ? 'Merged' : 'Closed';
  }
  const count = mergeBlockers(rows).length;
  if (count === 0) return 'Ready to merge';
  return count === 1
    ? 'Blocked: 1 thing needs doing'
    : `Blocked: ${count} things need doing`;
}
