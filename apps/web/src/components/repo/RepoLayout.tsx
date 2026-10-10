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
//
// Left of the content, a repository that belongs to a family carries that
// family's rail (RepoFamilyRail): the family is context, not a page of its
// own. A repository in no family says so in one muted chip and takes the
// whole width.

import { AlertTriangle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { JankuraiScoreBadge } from './JankuraiScoreBadge';
import {
  FamilyRailControl,
  RepoFamilyRail,
  useFamilyRail,
} from './RepoFamilyRail';
import { RepoArchivedBadge } from './RepoArchivedBadge';
import { RepoHealthPill } from './RepoHealthPill';
import { RepoRoleBadge } from './RepoRoleBadge';
import { TabBar } from './TabBar';
import { PageHeader, queryFreshness } from '../pageHeader';
import { PermissionDeniedState } from '../state';
import { useBootstrap } from '../../hooks/useBootstrap';
import { useAuth } from '../../hooks/useAuth';
import { useRepoAutomation } from '../../hooks/useRepoAutomation';
import { useResolveRepo } from '../../hooks/useResolveRepo';
import { QUALITY_GATE_PATH } from '../../pages/qualityGate/qualityGateModel';
import { healthOpensChecks, repoFrontPath, repoShellCrumbs } from '../../pages/repoBrowserModel';
import { firstMirror, mirrorTone } from '../../pages/repositoryMirrorModel';
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
  const rail = useFamilyRail(summary?.family, repoId, tab);

  const base = repoFrontPath(provider, fullName);
  const automation = useRepoAutomation(repoId);
  const mirror = firstMirror(automation.data?.mirrors);

  return (
    <div className="repo-shell" data-testid="repo-shell">
      {/* The shell's header is the page header of every repository route: the
          trail from Repositories down, the repository's name as the page's one
          h1, and how old the repository read is. The page inside the shell
          heads its own part with an h2. */}
      <PageHeader
        title={<span data-testid="repo-shell-title">{nameOf(fullName)}</span>}
        className="repo-shell__header"
        testId="repo-shell-header"
        parent="nav.repos"
        crumbs={repoShellCrumbs(provider, fullName, summary)}
        freshness={queryFreshness(resolved)}
        subtitle={summary?.description || undefined}
        actions={rail ? <FamilyRailControl rail={rail} /> : null}
        badges={
          summary ? (
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
              <MirrorBadge href={`${base}/settings/mirror#mirror`} tone={mirrorTone(mirror)} />
              {summary.family ? null : (
                <span
                  className="page__pill page__pill--muted"
                  data-testid="repo-no-family"
                  title="The forge puts this repository in no family"
                >
                  no family
                </span>
              )}
              <span className="page__pill">{summary.visibility}</span>
              {summary.language ? (
                <span className="page__pill">{summary.language}</span>
              ) : null}
            </>
          ) : null
        }
      >
        {summary && checksOpen && healthOpensChecks(summary) ? (
          <RepoHealthChecks repo={summary} />
        ) : null}
        <RepoTabs
          base={base}
          current={tab}
          mayOpenSettings={mayOpenSettings}
          openPullRequests={summary?.open_pull_requests ?? null}
          activeAgents={summary?.active_agents ?? null}
          automationWarnings={automation.data?.warnings.length ?? 0}
        />
      </PageHeader>

      <div
        className={`repo-shell__body${
          rail && rail.open ? ' repo-shell__body--with-rail' : ''
        }`}
      >
        {/* Hidden, not unmounted: the family is read once per repository page. */}
        {rail ? <RepoFamilyRail rail={rail} /> : null}
        <div className="repo-shell__content">
          {tab === 'settings' && !mayOpenSettings ? (
            <PermissionDeniedState
              description="Only a repository administrator or a writer can open these settings."
              missingPermission="repo.admin"
            />
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

function nameOf(fullName: string): string {
  return fullName.split('/').slice(-1)[0] ?? fullName;
}

function RepoTabs({
  base,
  current,
  mayOpenSettings,
  openPullRequests,
  activeAgents,
  automationWarnings,
}: {
  base: string;
  current: RepoTabKey;
  mayOpenSettings: boolean;
  openPullRequests: number | null;
  activeAgents: number | null;
  automationWarnings: number;
}): JSX.Element {
  const tabs = visibleRepoTabs(mayOpenSettings);
  // Automation is marked when something it reports needs a person; the query is
  // the same one the Automation tab reads, so the mark costs no extra request.
  const warned = automationWarnings > 0;

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

function MirrorBadge({
  href,
  tone,
}: {
  href: string;
  tone: ReturnType<typeof mirrorTone>;
}): JSX.Element | null {
  if (tone === 'unknown') return null;
  return (
    <Link
      to={href}
      className={`repo-mirror-link repo-mirror-link--${tone}`}
      data-testid="repo-header-mirror-badge"
      title="Open mirror settings"
    >
      GitHub ↗
    </Link>
  );
}
