// 27-repos-status.spec.ts — the repositories table's Status column.
//
// The list says how many current checks fail and whether the GitHub mirror
// works. Status is the one column about trouble: a healthy repository says so
// quietly, a failing one carries a red chip that opens, under its row, what is
// failing and the one thing to do about it (from the default branch's check
// runs), without leaving the page. The Mirror, Unshipped and Failing CI columns
// are gone: they were empty or a dash on almost every row.

import { expect, test } from './fixtures/test';

import { mockBootstrap, mockRepoList } from './fixtures/mocks';

const repo = (name: string, extra: Record<string, unknown> = {}) => ({
  id: { host: 'jeryu', owner: 'jeryu', name },
  ...extra,
});

test('a failing repository opens what is failing and what to do, in place @action:repos.status_detail', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockRepoList(page, [
    repo('jeryu-deploy'),
    repo('jeryu-web', {
      failing_checks: 1,
      mirror: {
        configured: true,
        last_attempt_at: '2026-09-19T17:35:49Z',
        last_attempt_ok: false,
        last_attempt_conclusion: 'failure',
        last_success_at: null,
      },
    }),
  ]);
  let checkRunRequests = 0;
  await page.route('**/api/v3/repos/jeryu/jeryu-web/commits/main/check-runs', (route) => {
    checkRunRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        check_runs: [
          {
            name: 'jankurai/proof',
            conclusion: 'failure',
            completed_at: '2026-09-19T17:00:00Z',
            output: {
              title: 'score 84 < floor 85',
              summary: '- score: 84\n- floor: 85\n- caps applied: missing-rendered-ux-qa-lane',
            },
          },
        ],
      }),
    });
  });

  await page.goto('/repos');
  for (const gone of ['Mirror', 'Unshipped', 'Failing CI', 'Posture']) {
    await expect(page.getByRole('columnheader', { name: gone, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('columnheader', { name: 'Status', exact: true })).toBeVisible();
  await expect(page.getByTestId('repo-status-jeryu-deploy')).toHaveText('healthy');
  await expect(page.getByTestId('repo-mirror-failing-jeryu-web')).toHaveText('mirror failing');

  // Nothing is fetched until somebody asks.
  expect(checkRunRequests).toBe(0);
  const chip = page.getByRole('button', { name: '1 failing check' });
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  await chip.click();
  await expect(page).toHaveURL(/\/repos$/);
  await expect(chip).toHaveAttribute('aria-expanded', 'true');

  const detail = page.getByTestId('repo-status-detail-jeryu-web');
  await expect(detail).toContainText('jankurai/proof');
  await expect(detail).toContainText('score 84 < floor 85');
  await expect(detail).toContainText('caps applied: missing-rendered-ux-qa-lane');
  await expect(detail).toContainText('Raise the audit score to the floor');
  await expect(detail.getByRole('link', { name: 'Pull requests of jeryu/jeryu-web' })).toHaveAttribute(
    'href',
    '/pull-room?repo=jeryu%2Fjeryu-web'
  );

  await chip.click();
  await expect(detail).toHaveCount(0);
});
