// branchProtectionModel.ts — what protects a branch, in sentences a person reads.
//
// Source: `GET /api/v3/repos/{owner}/{repo}/branches/{branch}/protection`, the
// GitHub-shaped edge the forge really serves. Every field is optional: an older
// or newer server may send fewer or more, and nothing here may throw.

export interface BranchProtection {
  required_status_checks?: { contexts?: string[]; strict?: boolean } | null;
  required_pull_request_reviews?: { required_approving_review_count?: number } | null;
  required_linear_history?: { enabled?: boolean } | null;
  enforce_admins?: { enabled?: boolean } | null;
  allow_force_pushes?: { enabled?: boolean } | null;
  allow_deletions?: { enabled?: boolean } | null;
  required_jankurai_proof?: { enabled?: boolean } | null;
  updated_at?: string;
}

export interface ProtectionFact {
  id: string;
  /** `on` protects the branch, `off` is a protection that is not switched on. */
  state: 'on' | 'off';
  text: string;
}

/** The rules of one branch as plain facts, the ones that are on first. */
export function protectionFacts(rule: BranchProtection): ProtectionFact[] {
  const contexts = rule.required_status_checks?.contexts ?? [];
  const approvals = rule.required_pull_request_reviews?.required_approving_review_count ?? 0;
  const facts: ProtectionFact[] = [
    contexts.length > 0
      ? {
          id: 'checks',
          state: 'on',
          text: `A pull request merges only when ${contexts.join(', ')} is green${
            rule.required_status_checks?.strict ? ' on a head that is up to date with the branch' : ''
          }.`,
        }
      : { id: 'checks', state: 'off', text: 'No check is required before a merge.' },
    approvals > 0
      ? {
          id: 'reviews',
          state: 'on',
          text: `${approvals} approving review${approvals === 1 ? '' : 's'} required.`,
        }
      : { id: 'reviews', state: 'off', text: 'No approving review is required.' },
    rule.required_linear_history?.enabled
      ? { id: 'linear', state: 'on', text: 'History stays linear: no merge commits.' }
      : { id: 'linear', state: 'off', text: 'Merge commits are allowed.' },
    rule.enforce_admins?.enabled
      ? { id: 'admins', state: 'on', text: 'The rules bind admins too.' }
      : { id: 'admins', state: 'off', text: 'Admins can bypass these rules.' },
    rule.allow_force_pushes?.enabled
      ? { id: 'force', state: 'off', text: 'Force pushes are allowed.' }
      : { id: 'force', state: 'on', text: 'Force pushes are refused.' },
    rule.allow_deletions?.enabled
      ? { id: 'delete', state: 'off', text: 'The branch can be deleted.' }
      : { id: 'delete', state: 'on', text: 'The branch cannot be deleted.' },
    rule.required_jankurai_proof?.enabled
      ? { id: 'jankurai', state: 'on', text: 'A passing jankurai/proof check is required.' }
      : { id: 'jankurai', state: 'off', text: 'A jankurai/proof check is not required by this rule.' },
  ];
  return [...facts.filter((f) => f.state === 'on'), ...facts.filter((f) => f.state === 'off')];
}

/** One line for the top of the panel. */
export function protectionHeadline(branch: string, rule: BranchProtection | null): string {
  if (!rule) return `${branch} is not protected: anyone with write access can push to it.`;
  const on = protectionFacts(rule).filter((f) => f.state === 'on').length;
  return `${branch} is protected by ${on} rule${on === 1 ? '' : 's'}.`;
}
