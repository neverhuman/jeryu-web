// 25-action-matrix.spec.ts -- supplemental action tags for chrome, tools, and
// admin-denied controls that do not belong to a route-specific spec.

import { expect, test, type Page } from './fixtures/test';

import { mockBootstrap, mockRepoList } from './fixtures/mocks';

test.describe.configure({ retries: 1 });

test('global chrome command palette, repo switcher, sidebar, not-found, and logout @action:chrome.command_palette @action:chrome.repo_switcher @action:chrome.sidebar_collapse @action:chrome.not_found_recovery @action:auth.logout', async ({
  page,
}) => {
  await mockBootstrap(page, {
    login: '@e2e',
    display_name: 'E2E Tester',
  });
  await mockRepoList(page, [
    {
      id: { host: 'jeryu', owner: 'alice', name: 'jeryu' },
      default_branch: 'main',
      visibility: 'internal',
    },
  ]);
  let loggedOut = false;
  await page.route('**/api/v1/auth/me', async (route, request) => {
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    if (loggedOut) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'unauthorized', message: 'login required' },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        login: '@e2e',
        role: 'user',
        mustChangePassword: false,
        csrfToken: 'e2e-csrf',
      }),
    });
  });
  await page.route('**/api/v1/auth/logout', async (route, request) => {
    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }
    loggedOut = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 10_000 });

  // The first tab stop skips the chrome; the logo is the way home.
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page.getByRole('banner').getByRole('link', { name: 'JeRyu home' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('banner').getByRole('status')).toHaveAccessibleName(/^Live updates /);

  // One search-or-jump control: pages, repositories by name, a pull request by name#n.
  const jump = page.getByRole('button', { name: /^Search or jump to/ });
  await jump.click();
  const search = page.getByRole('combobox', { name: 'Command palette' });
  await search.fill('Repositories');
  await page.getByText('Go to Repositories').click();
  await expect(page).toHaveURL(/\/repos$/);

  await jump.click();
  await search.fill('alice/je');
  await page.getByRole('option', { name: 'alice/jeryu' }).click();
  await expect(page).toHaveURL(/\/repos\/jeryu\/alice\/jeryu$/);

  await jump.click();
  await search.fill('jeryu#12');
  await expect(page.getByRole('option', { name: 'Open pull request #12 in alice/jeryu' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/repos\/jeryu\/alice\/jeryu\/pulls\/12$/);

  // Escape closes it and hands focus back to the control that opened it.
  await jump.click();
  await expect(search).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toHaveCount(0);
  await expect(jump).toBeFocused();

  // Outside a repository the header has no repository control (the left nav
  // has Repositories); it no longer opens the palette a second way. Inside one
  // it names the repository and links to its front page: see 05-pr-review.
  await page.goto('/needs-you');
  await expect(page.getByRole('banner').getByRole('link', { name: /repositor/i })).toHaveCount(0);
  await expect(page.getByRole('banner').getByRole('button', { name: /repositor/i })).toHaveCount(0);

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar' }).click();

  // The in-memory notifications inbox is gone; its old URL lands on Activity.
  await expect(page.getByRole('button', { name: /^Notifications/ })).toHaveCount(0);
  await page.goto('/notifications');
  await expect(page).toHaveURL(/\/activity$/);

  // `/audit` is retired but still linked from runbooks: its 404 says where to go.
  await page.goto('/audit');
  await expect(page.getByText(/no longer has its own page.*Activity/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Open Activity' }).click();
  await expect(page).toHaveURL(/\/activity$/);

  await page.goto('/missing/action-matrix-route');
  await expect(page).toHaveURL(/\/missing\/action-matrix-route$/);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Back to home' }).click();
  await expect(page).toHaveURL(/\/repos\/family\/jeryu-split$/);

  // Settings is reached from the top-right account control, and Log out is
  // the last thing on that page; neither is in the left nav or the header.
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
  await page.getByRole('banner').getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('heading', { name: 'Git for agents.' })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible({
    timeout: 10_000,
  });
});

test('shared tools findings, proposals, adoption, and non-admin settings @action:tools.scan @action:tools.expand_cluster @action:tools.propose @action:tools.ignore @action:shared_tools.proposals @action:tool_fleet.render @action:admin.denied', async ({
  page,
}) => {
  await mockBootstrap(page, {
    login: '@viewer',
    auth: { role: 'user', csrfToken: 'csrf-viewer' },
  });
  await mockTooling(page);

  page.once('dialog', (dialog) => dialog.accept('covered by existing helper'));
  await page.goto('/shared-code');
  await expect(page).toHaveURL(/\/shared-tools\/findings$/);
  await expect(page.getByTestId('tools-page')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('run-scan-button').click();
  await expect(page.getByTestId('scan-progress-panel')).toBeVisible();
  await page.getByRole('button', { name: /Shared API client/ }).click();
  const cluster = page.getByTestId('cluster-cluster-action');
  await expect(cluster).toBeVisible();
  await cluster.getByRole('button', { name: 'Propose tool' }).click();
  await expect(cluster).toContainText('proposal filed');
  await cluster.getByRole('button', { name: 'Ignore' }).click();

  await page.getByRole('link', { name: 'Proposals', exact: true }).click();
  await expect(page.getByTestId('proposals-page')).toBeVisible();
  const published = page.getByTestId('proposal-action-coverage');
  await expect(published).toBeVisible();
  // A non-admin viewer sees the registry but cannot decide proposals.
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Adoption', exact: true }).click();
  await expect(page).toHaveURL(/\/shared-tools\/adoption$/);
  await expect(page.getByTestId('tool-fleet-page')).toBeVisible();
  await expect(page.getByTestId('tool-row-action-coverage')).toBeVisible();
  await page.getByTestId('tool-fleet-search').fill('alice/jeryu');
  await expect(page.getByTestId('tool-row-action-coverage')).toBeVisible();
  await page.getByRole('link', { name: 'action-coverage' }).click();
  await expect(page.getByTestId('tool-fleet-tool-page')).toContainText(
    'alice/jeryu'
  );

  await page.goto('/settings');
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Repository access' })).toHaveCount(0);
});

async function mockTooling(page: Page): Promise<void> {
  await page.route('**/api/v1/tools/registry/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generated_at: '2026-07-03T00:00:00Z',
        tool_count: 1,
        published_count: 1,
        building_count: 0,
        proposed_count: 0,
        deprecated_count: 0,
        adopting_repo_count: 1,
        candidate_repo_count: 1,
        open_task_count: 0,
        realized_loc_saved: 120,
        anticipated_loc_saved: 80,
        tools: [
          {
            id: 'action-coverage',
            name: 'Action Coverage',
            kind: 'ts-lib',
            status: 'published',
            adopting_repo_count: 1,
            candidate_repo_count: 1,
            loc_saved: 120,
            loc_saved_estimate: 80,
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/tool-finder/dashboard**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generated_at: '2026-07-03T00:00:00Z',
        scan: {
          scanned_at: '1783036800000',
          scan_id: 'scan-1',
          repo_count: 1,
          file_count: 3,
        },
        family_count: 1,
        cluster_count: 1,
        candidate_loc_saved: 80,
        families: [
          {
            family_id: 'family-action',
            label: 'Shared API client',
            category: 'tool-candidate',
            language: 'typescript',
            anticipated_loc_saved: 80,
            occurrence_count: 3,
            file_count: 3,
            repos: ['alice/jeryu', 'jeryu/jeryu-web'],
            clusters: [
              {
                cluster_id: 'cluster-action',
                category: 'tool-candidate',
                score: 91,
                occurrence_count: 3,
                repo_count: 2,
                file_count: 3,
                total_lines: 90,
                language: 'typescript',
                insight: 'Shared API client wrapper',
                normalized_preview: 'function apiClient() {}',
                anticipated_loc_saved: 80,
                suggested_name: 'api-client',
                suggested_kind: 'ts-lib',
                ignored: false,
                occurrences: [
                  {
                    repo_id: 'alice/jeryu',
                    commit_sha: 'abcdef1234567890abcdef1234567890abcdef12',
                    path: 'src/api.ts',
                    start_line: 1,
                    end_line: 20,
                    language: 'typescript',
                    is_test: false,
                  },
                ],
              },
            ],
          },
        ],
      }),
    });
  });
  let scanStarted = false;
  await page.route('**/api/v1/tool-finder/scan', async (route, request) => {
    if (request.method() === 'POST') {
      scanStarted = true;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        scan_id: scanStarted ? 1 : 0,
        phase: scanStarted ? 'scan' : 'idle',
        running: scanStarted,
        repos_total: 1,
        repos_done: scanStarted ? 0 : 1,
        files_scanned: scanStarted ? 1 : 3,
        files_skipped: 0,
        clusters_found: 1,
        families_found: 1,
        current_repo: 'alice/jeryu',
        started_at: scanStarted ? '2026-07-03T00:00:00Z' : null,
        finished_at: null,
        error: null,
      }),
    });
  });
  await page.route('**/api/v1/tool-finder/propose/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        cluster_id: 'cluster-action',
        proposal_id: 'proposal-1',
        task_id: 'task-1',
        message: 'proposal filed',
      }),
    });
  });
  await page.route('**/api/v1/codegraph/tool-build/clusters/*/feedback', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.route('**/api/v1/fleet/tool-adoption', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        repos_scored: 1,
        tools: [
          {
            tool: 'action-coverage',
            category: 'proof',
            adopting_repos: ['alice/jeryu'],
            applicable_missing_repos: ['jeryu/jeryu-web'],
          },
        ],
      }),
    });
  });
}
