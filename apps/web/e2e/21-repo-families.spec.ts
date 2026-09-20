// 21-repo-families.spec.ts — repository family links + drill-down.
//
// The repos table links each repo that shares `family` to its family page;
// clicking the link drills into `/repos/family/:family`, which renders only
// the member repos inside the boxed panel. Repos without a family have no
// link.
// The list mock honours `?family=` like the real backend, so the
// drill-down page exercises the same filter path the SPA ships.

import { expect, test, type Page, type Route } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import {
  mockBootstrap,
  mockReadme,
  mockRefs,
  mockRepoList,
  mockTree,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const REPOS = [
  {
    id: { host: 'jeryu', owner: 'veox', name: 'redline' },
    description: 'Edge router for VEOX.',
    family: 'veox-split',
    open_pull_requests: 2,
    failing_checks: 1,
  },
  {
    id: { host: 'jeryu', owner: 'veox', name: 'bluebird' },
    description: 'Telemetry pipeline.',
    family: 'veox-split',
    open_pull_requests: 1,
    failing_checks: 0,
  },
  {
    id: { host: 'jeryu', owner: 'neverhuman', name: 'solo' },
    description: 'No family on this one.',
    open_pull_requests: 0,
    failing_checks: 0,
  },
];

test.describe('Repository families', () => {
  test('list links each family member, the family link drills into the family page @action:repos.family_drilldown @action:repos.split_repo_switch @action:code.file_select @action:code.readme_preview', async ({
    page,
  }) => {
    // Regression net for the keyboard-registry re-render loop: it kept
    // interrupting router transitions (pushState landed but the outlet kept
    // the previous route) and crashed with React #185 on history back. Any
    // page error during the click → back round trip fails this test.
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await mockBootstrap(page);
    await mockRepoList(page, REPOS);
    await mockRefs(page);
    await mockTree(page, [
      { path: 'README.md', kind: 'file' },
      { path: 'src/main.rs', kind: 'file' },
    ]);
    await mockReadme(page, {
      html: '<h1>Family README</h1><p>README rendering proof.</p>',
    });
    await mockBlob(page);

    const shell = new AppShellPage(page);
    await page.goto('/repos');
    await shell.assertShellLoaded();

    // 1. Both veox-split rows link their family; the familyless repo has none.
    const familyLinks = page.getByRole('link', { name: 'Open family veox-split' });
    await expect(familyLinks).toHaveCount(2, { timeout: 10_000 });
    await expect(familyLinks.first()).toHaveAttribute('href', '/repos/family/veox-split');
    await expect(page.locator('a.repo-table__family-link')).toHaveCount(2);

    // 2. Every repo, including the familyless one, is a table row.
    const rows = page.getByRole('grid', { name: 'Repositories' }).locator('tbody tr');
    await expect(rows).toHaveCount(REPOS.length);
    await expect(rows.filter({ hasText: 'solo' })).toHaveCount(1);

    // 3. Clicking the family link commits the SPA transition: URL AND rendered
    //    outlet move to the family page (not just pushState).
    await familyLinks.first().click();
    await expect(page).toHaveURL(/\/repos\/family\/veox-split/, {
      timeout: 10_000,
    });
    await expect(
      page.getByRole('heading', { level: 1, name: 'veox' })
    ).toBeVisible({ timeout: 10_000 });

    // 4. History back re-renders the repos list (this crashed with React
    //    #185 before the keyboard-registry fix) — then return forward via a
    //    fresh full load to keep asserting the family page contract.
    await page.goBack();
    await expect(page).toHaveURL(/\/repos$/, { timeout: 10_000 });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Repositories' })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('a.repo-table__family-link')).toHaveCount(2);
    expect(pageErrors).toEqual([]);
    await page.screenshot({
      path: 'playwright-report/repo-family-back-nav.png',
      fullPage: true,
    });

    // Full-load the drill-down URL and assert the page contract.
    await page.goto('/repos/family/veox-split');
    await expect(
      page.getByRole('heading', { level: 1, name: 'veox' })
    ).toBeVisible({ timeout: 10_000 });

    // 4. The split browser contains exactly the member repos (the mock
    //    honours `?family=` so non-members never reach the page).
    const browser = page.locator('section.split-browser');
    await expect(browser).toBeVisible();
    const repoButtons = browser.locator('.split-browser__repo');
    await expect(repoButtons).toHaveCount(2);
    await expect(repoButtons).toContainText(['bluebird', 'redline']);
    await expect(browser).not.toContainText('solo');

    // 5. The default preview renders the README, then repo switching keeps
    //    the browser in the same split family.
    await expect(browser.locator('.markdown-body')).toContainText(
      'README rendering proof.'
    );
    await browser.getByRole('link', { name: /^redline/i }).click();
    await expect(page).toHaveURL(/\/repos\/family\/veox-split\?repo=redline$/);
    await expect(
      browser.locator('.split-browser__title').filter({ hasText: 'veox/redline' })
    ).toBeVisible();

    // 6. Tree selection requests the blob endpoint and renders the file
    //    preview instead of leaking the previous README panel.
    await browser.getByRole('treeitem', { name: /README\.md/ }).click();
    await expect(browser.getByRole('tab', { name: 'Rendered' })).toBeVisible();
    await expect(browser.locator('.markdown-body')).toContainText(
      'Selected file proof.'
    );

    await page.screenshot({
      path: 'playwright-report/repo-family-page.png',
      fullPage: true,
    });
  });

  test('family page renders permission denied for a non-owner viewer (403 forbidden) @action:repos.family_permission_denied', async ({
    page,
  }) => {
    await mockBootstrap(page);
    // Negative authorization proof (owner/non-owner): the list endpoint
    // answers 403 forbidden for a viewer without repo.read on this family.
    await page.route('**/api/v1/repos**', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'permission_denied', message: 'missing repo.read' },
        }),
      });
    });

    await page.goto('/repos/family/veox-split');

    await expect(page.getByText('Permission denied')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/missing: repo\.read/)).toBeVisible();
    // The non-owner viewer sees zero repository data.
    await expect(page.getByRole('grid', { name: 'Repositories' })).toHaveCount(0);
    await expect(page.locator('section.split-browser')).toHaveCount(0);
  });
});

async function mockBlob(page: Page): Promise<void> {
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/blob(\?.*)?$/,
    async (route: Route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      const url = new URL(request.url());
      const path = url.searchParams.get('path') ?? 'README.md';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          repo: {
            id: 'jeryu:veox/redline',
            host: 'jeryu',
            owner: 'veox',
            name: 'redline',
          },
          path,
          ref_name: url.searchParams.get('ref') ?? 'main',
          sha: '0'.repeat(40),
          size_bytes: 42,
          mime: 'text/markdown',
          encoding: 'utf8',
          text: '# Selected file proof.',
          base64: null,
          rendered_markdown: {
            html: '<h1>Selected file proof.</h1>',
            toc: [],
            links: [],
            renderer_version: 'jeryu-md-renderer.v1',
            sanitizer_version: 'jeryu-md-sanitizer.v1',
            rendered_at: '2026-05-26T00:00:00Z',
          },
          is_binary: false,
        }),
      });
    }
  );
}
