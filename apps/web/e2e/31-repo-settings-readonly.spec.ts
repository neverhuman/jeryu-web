// 31-repo-settings-readonly.spec.ts — repository Settings on a server without
// the settings API: the page shows what is true, read-only. The default
// branch's protection rule, and the GitHub mirror (from the repository summary):
// when its last push failed, the dates and the one sentence that says an
// operator must fix the host. No buttons besides the danger zone.

import { expect, test } from './fixtures/test';

import { mockBootstrap, mockRepoList } from './fixtures/mocks';

test('read-only Settings shows the branch rule and the failing GitHub mirror @action:settings.read_only', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockRepoList(page, [
    {
      id: { host: 'jeryu', owner: 'jeryu', name: 'jeryu-web' },
      mirror: {
        configured: true,
        last_attempt_at: '2026-09-19T17:35:49Z',
        last_attempt_ok: false,
        last_attempt_conclusion: 'failure',
        last_success_at: null,
      },
    },
    { id: { host: 'jeryu', owner: 'jeryu', name: 'jeryu-cache' } },
  ]);
  await page.route('**/api/v1/repos/*/settings', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'api_route_not_found', message: 'API route not found' }),
    })
  );
  await page.route('**/api/v3/repos/jeryu/*/branches/main/protection', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        enforce_admins: { enabled: true },
        required_linear_history: { enabled: true },
        required_pull_request_reviews: { required_approving_review_count: 1 },
        required_status_checks: { contexts: ['jeryu-web/required'], strict: true },
      }),
    })
  );

  await page.goto('/repos/jeryu/jeryu/jeryu-web/settings');
  await expect(page.getByTestId('branch-protection')).toContainText('main is protected by 6 rules.');
  const mirror = page.getByTestId('github-mirror');
  await expect(mirror.getByRole('heading', { name: 'GitHub mirror' })).toBeVisible();
  await expect(mirror).toContainText('the last push failed');
  await expect(mirror).toContainText('Last success: never');
  await expect(mirror).toContainText('An operator fixes it on the host; merges are not affected.');
  await expect(mirror.getByRole('button')).toHaveCount(0);

  await page.goto('/repos/jeryu/jeryu/jeryu-cache/settings');
  await expect(page.getByTestId('github-mirror')).toContainText(
    'This repository is not mirrored to GitHub.'
  );
});
