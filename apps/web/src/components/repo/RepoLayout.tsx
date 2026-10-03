// RepoLayout.tsx — the shell every repository page is drawn inside.
//
// One header naming the repository (its health, score, role, visibility) and
// one tab bar across the top, so Code, Pull requests, Automation, Agents,
// Activity and Settings are one click apart from wherever the reader is. The
// repository used to be navigated from a block at the bottom of the global left
// navigation, which had no counts and offered Settings to everyone.
//
// The bar is the shared `TabBar`: a `<nav aria-label="Repository">` of links,
// the current one carrying `aria-current="page"`, arrow keys moving between
// them. The pull request page is navigated by the same component.

import { AlertTriangle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { JankuraiScoreBadge } from './JankuraiScoreBadge';
import { RepoArchivedBadge } from './RepoArchivedBadge';
import { RepoHealthPill } from './RepoHealthPill';
import { RepoRoleBadge } from './RepoRoleBadge';
import { TabBar } from './TabBar';
import { PermissionDeniedState } from '../state';
import { useBootstrap } from '../../hooks/useBootstrap';
import { useAuth } from '../../hooks/useAuth';
import { useRepoAutomation } from '../../hooks/useRepoAutomation';
import { useResolveRepo } from '../../hooks/useResolveRepo';
import { QUALITY_GATE_PATH } from '../../pages/qualityGate/qualityGateModel';
import { healthOpensChecks, repoFrontPath } from '../../pages/repoBrowserModel';
import {
  RepoHealthChecks,
  RepoHealthChip,
} from '../../pages/repositoryOverviewFacts';
import {
  canSeeRepoSettings,
  repoTabCount,
  repoTabHref,
  visibleRepoTabs,
  type RepoTabKey,
} from '../../pages/repoShellModel';

import './repoShell.css';

export interface RepoLayoutProps {
  provider: string;
  fullName: string;
  /** Which tab the page inside is. */
  tab: RepoTabKey;
  children: ReactNode;
}

export function RepoLayout({
  provider,
  fullName,
  tab,
  children,
}: RepoLayoutProps): JSX.Element {
  const resolved = useResolveRepo(provider, fullName);
  const summary = resolved.data?.summary ?? null;
  const repoId = resolved.data?.id ?? null;
  const { user } = useAuth();
  const bootstrap = useBootstrap();
  const permissions = bootstrap.data?.viewer.global_permissions ?? [];
  const mayOpenSettings = canSeeRepoSettings(user?.role, permissions);
  // The header's health chip stands for failing checks; pressing it lists them.
  const [checksOpen, setChecksOpen] = useState(false);

  const base = repoFrontPath(provider, fullName);

  return (
    <div className="repo-shell" data-testid="repo-shell">
      <header className="repo-shell__header">
        <div className="repo-shell__head">
          <span className="repo-shell__owner">{ownerOf(fullName)} /</span>
          <h1 className="repo-shell__title" data-testid="repo-shell-title">{nameOf(fullName)}</h1>
          {summary ? (
            <>
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
              {summary.language ? (
                <span className="page__pill">{summary.language}</span>
              ) : null}
            </>
          ) : null}
        </div>
        {summary?.description ? (
          <p className="page__subtitle">{summary.description}</p>
        ) : null}
        {summary && checksOpen && healthOpensChecks(summary) ? (
          <RepoHealthChecks repo={summary} />
        ) : null}
        <RepoTabs
          base={base}
          current={tab}
          repoId={repoId}
          mayOpenSettings={mayOpenSettings}
          openPullRequests={summary?.open_pull_requests ?? null}
          activeAgents={summary?.active_agents ?? null}
        />
      </header>

      {tab === 'settings' && !mayOpenSettings ? (
        <PermissionDeniedState
          description="Only a repository administrator or a writer can open these settings."
          missingPermission="repo.admin"
        />
      ) : (
        children
      )}
    </div>
  );
}

function ownerOf(fullName: string): string {
  return fullName.split('/').slice(0, -1).join('/');
}

function nameOf(fullName: string): string {
  return fullName.split('/').slice(-1)[0] ?? fullName;
}

function RepoTabs({
  base,
  current,
  repoId,
  mayOpenSettings,
  openPullRequests,
  activeAgents,
}: {
  base: string;
  current: RepoTabKey;
  repoId: string | null;
  mayOpenSettings: boolean;
  openPullRequests: number | null;
  activeAgents: number | null;
}): JSX.Element {
  const tabs = visibleRepoTabs(mayOpenSettings);
  // Automation is marked when something it reports needs a person; the query is
  // the same one the Automation tab reads, so the mark costs no extra request.
  const automation = useRepoAutomation(repoId);
  const warned = (automation.data?.warnings.length ?? 0) > 0;

  const items = tabs.map((tab) => ({
    key: tab.key,
    label: tab.label,
    href: repoTabHref(base, tab),
    count: repoTabCount(tab.key, { openPullRequests, activeAgents }),
    marker:
      tab.key === 'automation' && warned ? (
        <span
          className="repo-tabs__warning"
          data-testid="repo-tab-automation-warning"
        >
          <AlertTriangle size={14} aria-hidden="true" />
          <span className="sr-only">needs a person</span>
        </span>
      ) : undefined,
  }));

  return (
    <TabBar
      label="Repository"
      items={items}
      current={current}
      testId="repo-tabs"
      idPrefix="repo-tab"
    />
  );
}
