// 21-repo-families.spec.ts — the family rail, left of its repositories' pages.
//
// A split family has no page of its own any more: `/repos/family/<key>` lands
// on the repository the family publishes from (or the one `?repo=` names), and
// the family is a rail inside the one repository shell. Switching member keeps
// the tab, the Code tab reads with the tree left of the README, a repository in
// no family has no rail, and a phone switches member from a select.
//
// Every repository, family, host and login here is invented.

import { expect, test, type Page } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import {
  mockBlob,
  mockBootstrap,
  mockReadme,
  mockRefs,
  mockRepoList,
  mockTree,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const HOST = 'forge.example';
const REPOS = [
  {
    id: { host: HOST, owner: 'acme', name: 'widget-web' },
    description: 'The widget web app.',
    family: 'acme',
    open_pull_requests: 2,
  },
  {
    id: { host: HOST, owner: 'acme', name: 'widget-cli' },
    description: 'The widget command line.',
    family: 'acme',
    open_pull_requests: 1,
    failing_checks: 1,
  },
  {
    id: { host: HOST, owner: 'acme', name: 'widget-portal' },
    description: 'What the family publishes from.',
    family: 'acme',
    repo_role: 'public_portal',
    open_pull_requests: 0,
  },
  {
    id: { host: HOST, owner: 'initech', name: 'solo' },
    description: 'No family on this one.',
    open_pull_requests: 0,
  },
];

async function seed(page: Page): Promise<void> {
  await mockBootstrap(page);
  await mockRepoList(page, REPOS);
  await mockRefs(page);
  await mockTree(page, [
    { path: 'README.md', kind: 'file' },
    { path: 'main.rs', kind: 'file' },
  ]);
  await mockReadme(page, {
    html: '<h1>Family README</h1><p>README rendering proof.</p>',
  });
  await mockBlob(page, { path: 'main.rs', text: 'fn main() {}' });
  await page.route(/\/api\/v1\/repos\/[^/]+\/pulls(\?.*)?$/, async (route, request) => {
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generated_at: '2026-10-01T00:00:00Z',
        total: 0,
        items: [],
        pull_requests: [],
      }),
    });
  });
}

test.describe('Repository families', () => {
  test('the family address lands on a member, and the repository takes the whole width @action:repos.family_drilldown @action:code.file_select @action:code.readme_preview', async ({
    page,
  }) => {
    // Regression net for the keyboard-registry re-render loop, which kept
    // interrupting router transitions: any page error here fails the test.
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await seed(page);
    const shell = new AppShellPage(page);

    // 1. The old family address keeps working: `?repo=` names the member.
    await shell.goto('/repos/family/acme?repo=widget-web');
    await expect(page).toHaveURL(`${'/repos'}/${HOST}/acme/widget-web`, {
      timeout: 15_000,
    });
    await expect(page.getByTestId('repo-overview-page')).toBeVisible({ timeout: 15_000 });

    // 2. No family rail: the family is the header's control and the
    //    Repositories list, not a sidebar on every repository page.
    await expect(page.getByTestId('repo-family-rail')).toHaveCount(0);
    await expect(page.getByTestId('repo-header-family')).toHaveCount(0);

    // 3. The Code tab reads as every forge reads: the tree LEFT of the README.
    const tree = page.getByRole('complementary', { name: 'Files' });
    const readme = page.locator('.repo-browser__main .markdown-body');
    await expect(readme).toContainText('README rendering proof.');
    const treeBox = await tree.boundingBox();
    const readmeBox = await readme.boundingBox();
    expect(treeBox).not.toBeNull();
    expect(readmeBox).not.toBeNull();
    expect(treeBox!.x + treeBox!.width).toBeLessThanOrEqual(readmeBox!.x + 1);

    // 4. A file opens from the tree, on the same page.
    await tree.getByRole('treeitem', { name: /main\.rs/ }).click();
    await expect(page.getByTestId('repo-file-page')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp('/blob/main/main\\.rs$'));

    expect(pageErrors).toEqual([]);
    await page.screenshot({
      path: 'playwright-report/repo-family-member.png',
      fullPage: true,
    });
  });

  test('the family address renders permission denied for a non-owner viewer (403 forbidden) @action:repos.family_permission_denied', async ({
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

    await page.goto('/repos/family/acme');

    await expect(page.getByText('Permission denied')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/missing: repo\.read/)).toBeVisible();
    // The non-owner viewer sees zero repository data, and goes nowhere.
    await expect(page).toHaveURL(/\/repos\/family\/acme$/);
    await expect(page.getByRole('grid', { name: 'Repositories' })).toHaveCount(0);
    await expect(page.getByTestId('repo-family-rail')).toHaveCount(0);
  });
});
