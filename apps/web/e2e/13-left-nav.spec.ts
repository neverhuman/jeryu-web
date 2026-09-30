// 13-left-nav.spec.ts — primary navigation smoke (Slice C-web).

import { expect, test, type Page } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import {
  mockBootstrap,
  mockControlPlaneRunners,
  mockFleetBootstrap,
  mockRepoList,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

async function mockIntelligence(page: Page): Promise<void> {
  await page.route('**/api/v1/control-plane/status**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 'jeryu.control_plane/v1',
        generatedAt: '2026-06-05T00:00:00Z',
        localAuthority: {
          sourceOfTruth: 'local_jeryu',
          state: 'fresh',
          docsUrl: 'docs/architecture.md',
        },
        summary: {
          repoCount: 1,
          openPrCount: 0,
          draftPrCount: 0,
          queuedCheckCount: 0,
          runningCheckCount: 0,
          failingCheckCount: 0,
          missingCheckPrCount: 0,
          priorityCount: 0,
          criticalPriorityCount: 0,
          highPriorityCount: 0,
          mirrorState: 'missing',
          artifactState: 'missing',
          runnerState: 'fresh',
        },
        repos: [],
        pullRequests: [],
        checkRuns: [],
        workflows: [],
        releases: {
          state: 'missing',
          latestRelease: null,
          releaseCount: 0,
          reason: 'release persistence absent',
          docsUrl: 'docs/release.md',
        },
        artifacts: {
          schemaVersion: 'jeryu.artifacts.latest/v1',
          state: 'missing',
          latestBuild: {
            state: 'missing',
            artifactCount: 0,
            reason: 'local build artifacts absent',
            sourceLinks: [],
          },
          latestRelease: {
            state: 'missing',
            artifactCount: 0,
            reason: 'release artifact evidence absent',
            sourceLinks: [],
          },
          mirrorArtifacts: {
            state: 'missing',
            artifactCount: 0,
            reason: 'mirror artifact adapter missing',
            sourceLinks: [],
          },
          docsUrl: 'docs/release.md#release-receipt',
          absenceIsSuccess: false,
        },
        runners: {
          schemaVersion: 'jeryu.runner_fabric/v1',
          local: {
            state: 'fresh',
            nodes: 1,
            onlineRunners: 1,
            offlineRunners: 0,
            busyRunners: 0,
            idleRunners: 1,
            totalSlots: 10,
            activeSlots: 10,
            utilization: 0,
            lastUpdated: '2026-06-05T00:00:00Z',
            nodeDetails: [],
          },
          mirror: {
            name: 'github_actions_runners',
            state: 'missing',
            reason: 'runner mirror missing',
            docsUrl: 'docs/agent-native-standard.md',
          },
        },
        workcells: {},
        agentRuns: [],
        codegraph: {
          state: 'missing',
          indexedSymbols: 0,
          indexedReferences: 0,
          crateEdges: 0,
          indexedFiles: 0,
          latestIndexRun: null,
          reason: 'codegraph empty',
        },
        toolBuild: {
          state: 'missing',
          clusterCount: 0,
          ignoredCount: 0,
          topClusters: [],
        },
        mcp: {
          state: 'fresh',
          toolCount: 42,
          liveBackedTools: ['jeryu.control_plane.status'],
          degradedTools: [],
        },
        mirror: {
          schemaVersion: 'jeryu.remote.status/v1',
          state: 'missing',
          mirrors: [],
          divergence: {
            state: 'unknown',
            reason: 'GitHub mirror evidence unavailable',
            localDefaultBranches: [],
            mirrorDefaultBranches: [],
          },
        },
        priorities: [],
        repoGraph: {
          schemaVersion: 'jeryu.repo_graph/v1',
          generatedAt: '2026-06-05T00:00:00Z',
          nodes: [],
          edges: [],
          clusters: [],
          insights: [],
        },
      }),
    });
  });
}

test.describe('Primary left navigation', () => {
  test('routes every left-nav destination without hitting NotFound @action:chrome.sidebar_nav @action:settings.render @action:shared_tools.nav', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockRepoList(page, [
      {
        id: { host: 'jeryu', owner: 'neverhuman', name: 'veox' },
        default_branch: 'main',
        description: 'Dogfood repo',
        visibility: 'public',
      },
    ]);
    await mockIntelligence(page);
    await mockFleetBootstrap(page, [
      {
        pool: 'trusted',
        tags: ['rust-hot'],
        running_jobs: 1,
        active_slots: 4,
        online_runners: 4,
      },
    ]);
    await mockControlPlaneRunners(page, {
      schemaVersion: 'jeryu.runner_fabric/v1',
      local: {
        state: 'fresh',
        nodes: 1,
        onlineRunners: 1,
        offlineRunners: 0,
        busyRunners: 0,
        idleRunners: 1,
        totalSlots: 10,
        activeSlots: 10,
        utilization: 0,
        lastUpdated: '2026-06-05T00:00:00Z',
        nodeDetails: [],
      },
      mirror: {
        name: 'github_actions_runners',
        state: 'missing',
        reason: 'optional GitHub mirror runner adapter is not configured',
        docsUrl: 'docs/agent-native-standard.md',
      },
    });

    const shell = new AppShellPage(page);
    await shell.goto('/');
    await shell.assertShellLoaded();

    const routes = [
      {
        label: 'Needs you',
        path: '/needs-you',
        testId: 'needs-you-page',
      },
      {
        label: 'Activity',
        path: '/activity',
        testId: 'activity-page',
      },
      {
        label: 'Pull requests',
        path: '/pull-room',
        testId: 'pull-room-page',
      },
      {
        label: 'Repositories',
        path: '/repos',
        testId: 'repositories-page',
      },
      // The three below live in the System group, opened just before the loop.
      {
        label: 'Runners',
        path: '/runners',
        testId: 'fleet-page',
      },
      {
        label: 'Intelligence',
        path: '/intelligence',
        testId: 'intelligence-page',
      },
      {
        // Lands on the first tab (Findings) through the section redirect.
        label: 'Shared tools',
        path: '/shared-tools/findings',
        testId: 'tools-page',
      },
    ] as const;

    // Six daily destinations; the machinery sits behind one closed disclosure.
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const system = nav.getByRole('button', { name: 'System' });
    await expect(system).toHaveAttribute('aria-expanded', 'false');
    await expect(nav.getByRole('link', { name: 'Runners', exact: true })).toHaveCount(0);
    await system.click();
    await expect(system).toHaveAttribute('aria-expanded', 'true');

    // A nav click is an in-app navigation, never a page reload: a reload drops
    // this marker (and used to reconnect the live socket on every click).
    await page.evaluate(() => {
      Reflect.set(window, '__navMarker', 'kept');
    });
    for (const route of routes) {
      const expectedUrl = new RegExp(`${route.path.replace(/\//g, '\\/')}$`);
      await Promise.all([
        page.waitForURL(expectedUrl),
        page.getByRole('link', { name: route.label, exact: true }).click(),
      ]);
      await expect(page).toHaveURL(expectedUrl);
      await shell.assertShellLoaded();
      if ('testId' in route) {
        await expect(page.getByTestId(route.testId)).toBeVisible();
      }
      await expect(page.getByText(/Page not found/i)).toHaveCount(0);
      expect(await page.evaluate(() => Reflect.get(window, '__navMarker'))).toBe('kept');
    }

    // On a System page the group is open and cannot be closed over the current page.
    await expect(nav.getByRole('button', { name: 'System' })).toBeDisabled();
    await expect(nav.getByRole('link', { name: 'Shared tools', exact: true })).toHaveAttribute('aria-current', 'page');

    // Settings is not a left-nav destination: it opens from the top-right
    // account control, and ends with the Session section that holds Log out.
    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Settings', exact: true })
    ).toHaveCount(0);
    await Promise.all([
      page.waitForURL(/\/settings$/),
      page.getByRole('banner').getByRole('link', { name: 'Settings' }).click(),
    ]);
    await shell.assertShellLoaded();
    await expect(page.getByTestId('settings-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Session' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  });
});
