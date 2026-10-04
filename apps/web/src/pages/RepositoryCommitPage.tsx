// RepositoryCommitPage.tsx — `…/commit/<sha>`: one commit, its message and
// what it changed.
//
// The message is read the way the pull request page reads one (subject, body
// paragraphs, trailers), and the diff is the cockpit's viewer against the same
// `files`/`hunks` payload, so a commit of a shift PR reads the same here as in
// review.

import { GitCommitHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ApiError } from '../api/client';
import { Breadcrumbs } from '../components/browser';
import type { BreadcrumbSegment } from '../components/browser';
import { DiffFileTree, DiffViewer } from '../components/merge';
import type { DiffViewerMode } from '../components/merge';
import { When } from '../format/When';
import {
  ErrorState,
  LoadingState,
  PermissionDeniedState,
} from '../components/state';
import { useRepoCommit } from '../hooks/useRepoCommit';
import { useResolveRepo } from '../hooks/useResolveRepo';
import { usePreferencesStore } from '../stores/preferencesStore';

import { parseCommitMessage } from './pullCommitsModel';
import { shortSha } from './qualityGate/qualityGateModel';
import { repoFrontPath } from './repoBrowserModel';
import { commitPath, commitsPath } from './repoCommitsModel';

import './page.css';

/** No file is marked viewed outside review; the tree still wants the set. */
const NONE_VIEWED: Set<string> = new Set();

export interface RepositoryCommitPageProps {
  provider: string;
  fullName: string;
  /** The sha (or ref) from the URL. */
  sha: string;
}

export function RepositoryCommitPage({
  provider,
  fullName,
  sha,
}: RepositoryCommitPageProps): JSX.Element {
  const resolved = useResolveRepo(provider, fullName);
  const repoId = resolved.data?.id ?? null;
  const commit = useRepoCommit(repoId, sha);
  const diffMode = usePreferencesStore((s) => s.diffMode);
  const setDiffMode = usePreferencesStore((s) => s.setDiffMode);
  const [selected, setSelected] = useState<string | null>(null);
  const files = commit.data?.files ?? [];
  const activeFile = useMemo(
    () => files.find((file) => file.path === selected) ?? files[0] ?? null,
    [files, selected]
  );
  const message = useMemo(
    () => parseCommitMessage(commit.data?.message ?? ''),
    [commit.data?.message]
  );

  if (resolved.isPending) {
    return (
      <div className="page" data-testid="repo-commit-page">
        <LoadingState title="Loading repository…" variant="message" />
      </div>
    );
  }
  if (resolved.error || !resolved.data) {
    return (
      <div className="page" data-testid="repo-commit-page">
        <ErrorState
          title="Could not load repository"
          description={resolved.error ? undefined : `No repository named ${fullName}.`}
          error={resolved.error ?? undefined}
        />
      </div>
    );
  }

  const front = repoFrontPath(provider, fullName);
  const crumbs: BreadcrumbSegment[] = [
    { label: 'Repos', to: '/repos' },
    { label: provider, prefix: 'host', to: `/repos?host=${provider}` },
    { label: resolved.data.summary.id.owner },
    { label: resolved.data.summary.id.name, to: front },
    { label: 'Commits', to: commitsPath(provider, fullName) },
    { label: shortSha(sha) },
  ];

  return (
    <div className="page" data-testid="repo-commit-page">
      <Breadcrumbs segments={crumbs} />
      {commit.isPending ? (
        <LoadingState title="Loading commit…" variant="message" />
      ) : commit.error ? (
        commit.error instanceof ApiError && commit.error.status === 403 ? (
          <PermissionDeniedState
            description="You do not have permission to read this repository."
            missingPermission="repo.read"
          />
        ) : (
          <ErrorState title="Could not load the commit" error={commit.error} />
        )
      ) : !commit.data ? (
        <ErrorState title="Could not load the commit" />
      ) : (
        <>
          <header className="page__header">
            <h1 className="page__title" data-testid="repo-commit-subject">
              {message.subject || shortSha(commit.data.sha)}
            </h1>
            <p className="repo-commit__meta">
              <GitCommitHorizontal aria-hidden="true" size={14} />
              <code title={commit.data.sha}>{shortSha(commit.data.sha)}</code>
              <span>
                {commit.data.author}
                <span aria-hidden="true"> · </span>
                <When at={commit.data.authored_at} />
              </span>
              {commit.data.parents.map((parent) => (
                <Link
                  key={parent}
                  to={commitPath(provider, fullName, parent)}
                  className="repo-commit__parent"
                  title={parent}
                >
                  parent {shortSha(parent)}
                </Link>
              ))}
            </p>
          </header>

          {message.paragraphs.length > 0 || message.trailers.length > 0 ? (
            <section className="repo-commit__message" aria-label="Commit message">
              {message.paragraphs.map((paragraph, index) => (
                <p key={`p${index}`}>{paragraph}</p>
              ))}
              {message.trailers.length > 0 ? (
                <dl className="repo-commit__trailers">
                  {message.trailers.map((trailer, index) => (
                    <div key={`t${index}-${trailer.key}`}>
                      <dt>{trailer.key}</dt>
                      <dd>{trailer.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>
          ) : null}

          {commit.data.truncated ? (
            <p className="repo-commit__note">
              This diff is too large to show in full; some file bodies were left out.
            </p>
          ) : null}

          {files.length === 0 ? (
            <p className="repo-commit__note" data-testid="repo-commit-no-files">
              This commit changes no files.
            </p>
          ) : (
            <section className="repo-commit__diff" aria-label="Changes">
              <div className="repo-commit__files">
                <DiffFileTree
                  files={files}
                  activePath={activeFile?.path ?? null}
                  viewedPaths={NONE_VIEWED}
                  onSelect={setSelected}
                  onToggleViewed={() => undefined}
                />
              </div>
              {activeFile ? (
                <DiffViewer
                  file={activeFile}
                  mode={diffMode as DiffViewerMode}
                  onModeChange={setDiffMode}
                />
              ) : null}
            </section>
          )}
        </>
      )}
    </div>
  );
}
