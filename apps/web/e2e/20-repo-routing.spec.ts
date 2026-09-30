// 20-repo-routing.spec.ts — Verify repo sub-page routing works for all paths.
//
// The core issue: repo URLs have 3 segments after /repos/ (provider/owner/name)
// but the router uses a splat route. This test verifies that every sub-page
// (agents, code, pulls, settings) resolves correctly for the URL pattern.

import { expect, test, type Page } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import {
  mockBootstrap,
  mockReadme,
  mockRepoAgentRuns,
  mockRepoAutomation,
  mockRepoList,
  mockTree,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const REPO = { host: 'jeryu', owner: 'jeryu', name: 'jankurai' } as const;
const REPO_PATH = `/repos/${REPO.host}/${REPO.owner}/${REPO.name}`;

/** Each repo sub-path and the page that must own it. */
const ROUTES = [
  { tail: '', testId: 'repo-overview-page' },
  { tail: '/agents', testId: 'repo-agents-page' },
  { tail: '/agents/run-1', testId: 'repo-agents-page' },
  // The code browser is the front page's Files panel, and the retired
  // per-repository tracker URLs land there too instead of 404ing.
  { tail: '/code', testId: 'repo-overview-page', redirectsToFrontPage: true },
  { tail: '/work', testId: 'repo-overview-page', redirectsToFrontPage: true },
  { tail: '/issues', testId: 'repo-overview-page', redirectsToFrontPage: true },
  { tail: '/pulls', testId: 'repo-pulls-page' },
  { tail: '/settings', testId: 'repo-settings-page' },
] as const;

async function seed(page: Page): Promise<void> {
  await mockBootstrap(page);
  await mockRepoList(page, [
    {
      id: REPO,
      default_branch: 'main',
      visibility: 'public',
      active_agents: 2,
    },
  ]);
  await mockRepoAgentRuns(page, [
    {
      run_id: 'run-1',
      branch: 'agent/run-1',
      runner: 'xbabe0',
      status: 'running',
      tty_live: true,
    },
  ]);
  // The front page: a tree (the Files panel and its button need one), a README
  // and the automation panel's view. Without the tree the page draws "No code
  // on this forge" and has no Files button at all.
  await mockTree(page);
  await mockReadme(page, { html: '<h1>jankurai</h1>' });
  await mockRepoAutomation(page, { repo: 'jeryu/jankurai' });
}

test.describe('Repository sub-page routing', () => {
  test('every repo sub-path resolves to its page @action:repo.overview @action:repo.route_agents @action:repo.route_agent_run @action:repo.route_code @action:repo.route_pulls @action:repo.route_settings', async ({
    page,
  }) => {
    await seed(page);
    const shell = new AppShellPage(page);

    for (const route of ROUTES) {
      await shell.goto(`${REPO_PATH}${route.tail}`);
      await shell.assertShellLoaded();
      await expect(page.getByTestId(route.testId)).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText(/Repository not found/i)).toHaveCount(0);
      if ('redirectsToFrontPage' in route) {
        await expect(page).toHaveURL(new RegExp(`${REPO_PATH}$`));
      }
    }

    // /agents/run-1 selects that run: its terminal mounts for run-1.
    await shell.goto(`${REPO_PATH}/agents/run-1`);
    await expect(page.getByTestId('agent-terminal')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('agent-terminal')).toHaveAttribute(
      'data-run-id',
      'run-1'
    );

    // The front page owns Code; the retired tracker has no nav entry.
    await shell.goto(REPO_PATH);
    await expect(
      page.getByRole('button', { name: 'Files', exact: true })
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('link', { name: 'Tracker' })).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Code', exact: true })
    ).toHaveAttribute('href', REPO_PATH);
  });

  test('left-nav shows repo context (Code, Agents, Pulls, Settings) inside a repo @action:repo.context_nav', async ({
    page,
  }) => {
    await seed(page);
    const shell = new AppShellPage(page);
    await shell.goto(REPO_PATH);
    await shell.assertShellLoaded();

    // The left nav should show the repo-context navigation.
    const agentsLink = page.getByTestId('left-nav-agents');
    await expect(agentsLink).toBeVisible();
    // The agents link should point to the correct URL.
    await expect(agentsLink).toHaveAttribute('href', `${REPO_PATH}/agents`);
  });
});
