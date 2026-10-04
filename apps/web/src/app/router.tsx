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
import { AdminSettingsPage } from '../pages/AdminSettingsPage';
import { FleetPage } from '../pages/FleetPage';
import { ForgeLinkRedirect } from '../pages/ForgeLinkRedirect';
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
import { RepositoryAgentsPage } from '../pages/RepositoryAgentsPage';
import { RepositoryFamilyPage } from '../pages/RepositoryFamilyPage';
import { RepositoryPullRequestsPage } from '../pages/RepositoryPullRequestsPage';
import { RepositorySettingsPage } from '../pages/RepositorySettingsPage';
import { ToolFleetPage } from '../pages/ToolFleetPage';
import { ToolFleetToolPage } from '../pages/ToolFleetToolPage';
import { ToolsPage } from '../pages/ToolsPage';
import {
  QualityGateHeadPage,
  QualityGatePage,
  QualityGateRulePage,
} from '../pages/qualityGate';
import { RepoRouter } from '../pages/RepoRouter';
import { ShiftQueuePage, TodoPage } from '../pages/shift';
import { WikiPage } from '../pages/wiki/WikiPage';

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
      // The same graph, laid out by dependency depth and coloured by pin staleness.
      { path: DEPENDENCIES_PATH.slice(1), element: <DependenciesPage /> },
      // Quality gate: how the jankurai/proof score behaves, rule -> head -> findings.
      { path: 'quality-gate', element: <QualityGatePage /> },
      { path: 'quality-gate/rules/:rule', element: <QualityGateRulePage /> },
      { path: 'quality-gate/heads/:owner/:name/:sha', element: <QualityGateHeadPage /> },
      { path: 'runners', element: <FleetPage /> },
      { path: 'shared-tools/findings', element: <ToolsPage /> },
      { path: 'shared-tools/proposals', element: <ProposalsPage /> },
      { path: 'shared-tools/adoption', element: <ToolFleetPage /> },
      { path: 'shared-tools/adoption/:tool', element: <ToolFleetToolPage /> },
      { path: 'settings', element: <AdminSettingsPage /> },
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
      { path: ':owner/:repo/issues/:number', element: <ForgeLinkRedirect subPath="issues" /> },
      { path: ':owner/:repo/blob/*', element: <ForgeLinkRedirect subPath="blob" /> },
      { path: ':owner/:repo/tree/*', element: <ForgeLinkRedirect subPath="tree" /> },
      { path: ':owner/:repo/commit/:sha', element: <ForgeLinkRedirect subPath="commit" /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
