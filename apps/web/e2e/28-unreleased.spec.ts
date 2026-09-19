// 28-unreleased.spec.ts — the unreleased section of Releases (once its own page): one row per pull request, grouped
// by repository, classified against each repository's newest release.
//
// The family view lists members from `/api/v1/repos?family=`, then per repo
// reads `/api/v3/repos/{o}/{r}/environments`, `/api/v1/repos/{id}/pulls?state=all`,
// `/api/v1/repos/{id}/release-tag` (only without a production deployment) and
// `/api/v1/repos/{id}/compare?base=<release sha>&head=main`. Three members
// cover the three release sources: a deployment, a tag, and neither.

import { expect, test } from '@playwright/test';

import { mockBootstrap } from './fixtures/mocks';
import {
  compareBody,
  mockRepo,
  mockUnreleasedFamily,
  production,
  pull,
} from './fixtures/unreleasedMocks';

test('family view groups PRs by repo and classifies them per release source @action:unreleased.family', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockUnreleasedFamily(page);
  // The old page's URL still works: it lands on the last section of Releases.
  await page.goto('/unreleased?family=jeryu');
  await expect(page).toHaveURL(/\/releases\?family=jeryu#unreleased$/);
  await expect(page.getByTestId('unreleased-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Merged, not yet released' })).toBeVisible();
  await expect(page.getByLabel('Repository or family')).toHaveValue('family:jeryu');
  await expect(page.getByTestId('unreleased-repo-jeryu/elsewhere')).toHaveCount(0);

  // Deployment-based: production runs rel-a.
  await expect(page.getByTestId('unreleased-summary-jeryu/jeryu-deploy')).toHaveText(
    'main is 2 commits / 1 PR ahead of rel-a — releasable'
  );
  const deploy = page.getByTestId('unreleased-table-jeryu/jeryu-deploy');
  await expect(deploy.locator('tbody tr')).toHaveCount(3);
  await expect(deploy.locator('tbody tr').nth(0)).toContainText('#30 feat: about to land');
  await expect(deploy.locator('tbody tr').nth(0)).toContainText('about to land');
  await expect(deploy.locator('tbody tr').nth(1)).toContainText('Merged · unreleased');
  await expect(deploy.locator('tbody tr').nth(1)).toContainText('ccccccc');
  await expect(deploy.locator('tbody tr').nth(2)).toContainText('checks failing');
  await expect(page.getByTestId('unreleased-pr-jeryu/jeryu-deploy-27')).toHaveCount(0);

  // Tag-based: v5.0.0-split.4 carries #11 but not #12.
  await expect(page.getByTestId('unreleased-summary-jeryu/jeryu-cli')).toHaveText(
    'main is 1 commit / 1 PR ahead of v5.0.0-split.4 — releasable'
  );
  await expect(page.getByTestId('unreleased-pr-jeryu/jeryu-cli-12')).toContainText('Merged · unreleased');
  await expect(page.getByTestId('unreleased-pr-jeryu/jeryu-cli-11')).toHaveCount(0);

  // Neither: say so instead of calling everything unreleased.
  await expect(page.getByTestId('unreleased-summary-jeryu/jeryu-docs')).toContainText(
    'No release recorded'
  );
  await expect(page.getByTestId('unreleased-pr-jeryu/jeryu-docs-4')).toContainText(
    'no release recorded'
  );
  await page.getByTestId('unreleased-page').screenshot({
    path: 'playwright-report/unreleased-family.png',
  });

  // The toggle adds released PRs with the release that carries them.
  await page.getByTestId('unreleased-show-released').click();
  await expect(page).toHaveURL(/released=1/);
  await expect(page.getByTestId('unreleased-show-released')).toBeChecked();
  await expect(page.getByTestId('unreleased-pr-jeryu/jeryu-deploy-27')).toContainText(
    'Released in rel-a · 2026-09-17'
  );
  await expect(page.getByTestId('unreleased-pr-jeryu/jeryu-cli-11')).toContainText(
    'Released in v5.0.0-split.4 · 2026-09-10'
  );
});

test('Releases carries the unreleased list for one repository; there is no second nav item @action:unreleased.repo', async ({ page }) => {
  await mockBootstrap(page);
  await mockRepo(page, 'jeryu-deploy', {
    environments: [production],
    pulls: [pull('jeryu-deploy', 27, 'feat: already live', 'merged', 'a')],
    compare: compareBody('a', []),
  });

  await page.goto('/releases');
  await expect(page.getByRole('link', { name: 'Unreleased', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Repository or family')).toHaveValue('repo:jeryu/jeryu-deploy');
  await expect(page.getByTestId('unreleased-summary-jeryu/jeryu-deploy')).toHaveText(
    'main matches rel-a — nothing to release'
  );
  await expect(page.getByTestId('unreleased-empty-jeryu/jeryu-deploy')).toBeVisible();
});
