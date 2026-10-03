// 19-agents-navigation.spec.ts — Agents page discoverability and navigation.
//
// Tests that the operator can reach the Agents page from the repository's own
// tab bar, which is on every one of its pages (components/repo/RepoLayout).

import { expect, test, type Page } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import {
  mockBootstrap,
  mockRepoAgentRuns,
  mockRepoList,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const REPO = { host: 'jeryu', owner: 'jeryu', name: 'veox' } as const;
const REPO_PATH = `/repos/${REPO.host}/${REPO.owner}/${REPO.name}`;

async function seed(page: Page): Promise<void> {
  await mockBootstrap(page);
  await mockRepoList(page, [
    {
      id: REPO,
      default_branch: 'main',
      visibility: 'public',
      active_agents: 3,
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
    {
      run_id: 'run-2',
      branch: 'agent/run-2',
      runner: 'xbabe1',
      status: 'exited',
      tty_live: false,
    },
  ]);
}

test.describe('Agents page navigation and discoverability', () => {
  test('the repository tab bar has Agents on every repository page @action:agents.repo_tab_visible', async ({
    page,
  }) => {
    await seed(page);

    const shell = new AppShellPage(page);
    await shell.goto(`${REPO_PATH}`);
    await shell.assertShellLoaded();

    const agentsTab = page.getByTestId('repo-tab-agents');
    await expect(agentsTab).toBeVisible();
    await expect(agentsTab).toContainText('Agents');
    // Three agents are at work on it, and the tab says so.
    await expect(page.getByTestId('repo-tab-count-agents')).toHaveText('3');
  });

  test('the Agents tab opens the agents URL @action:agents.repo_tab_navigate', async ({
    page,
  }) => {
    await seed(page);

    const shell = new AppShellPage(page);
    await shell.goto(`${REPO_PATH}`);
    await shell.assertShellLoaded();

    const agentsTab = page.getByTestId('repo-tab-agents');
    await expect(agentsTab).toHaveAttribute('href', /\/agents$/);

    await agentsTab.click();
    await expect(page).toHaveURL(/\/agents/, { timeout: 10000 });
  });
});
