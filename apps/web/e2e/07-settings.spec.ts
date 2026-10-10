// 07-settings.spec.ts — repository Settings shows only what the forge serves.
//
// The forge serves no per-repository settings API: `GET /api/v1/repos/{id}/
// settings` is a 404 in production, and this spec pins that shape. Every
// section still renders from the endpoints that do answer — the repositories
// list, the branch rule, the automation view — and nothing on the page stages
// a change, so there is no preview to press.

import { expect, test } from './fixtures/test';

import {
  mockBootstrap,
  mockRepoAutomation,
  mockRepoList,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const REPO = { host: 'acme', owner: 'acme', name: 'widget-api' } as const;
const BASE = `/repos/${REPO.host}/${REPO.owner}/${REPO.name}/settings`;

test.describe('Repository Settings', () => {
  test('every section renders with no settings API, and nothing stages a change @action:settings.section_nav', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockRepoList(page, [
      {
        id: REPO,
        default_branch: 'main',
        visibility: 'internal',
        family: 'acme',
      },
    ]);
    await mockRepoAutomation(page, {
      repo: 'acme/widget-api',
      grantsVisible: true,
      grants: [
        {
          login: '@widget-merge-bot',
          access: 'write',
          grantedBy: '@acme-admin',
          grantedAt: '2026-09-28T10:00:00Z',
        },
      ],
      mirrors: [
        {
          target: 'https://github.example/acme/widget-api',
          direction: 'push',
          refs: ['refs/heads/main'],
          state: 'in-sync',
        },
      ],
    });
    // The production shape: this server answers no per-repo settings route.
    await page.route('**/api/v1/repos/*/settings', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'api_route_not_found',
          message: 'API route not found',
        }),
      })
    );
    await page.route(
      '**/api/v3/repos/acme/widget-api/branches/main/protection',
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enforce_admins: { enabled: true },
            required_status_checks: {
              contexts: ['widget-api/required'],
              strict: true,
            },
          }),
        })
    );

    await page.goto(`${BASE}/general`);
    const general = page.getByTestId('settings-general');
    await expect(general).toBeVisible({ timeout: 15_000 });
    await expect(general).toContainText('main');
    await expect(general).toContainText('acme');
    await expect(general).toContainText('internal');

    // Nothing here is staged, so the studio's preview button is gone.
    await expect(
      page.getByRole('button', { name: 'Preview changes' })
    ).toHaveCount(0);

    await page.getByRole('link', { name: /Branch protection/i }).click();
    await expect(page).toHaveURL(/\/settings\/branch-protection$/);
    await expect(page.getByTestId('branch-protection')).toContainText(
      'main is protected'
    );

    await page.getByRole('link', { name: /^Mirror$/ }).click();
    await expect(page).toHaveURL(/\/settings\/mirror$/);
    await expect(page.getByTestId('settings-mirror')).toContainText(
      'Mirrored to GitHub'
    );

    await page.getByRole('link', { name: /^Access$/ }).click();
    await expect(page).toHaveURL(/\/settings\/access$/);
    await expect(page.getByTestId('settings-access')).toContainText(
      '@widget-merge-bot'
    );

    await page.getByRole('link', { name: /Danger zone/i }).click();
    await expect(page).toHaveURL(/\/settings\/danger-zone$/);
    await expect(
      page.getByRole('button', { name: /Archive this repository/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Remove from registry/i })
    ).toBeVisible();

    // A section nobody serves is General, not a dead page.
    await page.goto(`${BASE}/merge-policy`);
    await expect(page.getByTestId('settings-general')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('deep settings URL returns 200 (SPA fallback) @bff', async ({ request }) => {
    const res = await request.get(`${BASE}/branch-protection`, {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(200);
  });
});
