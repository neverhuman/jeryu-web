// 43-repo-shell.spec.ts — one repository shell on every repository page: one
// header naming the repository, one tab bar across the top.
//
// Code, Pull requests, Automation, Agents, Activity and Settings are one click
// apart from wherever the reader is; the counts are on the tabs; Settings is
// only there for someone who may open it. The repository, its family, its
// identities and its mirror below are invented.

import { expect, test, type Page } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import {
  mockBlob,
  mockBootstrap,
  mockReadme,
  mockRepoAgentRuns,
  mockRepoAutomation,
  mockRepoList,
  mockSettings,
  mockTree,
} from './fixtures/mocks';
import { mockPipelineApi, pipelineEvent } from './fixtures/pipelineMocks';

test.describe.configure({ retries: 1 });

const REPO = { host: 'acme', owner: 'acme', name: 'widget-api' } as const;
const BASE = `/repos/${REPO.host}/${REPO.owner}/${REPO.name}`;

const AUTOMATION = {
  repo: 'acme/widget-api',
  defaultBranch: 'main',
  actors: [
    {
      kind: 'merger',
      identity: 'widget-merge-bot',
      role: 'merges approved pull requests',
      state: 'configured',
      grant: {
        required: 'write',
        present: false,
        warning:
          'widget-merge-bot has no write grant on acme/widget-api; its merges answer 403',
      },
    },
  ],
  mirrors: [
    {
      target: 'https://example.invalid/acme-oss/widget-api',
      direction: 'push',
      refs: ['refs/heads/main'],
      state: 'level',
    },
  ],
  warnings: [
    'widget-merge-bot has no write grant on acme/widget-api; its merges answer 403',
  ],
};

async function seed(page: Page, viewer: Parameters<typeof mockBootstrap>[1] = {}): Promise<void> {
  await mockBootstrap(page, viewer);
  await mockRepoList(page, [
    {
      id: REPO,
      default_branch: 'main',
      visibility: 'private',
      description: 'The widget API',
      family: 'acme',
      open_pull_requests: 4,
      active_agents: 1,
    },
  ]);
  await mockTree(page, [{ path: 'README.md', kind: 'file' }]);
  await mockReadme(page, { html: '<h1>widget-api</h1>' });
  await mockBlob(page, { path: 'README.md', text: '# widget-api' });
  await mockSettings(page);
  await mockRepoAutomation(page, AUTOMATION);
  await mockRepoAgentRuns(page, [
    {
      run_id: 'run-7',
      branch: 'agent/run-7',
      runner: 'buildhost1',
      status: 'running',
      tty_live: true,
    },
  ]);
  await mockPipelineApi(page, {
    events: [
      pipelineEvent({
        seq: 31,
        ts: '2026-10-01T09:00:00Z',
        kind: 'pr.merged',
        repo: 'acme/widget-api',
        pr: 12,
        summary: 'Merged acme/widget-api#12',
      }),
      pipelineEvent({
        seq: 30,
        ts: '2026-10-01T08:00:00Z',
        kind: 'pr.merged',
        repo: 'globex/ledger',
        pr: 3,
        summary: 'Merged globex/ledger#3',
      }),
    ],
  });
}

test('every repository page carries the same header and tab bar @action:repo.shell_tabs', async ({
  page,
}) => {
  await seed(page);
  const shell = new AppShellPage(page);

  const pages = [
    { tail: '', tab: 'code', testId: 'repo-overview-page' },
    { tail: '/pulls', tab: 'pulls', testId: 'repo-pulls-page' },
    { tail: '/automation', tab: 'automation', testId: 'repo-automation-page' },
    { tail: '/agents', tab: 'agents', testId: 'repo-agents-page' },
    { tail: '/activity', tab: 'activity', testId: 'activity-page' },
    { tail: '/settings', tab: 'settings', testId: 'repo-settings-page' },
  ] as const;

  for (const sub of pages) {
    await shell.goto(`${BASE}${sub.tail}`);
    await expect(page.getByTestId(sub.testId)).toBeVisible({ timeout: 15_000 });

    // The same header, on all six: the repository, its visibility, its family.
    await expect(page.getByTestId('repo-shell-title')).toHaveText('widget-api');
    await expect(page.getByTestId('repo-shell')).toContainText('acme /');
    const bar = page.getByRole('navigation', { name: 'Repository', exact: true });
    await expect(bar.getByRole('link')).toHaveCount(6);
    await expect(page.getByTestId(`repo-tab-${sub.tab}`)).toHaveAttribute(
      'aria-current',
      'page'
    );
    // Exactly one tab is the page.
    await expect(bar.locator('[aria-current="page"]')).toHaveCount(1);

    // The open pull requests are counted on their own tab, everywhere.
    await expect(page.getByTestId('repo-tab-count-pulls')).toHaveText('4');
    // Automation is marked because its merge identity cannot merge.
    await expect(page.getByTestId('repo-tab-automation-warning')).toBeVisible();
  }

  // The Activity tab is the event log pinned to this repository.
  await shell.goto(`${BASE}/activity`);
  await expect(page.getByText('Merged acme/widget-api#12')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Merged globex/ledger#3')).toHaveCount(0);

  // Agents, opened without naming a run: the live run opens itself instead of
  // an empty "choose a run" pane beside a list with one live run in it.
  await shell.goto(`${BASE}/agents`);
  await expect(page.getByTestId('agent-terminal')).toHaveAttribute('data-run-id', 'run-7', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('agents-no-selection')).toHaveCount(0);

  // A file deep link still opens its file, on the Code tab.
  await shell.goto(`${BASE}/blob/main/README.md`);
  await expect(page.getByTestId('repo-file-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('repo-tab-code')).toHaveAttribute('aria-current', 'page');

  // The repository is navigated from its own bar: the shell nav has no Code.
  await expect(
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Code' })
  ).toHaveCount(0);

  // Arrow keys move along the bar, which is one tab stop.
  await page.getByTestId('repo-tab-code').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('repo-tab-pulls')).toBeFocused();
});

test('Automation owns the automation sections, and the front page no longer does @action:repo.tab_automation', async ({
  page,
}) => {
  await seed(page);
  const shell = new AppShellPage(page);

  await shell.goto(`${BASE}/automation`);
  await expect(page.getByTestId('repo-automation-page')).toBeVisible({ timeout: 15_000 });
  const mirrors = page.getByTestId('repo-mirrors');
  await expect(mirrors.getByRole('heading', { name: 'Mirrors' })).toBeVisible();
  await expect(mirrors).toContainText('example.invalid/acme-oss/widget-api');
  await expect(page.getByTestId('repo-automation-warnings')).toContainText(
    'widget-merge-bot has no write grant on acme/widget-api'
  );

  await shell.goto(BASE);
  await expect(page.getByTestId('repo-overview-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('repo-mirrors')).toHaveCount(0);
  await expect(page.getByTestId('repo-automation')).toHaveCount(0);
});

test('a viewer who may not change the repository has no Settings tab @action:repo.shell_settings_denied', async ({
  page,
}) => {
  await seed(page, {
    login: '@reader',
    display_name: 'Read-only Reader',
    global_permissions: ['repo.read', 'code.read'],
  });
  const shell = new AppShellPage(page);

  await shell.goto(BASE);
  await expect(page.getByTestId('repo-overview-page')).toBeVisible({ timeout: 15_000 });
  const bar = page.getByRole('navigation', { name: 'Repository', exact: true });
  await expect(bar.getByRole('link')).toHaveCount(5);
  await expect(page.getByTestId('repo-tab-settings')).toHaveCount(0);

  // Typed in anyway, the page itself says no.
  await shell.goto(`${BASE}/settings`);
  const denied = page.getByRole('alert').filter({ hasText: /Permission denied/i });
  await expect(denied).toBeVisible({ timeout: 15_000 });
  await expect(denied).toContainText(/missing:\s*repo\.admin/i);
  await expect(page.getByTestId('repo-settings-page')).toHaveCount(0);
});
