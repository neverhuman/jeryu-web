// mergeAttemptModel.ts — the PR page's "approved; merge refused" line.

import type { MergeAttemptResponse } from '../../api/types';

/**
 * One line naming why an approved PR has not landed, e.g.
 * "pr-redteam approved; merge refused: queue_merge_commits - rebase it onto
 * the base". Null when nothing blocks the merge.
 */
export function mergeAttemptLine(
  answer: MergeAttemptResponse | null | undefined
): string | null {
  if (!answer) return null;
  const reason = answer.blockedReason ?? answer.grantGap?.message ?? null;
  if (!reason) return null;
  const who = answer.approvedBy.length
    ? `${answer.approvedBy.join(', ')} approved; `
    : '';
  const verb = answer.blockedReason ? 'merge refused' : 'merge will be refused';
  return `${who}${verb}: ${reason}`;
}
