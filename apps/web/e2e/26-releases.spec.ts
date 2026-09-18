// 26-releases.spec.ts — Releases page: what each environment runs and which
// merged pull requests on main it lacks.
//
// The page reads `/api/v3/repos/{o}/{r}/environments`, then
// `/api/v1/repos/{id}/compare?base=<live sha>&head=main` per live deployment and
// `/api/v1/repos/{id}/pulls?state=all`. A merged PR is unshipped when its head
// sha is one of the compare commits.

import { expect, test, type Page } from '@playwright/test';

import { mockBootstrap } from './fixtures/mocks';

const sha = (c: string) => c.repeat(40);

function deployed(id: number, commit: string, state: string, release: string) {
  return {
    deployment: {
      id,
      sha: sha(commit),
      ref: 'main',
      task: 'deploy',
      environment: 'production',
      description: null,
      payload: { release },
      creator: { login: 'alton2' },
      created_at: new Date(Date.now() - id * 3_600_000).toISOString(),
      production_environment: true,
      transient_environment: false,
    },
    status: {
      id: id * 10,
      state,
      description: null,
      environment_url: 'https://git.neverhuman.org',
      log_url: null,
      creator: { login: 'alton2' },
      created_at: new Date().toISOString(),
    },
    succeeded: state === 'success' || state === 'inactive',
  };
}

async function mockReleases(page: Page, environments: unknown[]): Promise<void> {
  await page.route('**/api/v3/repos/jeryu/jeryu-deploy/environments', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total_count: environments.length, environments }),
    })
  );
  await page.route('**/api/v1/repos/jeryu%2Fjeryu-deploy/compare?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        base: sha('b'),
        head: 'main',
        base_sha: sha('b'),
        head_sha: sha('d'),
        ahead_by: 2,
        behind_by: 0,
        commits: ['c', 'd'].map((c) => ({
          sha: sha(c),
          summary: `commit ${c}`,
          author: 'dev',
          committed_at: '2026-09-18T05:00:00Z',
        })),
        truncated: false,
      }),
    })
  );
  await page.route('**/api/v1/repos/jeryu%2Fjeryu-deploy/pulls?state=all', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total: 3,
        items: [
          { number: 21, title: 'feat: runners page', author: 'alton2', head_sha: sha('d'), state: 'merged' },
          { number: 20, title: 'chore: jankurai pin', author: 'alton', head_sha: sha('c'), state: 'merged' },
          { number: 19, title: 'already live', author: 'alton', head_sha: sha('b'), state: 'merged' },
        ],
      }),
    })
  );
}

test('environments show the live release, rollback target and unshipped PRs @action:releases.environments', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockReleases(page, [
    {
      name: 'production',
      latest: deployed(3, 'e', 'failure', 'rel-e'),
      current: deployed(2, 'b', 'success', 'rel-b'),
      previous: deployed(1, 'a', 'inactive', 'rel-a'),
    },
  ]);

  await page.goto('/releases');
  await expect(page.getByTestId('releases-page')).toBeVisible({ timeout: 15_000 });

  const production = page.getByTestId('releases-env-production');
  await expect(production).toContainText('bbbbbbb');
  await expect(production).toContainText('rel-b');
  await expect(production).toContainText('by alton2');
  await expect(production).toContainText('failure eeeeeee');
  await expect(production).toContainText('aaaaaaa');

  const behind = page.getByTestId('releases-behind-production');
  await expect(behind).toContainText('2 PRs (2 commits) behind');
  await behind.getByText('2 PRs (2 commits) behind').click();
  await expect(behind.getByRole('listitem')).toHaveText([
    /#21 feat: runners page/,
    /#20 chore: jankurai pin/,
  ]);

  await expect(page.getByTestId('releases-env-canary')).toContainText('not configured');
  await expect(page.getByTestId('releases-empty')).toHaveCount(0);
});

test('a repository with no recorded deployment says so @action:releases.empty', async ({ page }) => {
  await mockBootstrap(page);
  await mockReleases(page, []);

  await page.goto('/releases');
  await expect(page.getByTestId('releases-empty')).toContainText(
    'No deployment of jeryu/jeryu-deploy has been recorded yet'
  );
  await expect(page.getByTestId('releases-env-production')).toContainText('not configured');
});
