import { Link } from 'react-router-dom';
import { policyLabel, useFlowPolicy } from './useFlowPolicy';

export function FlowPolicy({ repo }: { repo: string }) {
  const policy = useFlowPolicy(repo);
  if (!repo)
    return (
      <p>
        Choose a repository to inspect its current requirements. Automation and
        holds depend on its configuration.
      </p>
    );
  return (
    <div className="flow-detail__policy">
      <h3>Current repository configuration</h3>
      <p>
        {repo}
        {policy.branch ? ` · default branch ${policy.branch}` : ''}
      </p>
      <ul>
        <li>{policyLabel('review', policy)}</li>
        <li>
          {policyLabel('gate', policy)}
          {policy.checks?.length ? `: ${policy.checks.join(', ')}` : ''}
        </li>
      </ul>
      <p>
        {policy.automation.data?.actors.length
          ? `Reported actors: ${policy.automation.data.actors.map((a) => `${a.identity} (${a.kind}, ${a.state})`).join('; ')}.`
          : 'No automation evidence is available for this repository.'}
      </p>
      <p>
        These are current default-branch rules. Item evidence records what
        actually happened. Service presence does not establish a human-only or
        automatic policy; repository-owned dispatch and release rules may add
        requirements.
      </p>
      <Link to={`/${repo}/settings/branch-protection`}>
        Inspect repository configuration
      </Link>
    </div>
  );
}
