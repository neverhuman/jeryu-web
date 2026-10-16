// router.tsx — declarative route map (W-FE-02).
//
// Repository URLs use the pattern `/repos/:provider/:owner/:name[/sub-path]`.
// Because `:owner/:name` spans two segments, we cannot use a single `:fullName`
// param for leaf routes (code, agents, pulls, etc.) — React Router's named
// params only match one segment. Instead we use a single catch-all splat
// route `repos/:provider/*` and each repo page component parses the owner,
// name, and sub-path from the splat.
//
// The repoRouteParser utility centralizes this parsing.

import { createBrowserRouter } from 'react-router-dom';

import { MOVED_ROUTES, movedRouteElement } from './movedRoutes';
import { AppShell } from '../layout/AppShell';
import { HomeRedirect } from '../layout/HomeRedirect';
import { ActivityPage } from '../pages/activity';
import { BotsPage } from '../pages/bots/BotsPage';
import { OrganizationsPage } from '../pages/orgs/OrganizationsPage';
import { AdminSettingsPage } from '../pages/AdminSettingsPage';
import { FleetPage } from '../pages/FleetPage';
import { ForgeLinkRedirect } from '../pages/ForgeLinkRedirect';
import { HelpPage } from '../pages/HelpPage';
import { HELP_PATH } from '../pages/helpPath';
import { ReleasesPage, ReleasesRoute } from '../pages/ReleasesPage';
import { DependenciesPage, DEPENDENCIES_PATH } from '../pages/DependenciesPage';
import { IntelligencePage } from '../pages/IntelligencePage';
import { PullRequestPage } from '../pages/PullRequestPage';
import { PullRoomPage } from '../pages/PullRoomPage';
import { ProposalsPage } from '../pages/ProposalsPage';
import { NeedsYouPage } from '../pages/needsYou';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RepositoriesPage } from '../pages/RepositoriesPage';
import { SearchPage } from '../pages/search/SearchPage';
import { SessionPage } from '../pages/SessionPage';
import { SessionsPage } from '../pages/SessionsPage';
import { FlowPage } from '../pages/flow';
import { ScorecardPage } from '../pages/scorecard';
import { ActiveAgentsPage } from '../pages/ActiveAgentsPage';
import { RepositoryAgentsPage } from '../pages/RepositoryAgentsPage';
import { RepositoryFamilyPage } from '../pages/RepositoryFamilyPage';
import { RepositoryPullRequestsPage } from '../pages/RepositoryPullRequestsPage';
import { ToolFleetPage } from '../pages/ToolFleetPage';
import { ToolFleetToolPage } from '../pages/ToolFleetToolPage';
import { ToolsPage } from '../pages/ToolsPage';
import {
  QualityGateHeadPage,
  QualityGateLatestHeadPage,
  QualityGatePage,
  QualityGateRulePage,
} from '../pages/qualityGate';
import { RepoRouter } from '../pages/RepoRouter';
import { ShiftQueuePage, TodoPage } from '../pages/shift';
import { WaitlistPage } from '../pages/WaitlistPage';
import {
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '../pages/account/AccountRecoveryPages';
import { CreateAccountPage } from '../pages/account/CreateAccountPage';
import { WikiPage } from '../pages/wiki/WikiPage';
import { YieldPage } from '../pages/yield';

import { IN_FLIGHT_PATH } from '../pages/pullRoomModel';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      // Admins land on "Needs you"; everyone else on the split family browser.
      { index: true, element: <HomeRedirect /> },
      { path: 'login', element: <HomeRedirect /> },
      { path: 'signup', element: <HomeRedirect /> },
      { path: 'needs-you', element: <NeedsYouPage /> },
      { path: 'activity', element: <ActivityPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'repos', element: <RepositoriesPage /> },
      { path: 'repos/new', element: <RepositoriesPage mode="create" /> },
      // Family drill-down. Declared before the `repos/:provider/*` catch-all
      // so the static `family` segment wins over the dynamic provider.
      { path: 'repos/family/:family', element: <RepositoryFamilyPage /> },
      // Single catch-all for all repo routes. The RepoRouter component
      // parses the splat to determine the sub-page.
      {
        path: 'repos/:provider/*',
        element: <RepoRouter />,
      },
      // Your agent sessions across repositories.
      { path: 'sessions', element: <SessionsPage /> },
      // One session: its VM, what it started from, both terminals' controls.
      { path: 'sessions/:sessionId', element: <SessionPage /> },
      // Work is one page: add work, who is working, the queue of every family.
      { path: 'work', element: <ShiftQueuePage /> },
      // One todo's own page; Needs you, Activity and the queue link here.
      { path: 'work/:key', element: <TodoPage /> },
      { path: IN_FLIGHT_PATH.slice(1), element: <PullRoomPage /> },
      // `/releases?family=x` (the board) redirects to `/releases/family/x`.
      { path: 'releases', element: <ReleasesRoute /> },
      // One family's release board; each lane is `#lane-<id>` on it.
      { path: 'releases/family/:family', element: <ReleasesPage /> },
      { path: 'intelligence', element: <IntelligencePage /> },
      // Spend against what reached main: cost per merged change.
      { path: 'yield', element: <YieldPage /> },
      // Outcome delivery scorecard: speed, quality, recovery and economics.
      { path: 'scorecard', element: <ScorecardPage /> },
      // The delivery line: what is at each station, and which one holds the waiting.
      { path: 'flow', element: <FlowPage /> },
      // The same graph, laid out by dependency depth and coloured by pin staleness.
      { path: DEPENDENCIES_PATH.slice(1), element: <DependenciesPage /> },
      // Quality gate: how the jankurai/proof score behaves, rule -> head -> findings.
      { path: 'quality-gate', element: <QualityGatePage /> },
      { path: 'quality-gate/rules/:rule', element: <QualityGateRulePage /> },
      // A repository's newest score: the badge on repo surfaces links here.
      { path: 'quality-gate/heads/:owner/:name', element: <QualityGateLatestHeadPage /> },
      { path: 'quality-gate/heads/:owner/:name/:sha', element: <QualityGateHeadPage /> },
      { path: 'runners', element: <FleetPage /> },
      { path: 'agents', element: <ActiveAgentsPage /> },
      { path: 'shared-tools/findings', element: <ToolsPage /> },
      { path: 'shared-tools/proposals', element: <ProposalsPage /> },
      { path: 'shared-tools/adoption', element: <ToolFleetPage /> },
      { path: 'shared-tools/adoption/:tool', element: <ToolFleetToolPage /> },
      { path: 'settings', element: <AdminSettingsPage /> },
      // How to get around: the keys, which System page answers what, and where
      // the account controls are.
      { path: HELP_PATH.slice(1), element: <HelpPage /> },
      { path: 'bots', element: <BotsPage /> },
      // Organizations, their owners and teams, and the team agents they own.
      { path: 'orgs', element: <OrganizationsPage /> },
      // The internal wiki: the repository chosen in Settings, read as pages.
      { path: 'wiki', element: <WikiPage /> },
      { path: 'wiki/*', element: <WikiPage /> },
      // Every path a page used to have, in one table: see movedRoutes.tsx.
      ...MOVED_ROUTES.map((moved) => ({
        path: moved.path,
        element: movedRouteElement(moved),
      })),
      // Forge-shaped links (`/<owner>/<repo>/pull/<n>` and the rest of the
      // shapes GitHub uses) are everywhere: pull request bodies, notifications,
      // agent output, bookmarks. They land on the canonical
      // `/repos/<provider>/<owner>/<repo>/…`, whose tab names are the forge's
      // own. Declared after every reserved top-level name above so `:owner`
      // cannot shadow one, and before the catch-all so an unknown path is
      // still a 404.
      { path: ':owner/:repo', element: <ForgeLinkRedirect /> },
      { path: ':owner/:repo/pulls', element: <ForgeLinkRedirect subPath="pulls" /> },
      { path: ':owner/:repo/pull/:number', element: <ForgeLinkRedirect subPath="pulls" /> },
      // A pull request's own tabs, so a deep link to Files or Checks keeps it.
      { path: ':owner/:repo/pull/:number/:tab', element: <ForgeLinkRedirect subPath="pulls" /> },
      { path: ':owner/:repo/issues/:number', element: <ForgeLinkRedirect subPath="issues" /> },
      { path: ':owner/:repo/blob/*', element: <ForgeLinkRedirect subPath="blob" /> },
      { path: ':owner/:repo/tree/*', element: <ForgeLinkRedirect subPath="tree" /> },
      { path: ':owner/:repo/commit/:sha', element: <ForgeLinkRedirect subPath="commit" /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '/waitlist', element: <WaitlistPage /> },
  // Where account emails lead: no session needed, so outside the shell.
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/verify-email', element: <VerifyEmailPage /> },
  // Sign-up, step two: the mailed sign-up link lands here.
  { path: '/create-account', element: <CreateAccountPage /> },
]);
