// RepositoryBrowserPage.tsx — the one repository page.
//
// The repository front page (`/repos/:p/:o/:r`, README in the main column) and
// the file page (`…/blob/<ref>/<path>`, the file in the main column) are this
// one component, so the Files tree stays mounted, keeps the folders the reader
// opened, and highlights the file being read. The tree is fixed LEFT of the
// content, where every forge puts it, and is always shown: it has no collapse
// toggle and no remembered state. `/code` redirects here: it is the code
// browser.

import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { ActionButton } from '../components/action/ActionButton';
import {
  BranchSelector,
  Breadcrumbs,
  FileFinder,
  FileTree,
  ReadmePanel,
} from '../components/browser';
import type { BreadcrumbSegment } from '../components/browser';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PermissionDeniedState,
} from '../components/state';
import { useAuth } from '../hooks/useAuth';
import { useKeyboardShortcut } from '../hooks/useKeyboard';
import { useMarkdown } from '../hooks/useMarkdown';
import { useRealtime } from '../hooks/useRealtime';
import { useRepoTree } from '../hooks/useRepoTree';
import { useResolveRepo } from '../hooks/useResolveRepo';
import { useSelectionStore } from '../stores/selectionStore';
import type { TreeEntry } from '../api/types';

import { RepoFileContent } from './RepoFileContent';
import {
  blobPath,
  folderToReveal,
  openPullsLabel,
  parseRefAndPath,
  repoFrontPath,
  treePath,
} from './repoBrowserModel';
import { RepoCommitSummary } from './repositoryOverviewFacts';
import { ClonePopover } from './repositoryOverviewParts';

import '../components/browser/browser.css';
import './page.css';

export interface RepositoryBrowserPageProps {
  provider: string;
  fullName: string;
  /** `<ref>/<path>` of the open file; absent on the front page. */
  blobSplat?: string;
}

export function RepositoryBrowserPage({
  provider,
  fullName,
  blobSplat,
}: RepositoryBrowserPageProps): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const resolved = useResolveRepo(provider, fullName);
  const { user } = useAuth();
  const setRepo = useSelectionStore((s) => s.setCurrentRepo);

  const onFile = blobSplat !== undefined;
  const file = parseRefAndPath(blobSplat ?? '');
  const repoId = resolved.data?.id ?? null;
  const summary = resolved.data?.summary ?? null;
  const defaultBranch = summary?.default_branch ?? '';
  // One ref for the panel and the content: the URL's on a file page, `?ref=`
  // or the default branch on the front page.
  const activeRef = onFile ? file.ref : searchParams.get('ref') || defaultBranch;
  const front = repoFrontPath(provider, fullName);

  const [finderOpen, setFinderOpen] = useState(false);

  // A repository whose source is hosted elsewhere has no tree here. The root
  // listing is the same query the panel uses, so this costs no second request.
  const rootTree = useRepoTree(repoId, activeRef, '');
  const treeMissing = rootTree.error instanceof ApiError && rootTree.error.status === 404;
  // The README panel reads this too, so it costs one request. No tree AND no
  // README: a repository with no code here. A README alone is still shown.
  const readme = useMarkdown(repoId, activeRef);
  const noCodeHere = treeMissing && !onFile && readme.isError;

  useEffect(() => {
    setRepo(repoId);
    return () => setRepo(null);
  }, [repoId, setRepo]);

  useRealtime(repoId ? [`repo.${repoId}`] : []);

  useKeyboardShortcut(
    't',
    () => {
      if (repoId && !treeMissing) setFinderOpen(true);
    },
    { label: 'Open file finder', group: 'Navigation' }
  );

  const openFile = (entry: TreeEntry): void => {
    navigate(blobPath(provider, fullName, activeRef, entry.path));
  };

  const selectRef = (next: string): void => {
    if (onFile) {
      navigate(blobPath(provider, fullName, next, file.path));
      return;
    }
    const params = new URLSearchParams(searchParams);
    if (next === defaultBranch) params.delete('ref');
    else params.set('ref', next);
    setSearchParams(params, { replace: true });
  };

  const testId = onFile ? 'repo-file-page' : 'repo-overview-page';

  if (resolved.isPending) {
    return (
      <div className="page" data-testid={testId}>
        <LoadingState title="Loading repository…" variant="message" />
      </div>
    );
  }
  if (resolved.error) {
    if (resolved.error instanceof ApiError && resolved.error.status === 403) {
      return (
        <div className="page" data-testid={testId}>
          <PermissionDeniedState
            description="You do not have permission to view this repository."
            missingPermission="repo.read"
          />
        </div>
      );
    }
    return (
      <div className="page" data-testid={testId}>
        <ErrorState title="Could not load repository" error={resolved.error} />
      </div>
    );
  }
  if (!summary || !repoId) {
    // Signed out, only public repositories are listed: this one may be
    // private, so ask for a login and come back.
    if (!user) {
      const next = `${location.pathname}${location.search}${location.hash}`;
      return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
    }
    return (
      <div className="page" data-testid={testId}>
        <ErrorState
          title="Repository not found"
          description={`No repository named ${fullName} on ${provider}.`}
          action={
            <Link to="/repos">
              <ActionButton variant="primary">Back to repositories</ActionButton>
            </Link>
          }
        />
      </div>
    );
  }

  const frontWithRef =
    activeRef && activeRef !== defaultBranch
      ? `${front}?ref=${encodeURIComponent(activeRef)}`
      : front;
  // The trail from Repositories down to this repository is the shell's
  // (components/repo/RepoLayout). On a file this page adds only the path,
  // starting at the repository it is in, so no crumb is said twice. Every
  // segment but the last (the open file) is a link: the repository opens its
  // front, a folder opens that folder at the current ref.
  const parts = file.path.split('/').filter(Boolean);
  const pathCrumbs: BreadcrumbSegment[] = onFile
    ? [
        { label: summary.id.name, to: frontWithRef },
        ...parts.map((part, index) =>
          index === parts.length - 1
            ? { label: part }
            : {
                label: part,
                to: treePath(provider, fullName, activeRef, parts.slice(0, index + 1).join('/')),
              }
        ),
      ]
    : [];

  return (
    <div className="page" data-testid={testId}>
      {pathCrumbs.length > 0 ? (
        <Breadcrumbs segments={pathCrumbs} ariaLabel="File path" />
      ) : null}

      {/* The repository's name, health, score and badges are the shell's
          header (components/repo/RepoLayout), above the tab bar. */}
      <header className="page__header">
        {onFile ? null : (
          <RepoCommitSummary
            provider={provider}
            fullName={fullName}
            repoId={repoId}
            refName={activeRef}
          />
        )}
        <div className="repo-browser__line">
          <BranchSelector repoId={repoId} value={activeRef} onSelect={selectRef} />
          <Link to={`${front}/pulls`} className="repo-browser__fact">
            {openPullsLabel(summary.open_pull_requests)}
          </Link>
          <ClonePopover httpUrl={summary.clone_http_url} sshUrl={summary.clone_ssh_url} />
        </div>
      </header>

      <section
        className={`repo-browser${treeMissing ? '' : ' repo-browser--with-files'}`}
        aria-label={onFile ? 'File' : 'Repository overview'}
      >
        {/* Fixed on the left and always shown; a repository whose source is
            hosted elsewhere has no tree, so there is no panel for it. */}
        {treeMissing ? null : (
          <aside className="repo-browser__files" aria-label="Files">
            <div className="repo-browser__files-head">
              <ActionButton
                variant="ghost"
                onClick={() => setFinderOpen(true)}
                aria-label="Find files"
              >
                Find files (t)
              </ActionButton>
            </div>
            <FileTree
              repoId={repoId}
              refName={activeRef}
              selectedPath={onFile ? file.path : undefined}
              revealDir={folderToReveal(location.state) ?? undefined}
              onSelectFile={openFile}
            />
          </aside>
        )}
        <div className="repo-browser__main">
          {noCodeHere ? (
            <EmptyState
              title="No code on this forge"
              description="This repository’s source is hosted elsewhere, so there are no files or README to show here."
            />
          ) : onFile ? (
            <RepoFileContent
              provider={provider}
              fullName={fullName}
              repoId={repoId}
              refName={activeRef}
              path={file.path}
            />
          ) : (
            <ReadmePanel
              repoId={repoId}
              ref={activeRef}
              linkBase={blobPath(provider, fullName, activeRef, '')}
            />
          )}
        </div>
      </section>

      <FileFinder
        open={finderOpen}
        onClose={() => setFinderOpen(false)}
        repoId={repoId}
        refName={activeRef}
        onPick={(entry) => {
          openFile(entry);
          setFinderOpen(false);
        }}
      />
    </div>
  );
}
