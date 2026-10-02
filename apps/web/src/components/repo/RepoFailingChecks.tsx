// RepoFailingChecks.tsx — what is failing on a repository's default branch, and
// the one thing to do about each: the body of the row a status chip opens.

import { Link } from 'react-router-dom';

import type { RepositorySummary } from '../../api/types';
import { useCommitCheckRuns } from '../../hooks/useCommitCheckRuns';
import { pullRoomHref } from '../../pages/pullRoomModel';
import { failingChecks } from '../../pages/repoStatusModel';
import { ErrorState, LoadingState } from '../state';

export interface RepoFailingChecksProps {
  repo: RepositorySummary;
}

export function RepoFailingChecks({
  repo
}: RepoFailingChecksProps): JSX.Element {
  const fullName = `${repo.id.owner}/${repo.id.name}`;
  const branch = repo.default_branch || 'main';
  const runs = useCommitCheckRuns(repo.id.owner, repo.id.name, branch, true);

  if (runs.isPending) {
    return (
      <LoadingState
        title={`Loading the checks of ${fullName}…`}
        variant="message"
      />
    );
  }
  if (runs.error) {
    return (
      <ErrorState
        title={`Could not load the checks of ${fullName}`}
        error={runs.error}
      />
    );
  }
  const checks = failingChecks(runs.data);
  return (
    <div
      className="repo-status-detail"
      data-testid={`repo-status-detail-${repo.id.name}`}
    >
      {checks.length === 0 ? (
        <p className="text-muted">
          Nothing is failing on {branch} itself: the failing check is on an open
          pull request.
        </p>
      ) : (
        <ul className="repo-status-detail__list">
          {checks.map((check) => (
            <li key={check.name} className="repo-status-detail__check">
              <p className="repo-status-detail__name">
                <strong>{check.name}</strong>
                {check.title ? <span> · {check.title}</span> : null}
              </p>
              {check.summary.length > 0 ? (
                <p className="repo-status-detail__summary">
                  {check.summary.join(' · ')}
                </p>
              ) : null}
              <p className="repo-status-detail__todo">{check.whatToDo}</p>
              {check.detailsUrl ? (
                <a
                  href={check.detailsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open the check
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Link to={pullRoomHref(fullName)}>In flight for {fullName}</Link>
    </div>
  );
}
