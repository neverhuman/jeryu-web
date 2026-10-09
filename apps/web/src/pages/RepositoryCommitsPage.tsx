// RepositoryCommitsPage.tsx — `…/commits[/<ref>][?path=]`: a page of one ref's
// commit history, newest first.
//
// One row per commit: its subject, who wrote it, when, and its short sha,
// each row opening the commit itself. `?path=` narrows the history to one file
// or directory, which is what the file view's History button links to. Paging
// follows the server: an Older button while `page.has_more`, a Newer one above
// the first page.

import { ChevronLeft, ChevronRight, GitCommitHorizontal } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { ActionButton } from '../components/action/ActionButton';
import { PageHeader, queryFreshness } from '../components/pageHeader';
import { When } from '../format/When';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PermissionDeniedState,
} from '../components/state';
import { useCommitHistory } from '../hooks/useRepoCommits';
import { useResolveRepo } from '../hooks/useResolveRepo';

import { shortSha } from './qualityGate/qualityGateModel';
import { blobPath, repoShellCrumbs } from './repoBrowserModel';
import {
  COMMITS_PAGE_SIZE,
  commitPath,
  commitsPath,
  historyRangeLabel,
  historyTitle,
  parsePageParam,
} from './repoCommitsModel';

import './page.css';

export interface RepositoryCommitsPageProps {
  provider: string;
  fullName: string;
  /** The ref from the URL (`…/commits/<ref>`); the default branch when absent. */
  refTail?: string;
}

export function RepositoryCommitsPage({
  provider,
  fullName,
  refTail,
}: RepositoryCommitsPageProps): JSX.Element {
  const resolved = useResolveRepo(provider, fullName);
  const [searchParams, setSearchParams] = useSearchParams();
  const path = searchParams.get('path') ?? '';
  const page = parsePageParam(searchParams.get('page'));
  const repoId = resolved.data?.id ?? null;
  const defaultBranch = resolved.data?.summary.default_branch ?? '';
  const refName = refTail || defaultBranch;
  const history = useCommitHistory(repoId, refName, {
    path,
    page,
    limit: COMMITS_PAGE_SIZE,
  });

  const goToPage = (next: number): void => {
    const params = new URLSearchParams(searchParams);
    if (next <= 1) params.delete('page');
    else params.set('page', String(next));
    setSearchParams(params);
  };

  // The history is a page of its own, outside the repository shell: it wears
  // the page header in every state, with the trail down through the repository.
  const crumbs = repoShellCrumbs(provider, fullName, resolved.data?.summary ?? null, {
    label: 'Commits',
  });
  const waitingHeader = (
    <PageHeader
      title={historyTitle(refName, path)}
      testId="repo-commits-header"
      parent="nav.repos"
      crumbs={crumbs}
    />
  );

  if (resolved.isPending) {
    return (
      <div className="page" data-testid="repo-commits-page">
        {waitingHeader}
        <LoadingState title="Loading repository…" variant="message" />
      </div>
    );
  }
  if (resolved.error || !resolved.data) {
    return (
      <div className="page" data-testid="repo-commits-page">
        {waitingHeader}
        <ErrorState
          title="Could not load repository"
          description={resolved.error ? undefined : `No repository named ${fullName}.`}
          error={resolved.error ?? undefined}
        />
      </div>
    );
  }

  const commits = history.data?.commits ?? [];
  const paging = history.data?.page;

  return (
    <div className="page" data-testid="repo-commits-page">
      <PageHeader
        title={historyTitle(refName, path)}
        testId="repo-commits-header"
        parent="nav.repos"
        crumbs={crumbs}
        freshness={queryFreshness(history)}
        subtitle={
          path ? (
            <>
              Only the commits that touched{' '}
              <Link to={blobPath(provider, fullName, refName, path)}>{path}</Link>.{' '}
              <Link to={commitsPath(provider, fullName, refName)}>See the whole history.</Link>
            </>
          ) : undefined
        }
      >
        {paging ? (
          <p className="repo-commits__range" data-testid="repo-commits-range">
            {historyRangeLabel(paging.page, paging.limit, commits.length, paging.total)}
          </p>
        ) : null}
      </PageHeader>

      {history.isPending ? (
        <LoadingState title="Loading commits…" variant="skeleton" rows={5} />
      ) : history.error ? (
        history.error instanceof ApiError && history.error.status === 403 ? (
          <PermissionDeniedState
            description="You do not have permission to read this repository's history."
            missingPermission="repo.read"
          />
        ) : (
          <ErrorState title="Could not load commits" error={history.error} />
        )
      ) : commits.length === 0 ? (
        <EmptyState
          title="No commits"
          description={
            path
              ? `No commit on ${refName} touched ${path}.`
              : `${refName} has no commits here.`
          }
        />
      ) : (
        <ul className="repo-commits__list" aria-label="Commits">
          {commits.map((commit) => (
            <li className="repo-commits__item" data-testid="repo-commit-row" key={commit.sha}>
              <GitCommitHorizontal aria-hidden="true" size={14} />
              <Link
                className="repo-commits__subject"
                to={commitPath(provider, fullName, commit.sha)}
              >
                {commit.summary}
              </Link>
              <span className="repo-commits__meta">
                {commit.author}
                <span aria-hidden="true"> · </span>
                <When at={commit.committed_at} />
              </span>
              <Link
                className="repo-commits__sha"
                to={commitPath(provider, fullName, commit.sha)}
                title={commit.sha}
              >
                <code>{shortSha(commit.sha)}</code>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {paging && (page > 1 || paging.has_more) ? (
        <nav className="repo-commits__paging" aria-label="Commit pages">
          <ActionButton
            variant="default"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            icon={<ChevronLeft size={12} aria-hidden="true" />}
          >
            Newer
          </ActionButton>
          <ActionButton
            variant="default"
            disabled={!paging.has_more}
            onClick={() => goToPage(page + 1)}
            icon={<ChevronRight size={12} aria-hidden="true" />}
          >
            Older
          </ActionButton>
        </nav>
      ) : null}
    </div>
  );
}
