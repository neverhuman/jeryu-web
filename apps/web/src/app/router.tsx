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

import { Navigate, createBrowserRouter, useParams } from 'react-router-dom';

import { AppShell } from '../layout/AppShell';
import { AdminSettingsPage } from '../pages/AdminSettingsPage';
import { AuditPage } from '../pages/AuditPage';
import { FleetPage } from '../pages/FleetPage';
import { ReleasesPage } from '../pages/ReleasesPage';
import { UnreleasedPage } from '../pages/UnreleasedPage';
import { IntelligencePage } from '../pages/IntelligencePage';
import { IssuesPage } from '../pages/IssuesPage';
import { PullRequestPage } from '../pages/PullRequestPage';
import { PullRoomPage } from '../pages/PullRoomPage';
import { ProposalsPage } from '../pages/ProposalsPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { RepositoriesPage } from '../pages/RepositoriesPage';
import { RepositoryAgentsPage } from '../pages/RepositoryAgentsPage';
import { RepositoryCodePage } from '../pages/RepositoryCodePage';
import { RepositoryFilePage } from '../pages/RepositoryFilePage';
import { RepositoryFamilyPage } from '../pages/RepositoryFamilyPage';
import { RepositoryPullRequestsPage } from '../pages/RepositoryPullRequestsPage';
import { RepositoryOverviewPage } from '../pages/RepositoryOverviewPage';
import { RepositorySettingsPage } from '../pages/RepositorySettingsPage';
import { SearchResultsPage } from '../pages/SearchResultsPage';
import { ToolFleetPage } from '../pages/ToolFleetPage';
import { ToolFleetToolPage } from '../pages/ToolFleetToolPage';
import { ToolsPage } from '../pages/ToolsPage';
import { RepoRouter } from '../pages/RepoRouter';
import { WorkDetailPage } from '../pages/WorkDetailPage';
import { WorkPage } from '../pages/WorkPage';
import { ShiftAddPage, ShiftQueuePage, ShiftWorkersPage } from '../pages/shift';

import {
  ADOPTION_PATH,
  FINDINGS_PATH,
} from '../pages/sharedTools/SharedToolsTabs';

/** `/tool-fleet/:tool` → `/shared-tools/adoption/:tool`. */
function ToolFleetToolRedirect(): JSX.Element {
  const { tool = '' } = useParams();
  return <Navigate to={`${ADOPTION_PATH}/${encodeURIComponent(tool)}`} replace />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/repos/family/jeryu-split" replace /> },
      { path: 'login', element: <Navigate to="/repos/family/jeryu-split" replace /> },
      { path: 'signup', element: <Navigate to="/repos/family/jeryu-split" replace /> },
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
      { path: 'work', element: <WorkPage /> },
      // Static `shift` segments outrank the dynamic `:key` detail route.
      { path: 'work/shift', element: <ShiftQueuePage /> },
      { path: 'work/shift/new', element: <ShiftAddPage /> },
      { path: 'work/shift/workers', element: <ShiftWorkersPage /> },
      { path: 'work/:key', element: <WorkDetailPage /> },
      { path: 'pull-room', element: <PullRoomPage /> },
      { path: 'releases', element: <ReleasesPage /> },
      { path: 'unreleased', element: <UnreleasedPage /> },
      { path: 'intelligence', element: <IntelligencePage /> },
      { path: 'runners', element: <FleetPage /> },
      { path: 'fleet', element: <Navigate to="/runners" replace /> },
      { path: 'shared-tools', element: <Navigate to={FINDINGS_PATH} replace /> },
      { path: 'shared-tools/findings', element: <ToolsPage /> },
      { path: 'shared-tools/proposals', element: <ProposalsPage /> },
      { path: 'shared-tools/adoption', element: <ToolFleetPage /> },
      { path: 'shared-tools/adoption/:tool', element: <ToolFleetToolPage /> },
      // The earlier Shared Code and Tool Fleet paths redirect to their new homes.
      { path: 'shared-code', element: <Navigate to={FINDINGS_PATH} replace /> },
      { path: 'tools', element: <Navigate to={FINDINGS_PATH} replace /> },
      { path: 'tool-fleet', element: <Navigate to={ADOPTION_PATH} replace /> },
      { path: 'tool-fleet/:tool', element: <ToolFleetToolRedirect /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'audit', element: <AuditPage /> },
      { path: 'search', element: <SearchResultsPage /> },
      { path: 'settings', element: <AdminSettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
