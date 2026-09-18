// 27-repos-unshipped.spec.ts — the repositories table's Unshipped column.
//
// One `GET /api/v1/deployments?environment=production` feeds every row: a
// repository behind production shows its commit count as a link into Releases,
// an up-to-date one a muted 0, one git could not count a "?", and one that does
// not ship to production an em dash.

import { expect, test } from '@playwright/test';

import { mockBootstrap, mockRepoList } from './fixtures/mocks';

const repo = (name: string) => ({ id: { host: 'jeryu', owner: 'jeryu', name } });
const deployed = (name: string, commitsBehind: number | null) => ({
  repo: `jeryu/${name}`,
  default_branch: 'main',
  sha: 'ad96ff4fd2288bf3a37c2c5e8aa18584dcdc10a8',
  release: 'prod-20260918T054528Z-ad96ff4-unsigned',
  deployed_at: '2026-09-18T05:50:00Z',
  deployed_by: 'alton2',
  commits_behind: commitsBehind,
});

test('repositories table shows commits production lacks @action:repos.unshipped', async ({ page }) => {
  await mockBootstrap(page);
  await mockRepoList(page, [
    repo('jeryu-deploy'),
    repo('jeryu-web'),
    repo('jeryu-cache'),
    repo('jeryu-docs'),
  ]);
  await page.route('**/api/v1/deployments?environment=production', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        environment: 'production',
        repositories: [
          deployed('jeryu-deploy', 3),
          deployed('jeryu-web', 0),
          deployed('jeryu-cache', null),
        ],
      }),
    })
  );

  await page.goto('/repos');
  await page.getByRole('radio', { name: 'Table view' }).click();
  await expect(page.getByRole('columnheader', { name: 'Unshipped' })).toBeVisible();

  const behind = page.getByTestId('repo-unshipped-jeryu-deploy');
  await expect(behind).toHaveText('3');
  await expect(behind).toHaveAttribute('title', '3 commits on main not in production (ad96ff4)');
  await expect(page.getByTestId('repo-unshipped-jeryu-web')).toHaveText('0');
  await expect(page.getByTestId('repo-unshipped-jeryu-cache')).toHaveText('?');
  await expect(page.getByTestId('repo-unshipped-jeryu-docs')).toHaveText('—');

  await behind.click();
  await expect(page).toHaveURL(/\/releases\?repo=jeryu%2Fjeryu-deploy$/);
});
