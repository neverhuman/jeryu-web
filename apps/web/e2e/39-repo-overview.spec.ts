// 39-repo-overview.spec.ts — the repository page says something about the
// repository, not only its README.
//
// Under the header: how many commits the shown ref has, how many branches and
// tags there are, and the last commit. In the header: the score, linking to the
// quality gate that produced it, and the health chip, which names the failing
// checks that set it and opens them in place.

import { expect, test } from './fixtures/test';

import {
  mockBootstrap,
  mockCommits,
  mockReadme,
  mockRefs,
  mockRepoLookup,
  mockTree,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const FRONT = '/repos/jeryu/neverhuman/jeryu';

test('the repository page summarises commits and explains its header chip @action:repo.overview_summary', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockRepoLookup(page, {
    id: { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' },
    default_branch: 'main',
    failing_checks: 1,
    jankurai_score: 84,
    jankurai_scored_at: '2026-05-25T10:00:00Z',
  });
  await mockRefs(page, [
    { name: 'main', kind: 'branch', default: true },
    { name: 'release', kind: 'branch' },
    { name: 'v1.2.0', kind: 'tag' },
  ]);
  await mockReadme(page, { html: '<h1>Portal</h1>' });
  await mockTree(page, [{ path: 'README.md', kind: 'file' }]);
  await mockCommits(
    page,
    [{ summary: 'Say what the repository page never said', sha: 'fee1900dcafe'.padEnd(40, '0') }],
    { total: 1204 }
  );
  await page.route(
    '**/api/v3/repos/neverhuman/jeryu/commits/main/check-runs',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          check_runs: [
            {
              name: 'jankurai/proof',
              conclusion: 'failure',
              completed_at: '2026-05-25T10:00:00Z',
              output: { title: 'score 84 < floor 85', summary: '- score: 84\n- floor: 85' },
            },
          ],
        }),
      })
  );

  await page.goto(FRONT);
  await expect(page.getByTestId('repo-overview-page')).toBeVisible({ timeout: 15_000 });

  // The commit / branch summary, on the page beside the README.
  const summary = page.getByTestId('repo-commit-summary');
  await expect(summary).toContainText('1,204 commits · 2 branches · 1 tag');
  await expect(summary).toContainText('fee1900d');
  await expect(summary).toContainText('Say what the repository page never said');
  await expect(summary).toContainText('Ada Lovelace');

  // The score reaches the gate that produced it.
  await expect(page.getByTestId('repo-overview-score')).toHaveAttribute('href', '/quality-gate');

  // The header chip names the check that set it, and opens it in place.
  const chip = page.getByTestId('repo-health-chip');
  await expect(chip).toContainText('warning · 1 failing check');
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
  const checks = page.getByRole('region', { name: 'Failing checks' });
  await expect(checks).toContainText('jankurai/proof');
  await expect(checks).toContainText('score 84 < floor 85');
  await expect(checks).toContainText('Raise the audit score to the floor');
});
