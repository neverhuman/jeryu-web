import {
  useBranchProtection,
  isUnprotected
} from '../../hooks/useBranchProtection';
import { JANKURAI_PROOF_CHECK } from "../repoStatusModel";
import { useRepoAutomation } from '../../hooks/useRepoAutomation';

/** Current default-branch requirements, never inferred from missing executions. */
export function useFlowPolicy(repo: string) {
  const automation = useRepoAutomation(repo || null);
  const [owner = '', name = ''] = repo.split('/');
  const branch = automation.data?.defaultBranch ?? '';
  const protection = useBranchProtection(owner, name, branch);
  const known =
    Boolean(branch) &&
    (protection.isSuccess || isUnprotected(protection.error));
  const approvals = known
    ? (protection.data?.required_pull_request_reviews
        ?.required_approving_review_count ?? 0)
    : null;
  const checks = known
    ? [
        ...new Set([
          ...(protection.data?.required_status_checks?.contexts ?? []),
          ...(protection.data?.required_jankurai_proof?.enabled
            ? [JANKURAI_PROOF_CHECK]
            : [])
        ])
      ]
    : null;
  return { automation, branch, approvals, checks, known };
}

export function policyLabel(
  station: string,
  policy: ReturnType<typeof useFlowPolicy>
): string {
  if (station === 'review')
    return policy.approvals === null
      ? 'Review requirement unknown'
      : policy.approvals === 0
        ? 'No approval required by branch rule · pass-through'
        : `${policy.approvals} approving review${policy.approvals === 1 ? '' : 's'} required`;
  if (station === 'gate')
    return policy.checks === null
      ? 'Check requirement unknown'
      : policy.checks.length === 0
        ? 'No checks required by branch rule · pass-through'
        : `${policy.checks.length} required check${policy.checks.length === 1 ? '' : 's'}`;
  return '';
}
