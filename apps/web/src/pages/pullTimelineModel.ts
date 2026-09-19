import type { PullRequestSummary } from '../api/types';

/**
 * A PR's position on its path to `main`, left to right. Each stage is
 * derived from the summary alone, so the track costs no extra requests.
 */
export type PullStageId = 'opened' | 'checks' | 'review' | 'mergeable' | 'merged';

/** done: passed; active: in progress now; blocked: stopped here; pending: not reached; skipped: never will be. */
export type PullStageStatus = 'done' | 'active' | 'blocked' | 'pending' | 'skipped';

export interface PullStage {
  id: PullStageId;
  label: string;
  status: PullStageStatus;
  detail: string;
}

export const PULL_STAGE_LABELS: Record<PullStageId, string> = {
  opened: 'Opened',
  checks: 'Checks',
  review: 'Review',
  mergeable: 'Mergeable',
  merged: 'Merged',
};

export function pullStages(pr: PullRequestSummary): PullStage[] {
  const stage = (id: PullStageId, status: PullStageStatus, detail: string): PullStage => ({
    id,
    label: PULL_STAGE_LABELS[id],
    status,
    detail,
  });

  // A merged PR still reports how it got there: a merge over red checks or
  // with no recorded approval stays visible instead of turning green.
  if (pr.state === 'merged') {
    const settled = (status: PullStageStatus): PullStageStatus =>
      status === 'pending' || status === 'active' ? 'skipped' : status;
    return [
      stage('opened', 'done', 'open'),
      stage('checks', settled(checksStage(pr)), checksDetail(pr)),
      stage('review', settled(reviewStage(pr)), reviewDetail(pr)),
      stage('mergeable', 'done', 'merged'),
      stage('merged', 'done', 'merged'),
    ];
  }

  const checks = checksStage(pr);
  const review = reviewStage(pr);
  const closed = pr.state === 'closed';
  const mergeable: PullStageStatus = closed
    ? 'skipped'
    : pr.mergeable.can_merge
      ? 'done'
      : checks === 'done' && review === 'done'
        ? 'blocked'
        : 'pending';

  return [
    stage('opened', pr.draft ? 'active' : 'done', pr.draft ? 'draft' : 'open'),
    stage('checks', closed && checks !== 'done' ? 'skipped' : checks, checksDetail(pr)),
    stage('review', closed && review !== 'done' ? 'skipped' : review, reviewDetail(pr)),
    stage('mergeable', mergeable, pr.mergeable.reason ?? pr.mergeable.level),
    stage('merged', closed ? 'blocked' : 'pending', closed ? 'closed unmerged' : 'not yet'),
  ];
}

function checksStage(pr: PullRequestSummary): PullStageStatus {
  const { total, failing, pending } = pr.checks;
  if (total === 0) return 'pending';
  if (failing > 0) return 'blocked';
  if (pending > 0) return 'active';
  return 'done';
}

function reviewStage(pr: PullRequestSummary): PullStageStatus {
  const { approvals, required_approvals, changes_requested } = pr.review;
  if (changes_requested > 0) return 'blocked';
  if (approvals >= Math.max(required_approvals, 1)) return 'done';
  return approvals > 0 ? 'active' : 'pending';
}

function checksDetail(pr: PullRequestSummary): string {
  const { total, passing, failing, pending } = pr.checks;
  if (total === 0) return 'no checks';
  if (failing > 0) return `${failing} failing`;
  if (pending > 0) return `${pending} running`;
  return `${passing}/${total} passing`;
}

function reviewDetail(pr: PullRequestSummary): string {
  const { approvals, required_approvals, changes_requested } = pr.review;
  if (changes_requested > 0) return 'changes requested';
  return `${approvals}/${Math.max(required_approvals, 1)} approvals`;
}

/** Open PRs first, then most recently updated. */
export function timelineOrder(a: PullRequestSummary, b: PullRequestSummary): number {
  const rank = (pr: PullRequestSummary) => (pr.state === 'open' ? 0 : 1);
  return rank(a) - rank(b) || b.updated_at.localeCompare(a.updated_at) || b.number - a.number;
}

/**
 * The page in one line: how many are open, how many wait on checks, how many
 * are stopped by a red check. A red check that does not stop the merge (the
 * forge says the pull request can merge) is not counted as blocking.
 */
export function timelineSentence(pulls: PullRequestSummary[]): string {
  const open = pulls.filter((pr) => pr.state !== 'merged' && pr.state !== 'closed');
  const waiting = open.filter(
    (pr) => pr.checks.failing === 0 && (pr.checks.total === 0 || pr.checks.pending > 0)
  ).length;
  const blocked = open.filter((pr) => pr.checks.failing > 0 && !pr.mergeable.can_merge).length;
  return `${open.length} open · ${waiting} waiting on checks · ${blocked} stopped by a failing check`;
}

