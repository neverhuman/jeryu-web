// 31-repo-settings-readonly.spec.ts — repository Settings on a server without
// the settings API: the sections show what is true, read-only. The branch
// protection section carries the default branch's rule; the Mirror section
// carries the GitHub mirror, and when its last push failed, the dates and the
// one sentence that says an operator must fix the host. Neither has a button.

import { expect, test } from './fixtures/test';

import { mockBootstrap, mockRepoAutomation, mockRepoList } from './fixtures/mocks';

test('read-only Settings shows the branch rule and the failing GitHub mirror @action:settings.read_only', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockRepoList(page, [
    {
      id: { host: 'acme', owner: 'acme', name: 'widget-api' },
    },
    { id: { host: 'acme', owner: 'acme', name: 'quiet-lib' } },
  ]);
  await mockRepoAutomation(page, {
    repo: 'acme/widget-api',
    mirrors: [
      {
        target: 'https://github.example/acme/widget-api',
        direction: 'push',
        refs: ['refs/heads/main', 'refs/tags/*'],
        state: 'behind',
        behind: true,
        behindBy: 3,
        retryPending: true,
        forgeHead: '1f0c9a4b2d7e6f5a8c3b1d0e9f8a7b6c5d4e3f21',
        lastPushedSha: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a09',
        lastPushedAt: '2026-09-29T09:30:00Z',
        lastCheckedAt: '2026-09-30T09:30:00Z',
        lastError: 'push rejected: no key on this host',
        tagDrift: [],
      },
    ],
  });
  await page.route('**/api/v1/repos/*/settings', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'api_route_not_found', message: 'API route not found' }),
    })
  );
  await page.route('**/api/v3/repos/acme/*/branches/main/protection', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        enforce_admins: { enabled: true },
        required_linear_history: { enabled: true },
        required_pull_request_reviews: { required_approving_review_count: 1 },
        required_status_checks: { contexts: ['widget-api/required'], strict: true },
      }),
    })
  );

  await page.goto('/repos/acme/acme/widget-api/settings/branch-protection');
  await expect(page.getByTestId('branch-protection')).toContainText(
    'main is protected by 6 rules.'
  );

  await page.goto('/repos/acme/acme/widget-api/settings/mirror#mirror');
  const mirror = page.getByTestId('settings-mirror');
  await expect(mirror.getByRole('heading', { name: 'Mirror' })).toBeVisible();
  await expect(mirror.getByRole('link', { name: 'Mirrored to GitHub' })).toHaveAttribute(
    'href',
    'https://github.example/acme/widget-api'
  );
  await expect(mirror).toContainText('forge → GitHub');
  await expect(mirror).toContainText('behind');
  await expect(mirror).toContainText('push rejected: no key on this host');
  await expect(mirror.getByRole('button')).toHaveCount(0);

  await mockRepoAutomation(page, { repo: 'acme/quiet-lib', mirrors: [] });
  await page.goto('/repos/acme/acme/quiet-lib/settings/mirror#mirror');
  await expect(page.getByTestId('settings-mirror')).toContainText('Not mirrored');
});
