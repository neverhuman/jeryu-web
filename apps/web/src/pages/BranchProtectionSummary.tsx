// BranchProtectionSummary.tsx — read-only: what protects the default branch today.

import { ErrorState, LoadingState } from '../components/state';
import { useBranchProtection } from '../hooks/useBranchProtection';

import { protectionFacts, protectionHeadline } from './branchProtectionModel';

export interface BranchProtectionSummaryProps {
  owner: string;
  repo: string;
  branch: string;
}

export function BranchProtectionSummary({
  owner,
  repo,
  branch,
}: BranchProtectionSummaryProps): JSX.Element {
  const rule = useBranchProtection(owner, repo, branch);
  return (
    <section
      className="page__section"
      aria-labelledby="branch-protection"
      data-testid="branch-protection"
    >
      <h2 className="page__section-title" id="branch-protection">
        Branch protection
      </h2>
      {rule.isPending ? (
        <LoadingState title="Loading the branch rule…" variant="message" />
      ) : rule.error ? (
        <ErrorState title="Could not load the branch rule" error={rule.error} />
      ) : (
        <>
          <p>{protectionHeadline(branch, rule.data)}</p>
          {rule.data ? (
            <ul className="page__fact-list">
              {protectionFacts(rule.data).map((fact) => (
                <li key={fact.id} className={`page__fact page__fact--${fact.state}`}>
                  <span className="page__fact-mark" aria-hidden="true">
                    {fact.state === 'on' ? '✓' : '–'}
                  </span>
                  {fact.text}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
