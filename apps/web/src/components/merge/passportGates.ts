// passportGates.ts — what each Merge Passport gate means.
//
// The server names a gate by its canonical code (e.g.
// `passport_blocked_codeowners`); the merge box shows the reader a title and
// the one sentence that clears it. Keys mirror the canonical gate list
// (§35.2.4).

import type { MergePassportBlocker } from '../../api/types';

/** Per-code human translation. Keys mirror §35.2.4 canonical gate list. */
const GATE_EXPLANATIONS: Record<
  string,
  { title: string; hint: string }
> = {
  passport_blocked_approvals: {
    title: 'Approvals not met',
    hint: 'Required approver count has not been satisfied on the exact head SHA.',
  },
  passport_blocked_codeowners: {
    title: 'CODEOWNERS approval required',
    hint: 'A team listed in CODEOWNERS for the touched paths has not approved.',
  },
  passport_blocked_checks: {
    title: 'Required checks failing',
    hint: 'One or more required status checks is failing, pending, or missing on this head.',
  },
  passport_blocked_threads: {
    title: 'Unresolved review threads',
    hint: 'All conversation threads must be resolved before merging.',
  },
  passport_blocked_branch_protection: {
    title: 'Branch protection violation',
    hint: 'A branch protection rule (linear history, signed commits, etc.) blocks this merge.',
  },
  passport_blocked_policy_sha: {
    title: 'Policy SHA drift',
    hint: 'The policy file changed since this pull request was opened. Re-review under the current policy.',
  },
  passport_blocked_passport_sha: {
    title: 'Passport SHA drift',
    hint: 'The Passport verdict was recomputed; refresh and re-attempt.',
  },
  passport_blocked_signed_commits: {
    title: 'Unsigned commits',
    hint: 'Branch protection requires signed commits on every commit in the head range.',
  },
  passport_blocked_linear_history: {
    title: 'Non-linear history',
    hint: 'Branch protection requires a linear history; rebase before merging.',
  },
  passport_blocked_agent_evidence: {
    title: 'Agent evidence required',
    hint: 'Agent-produced patches need attached evidence packets before merge.',
  },
  passport_blocked_license: {
    title: 'License policy violation',
    hint: 'A dependency change introduces a disallowed license.',
  },
  passport_blocked_draft: {
    title: 'Draft pull request',
    hint: 'A draft is not offered for merging yet. Marking it ready for review clears this gate; the author or an admin can do it.',
  },
  passport_blocked_secret_scan: {
    title: 'Secret scan finding',
    hint: 'A secret-scanning finding is open against this pull request.',
  },
};

/**
 * What a Passport gate means, in the reader's words. An unknown code keeps
 * the server's own message, so a gate the client has never heard of still
 * reads as a sentence.
 */
export function gateExplanation(
  blocker: Pick<MergePassportBlocker, 'code' | 'message'>
): { title: string; hint: string } {
  const known = GATE_EXPLANATIONS[blocker.code];
  if (known) return known;
  return { title: blocker.code, hint: blocker.message };
}
