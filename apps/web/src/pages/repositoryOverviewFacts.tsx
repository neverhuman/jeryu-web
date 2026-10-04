// repositoryOverviewFacts.tsx — what the repository page says about the git
// repository itself, beside the README.
//
// `RepoCommitSummary` is the line under the header: how many commits the shown
// ref has (linking to the list of them), how many branches and tags the
// repository has, and the last commit (short sha, which opens the commit,
// subject, author, when). It reads the same `/refs` the branch
// selector does, so the counts cost no extra request, plus one commit from
// `/commits`. A repository whose source is hosted elsewhere answers 404 for
// both and the line is simply absent.
//
// `RepoHealthChip` is the header chip. The server sets `health` to `warning`
// exactly when the default branch has failing checks, so the chip names them
// and opens them: the same list, and the same next step per check, the
// Repositories table shows under a row.

import { ChevronDown, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { RepositorySummary } from '../api/types';
import { relativeTime } from '../components/repo/relativeTime';
import { RepoFailingChecks } from '../components/repo/RepoFailingChecks';
import { useRefs } from '../hooks/useRefs';
import { useRepoCommits } from '../hooks/useRepoCommits';

import { shortSha } from './qualityGate/qualityGateModel';
import { commitCountLabel, healthChipLabel, refCountsLabel } from './repoBrowserModel';
import { commitPath, commitsPath } from './repoCommitsModel';

/** DOM id of the panel the header's health chip opens. */
export const HEALTH_CHECKS_ID = 'repo-failing-checks';

export function RepoCommitSummary({
  provider,
  fullName,
  repoId,
  refName,
}: {
  provider: string;
  fullName: string;
  repoId: string;
  refName: string;
}): JSX.Element | null {
  const commits = useRepoCommits(repoId, refName);
  const refs = useRefs(repoId);
  const head = commits.data?.commits[0];
  if (!commits.data || !head) return null;
  const refCounts = refCountsLabel(refs.data ?? []);
  return (
    <p className="repo-browser__commits" data-testid="repo-commit-summary">
      <span className="repo-browser__fact">
        {/* The count is the way into the history: the whole list of them. */}
        <Link to={commitsPath(provider, fullName, refName)}>
          {commitCountLabel(commits.data.page.total)}
        </Link>
        {refCounts ? ` · ${refCounts}` : ''}
      </span>
      <span className="repo-browser__commit">
        <Link
          to={commitPath(provider, fullName, head.sha)}
          className="repo-browser__sha"
          title={head.sha}
        >
          <code>{shortSha(head.sha)}</code>
        </Link>
        <span className="repo-browser__commit-subject">{head.summary}</span>
        <span className="repo-browser__fact">
          {head.author} ·{' '}
          <time dateTime={head.committed_at} title={head.committed_at}>
            {relativeTime(head.committed_at)}
          </time>
        </span>
      </span>
    </p>
  );
}

export function RepoHealthChip({
  repo,
  open,
  onToggle,
}: {
  repo: RepositorySummary;
  open: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="repo-health-pill repo-health-pill--degraded repo-health-pill__button"
      aria-expanded={open}
      aria-controls={HEALTH_CHECKS_ID}
      onClick={onToggle}
      data-testid="repo-health-chip"
    >
      {open ? (
        <ChevronDown size={12} aria-hidden="true" />
      ) : (
        <ChevronRight size={12} aria-hidden="true" />
      )}
      {healthChipLabel(repo.health, repo.failing_checks)}
    </button>
  );
}

/** The chip's panel: what is failing on the default branch, and what to do. */
export function RepoHealthChecks({ repo }: { repo: RepositorySummary }): JSX.Element {
  return (
    <section
      id={HEALTH_CHECKS_ID}
      className="repo-browser__checks"
      aria-label="Failing checks"
    >
      <RepoFailingChecks repo={repo} />
    </section>
  );
}
