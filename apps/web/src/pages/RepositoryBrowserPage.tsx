// RepositoryBrowserPage.tsx — the one repository page.
//
// The repository front page (`/repos/:p/:o/:r`, README in the main column) and
// the file page (`…/blob/<ref>/<path>`, the file in the main column) are this
// one component, so the Files panel on the right stays mounted, keeps the
// folders the reader opened, and highlights the file being read. A "Files"
// button in the header shows and hides the panel; the choice is remembered.
// `/code` redirects here with the panel open: the panel is the code browser.

import { PanelRightClose, PanelRightOpen } from 'lucide-react';
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
import { JankuraiScoreBadge } from '../components/repo/JankuraiScoreBadge';
import { RepoAutomationPanel } from '../components/repo/RepoAutomationPanel';
import { RepoHealthPill } from '../components/repo/RepoHealthPill';
import { RepoArchivedBadge } from '../components/repo/RepoArchivedBadge';
import { RepoRoleBadge } from '../components/repo/RepoRoleBadge';
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
import { readBrowserText, writeBrowserText } from '../storage/browserStorage';
import { useSelectionStore } from '../stores/selectionStore';
import type { TreeEntry } from '../api/types';

import { RepoFileContent } from './RepoFileContent';
import { QUALITY_GATE_PATH } from './qualityGate/qualityGateModel';
import {
  FILES_PANEL_KEY,
  asksForFilesOpen,
  blobPath,
  folderToReveal,
  healthOpensChecks,
  initialPanelOpen,
  openPullsLabel,
  panelChoiceText,
  parseRefAndPath,
  repoFrontPath,
} from './repoBrowserModel';
import {
  RepoCommitSummary,
  RepoHealthChecks,
  RepoHealthChip,
} from './repositoryOverviewFacts';
import { ClonePopover } from './repositoryOverviewParts';

import '../components/browser/browser.css';
import './page.css';

const FILES_PANEL_ID = 'repo-files-panel';

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

  const [filesOpen, setFilesOpen] = useState<boolean>(
    () =>
      asksForFilesOpen(location.state) ||
      initialPanelOpen(readBrowserText('durable', FILES_PANEL_KEY), window.innerWidth)
  );
  const [finderOpen, setFinderOpen] = useState(false);
  // The header's health chip stands for failing checks; pressing it lists them.
  const [checksOpen, setChecksOpen] = useState(false);

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

  const toggleFiles = (): void => {
    const next = !filesOpen;
    setFilesOpen(next);
    writeBrowserText('durable', FILES_PANEL_KEY, panelChoiceText(next));
  };

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
  const crumbs: BreadcrumbSegment[] = [
    { label: 'Repos', to: '/repos' },
    // The host is often named like the owner under it ("jeryu / … / jeryu"):
    // say which one it is so the repeat reads as two different things.
    { label: provider, prefix: 'host', to: `/repos?host=${provider}` },
    ...(summary.family
      ? [{ label: summary.family, to: `/repos/family/${encodeURIComponent(summary.family)}` }]
      : []),
    { label: summary.id.owner },
    onFile ? { label: summary.id.name, to: frontWithRef } : { label: summary.id.name },
    ...(onFile
      ? file.path
          .split('/')
          .filter(Boolean)
          .map((part) => ({ label: part }))
      : []),
  ];
  const showPanel = filesOpen && !treeMissing;
  const findFiles = (
    <ActionButton variant="ghost" onClick={() => setFinderOpen(true)} aria-label="Find files">
      Find files (t)
    </ActionButton>
  );

  return (
    <div className="page" data-testid={testId}>
      <Breadcrumbs segments={crumbs} />

      <header className="page__header">
        <div className="repo-overview__head">
          <h1 className="repo-overview__title">{summary.id.name}</h1>
          {healthOpensChecks(summary) ? (
            <RepoHealthChip
              repo={summary}
              open={checksOpen}
              onToggle={() => setChecksOpen((v) => !v)}
            />
          ) : (
            <RepoHealthPill health={summary.health} />
          )}
          {/* The score links to the quality gate, as it does in the table. */}
          <Link
            to={QUALITY_GATE_PATH}
            className="repo-overview__score-link"
            title="See what produced this score"
            data-testid="repo-overview-score"
          >
            <JankuraiScoreBadge
              score={summary.jankurai_score}
              decision={summary.jankurai_decision}
              scoredAt={summary.jankurai_scored_at}
            />
          </Link>
          <RepoRoleBadge role={summary.repo_role} />
          <RepoArchivedBadge archived={summary.archived} />
          <span className="page__pill">{summary.visibility}</span>
          {summary.language ? <span className="page__pill">{summary.language}</span> : null}
        </div>
        {!onFile && summary.description ? (
          <p className="page__subtitle">{summary.description}</p>
        ) : null}
        {onFile ? null : <RepoCommitSummary repoId={repoId} refName={activeRef} />}
        <div className="repo-browser__line">
          <BranchSelector repoId={repoId} value={activeRef} onSelect={selectRef} />
          <Link to={`${front}/pulls`} className="repo-browser__fact">
            {openPullsLabel(summary.open_pull_requests)}
          </Link>
          <ClonePopover httpUrl={summary.clone_http_url} sshUrl={summary.clone_ssh_url} />
          <span className="repo-browser__spacer" aria-hidden="true" />
          {treeMissing ? null : (
            <>
              {/* Beside an open panel the panel carries this; one affordance each. */}
              {showPanel ? null : findFiles}
              <ActionButton
                // The page's one filled action, and only while the panel is closed.
                variant={filesOpen ? 'default' : 'primary'}
                onClick={toggleFiles}
                aria-expanded={filesOpen}
                aria-controls={FILES_PANEL_ID}
                icon={
                  filesOpen ? (
                    <PanelRightClose size={14} aria-hidden="true" />
                  ) : (
                    <PanelRightOpen size={14} aria-hidden="true" />
                  )
                }
              >
                Files
              </ActionButton>
            </>
          )}
        </div>
        {checksOpen && healthOpensChecks(summary) ? (
          <RepoHealthChecks repo={summary} />
        ) : null}
      </header>

      <section
        className={`repo-browser${showPanel ? ' repo-browser--with-files' : ''}`}
        aria-label={onFile ? 'File' : 'Repository overview'}
      >
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
        {/* Hidden, not unmounted: the folders the reader opened stay open. */}
        <aside
          id={FILES_PANEL_ID}
          className="repo-browser__files"
          aria-label="Files"
          hidden={!showPanel}
        >
          <div className="repo-browser__files-head">{findFiles}</div>
          <FileTree
            repoId={repoId}
            refName={activeRef}
            selectedPath={onFile ? file.path : undefined}
            revealDir={folderToReveal(location.state) ?? undefined}
            onSelectFile={openFile}
          />
        </aside>
      </section>

      {/* What runs on the repository, and where it is copied to. Only on the
          front page: a reader opening a file wants the file. */}
      {onFile ? null : <RepoAutomationPanel repoId={repoId} />}

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
