// 37-pr-checks.spec.ts — a failing check says why, on the pull request page.
//
// The complaint this pins: a checks summary that read "1 failing (not
// required)" with nowhere to learn why, and a `details_url` pointing at a raw
// `/api/` JSON route over plain http. From the PR page alone, two clicks now
// reach the reason for each red row: open the row, then open the page behind
// it (the Quality gate view for `jankurai/proof`, the gate run log for the
// `<repo>/required` commit status).

import { expect, test } from './fixtures/test';

import { mockBootstrap, mockPullRequestDetail, mockRepoLookup } from './fixtures/mocks';
import { mockQualityGateApi } from './fixtures/qualityGateMocks';

const REPO = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
const PR_NUMBER = '42';
const PR_SHA = '0863f25ab1c2d3e4f5061728394a5b6c7d8e9f01';
const GATE_LOG = 'https://forge.invalid/gate/runs/812';

const CHECKS = {
  total: 2,
  passing: 0,
  failing: 2,
  pending: 0,
  skipped: 0,
  checks: [
    {
      id: '1',
      name: 'jankurai/proof',
      kind: 'check_run',
      status: 'failure',
      conclusion: 'failure',
      // What the forge reported: a raw API route over plain http.
      details_url: `http://forge.invalid/api/v1/repos/1f2e/jankurai-scores?sha=${PR_SHA}`,
      title: 'score 42 / 85',
      description: 'score 42 below the floor of 85; 12 caps applied, 0 hard findings',
      web_url: `/quality-gate/heads/${REPO.owner}/${REPO.name}/${PR_SHA}`,
      required: false,
      advisory: {
        label: 'advisory - shadow mode',
        reason:
          'jankurai/proof runs in shadow mode by owner decision: it is not required until the Quality gate view has about a week of data.',
        url: '/quality-gate',
      },
      started_at: '2026-09-19T12:00:00Z',
      completed_at: '2026-09-19T12:01:00Z',
    },
    {
      id: '2',
      name: 'jeryu/required',
      kind: 'status',
      status: 'failure',
      conclusion: null,
      details_url: GATE_LOG,
      description: 'gate run 812 failed: cargo clippy -D warnings',
      web_url: GATE_LOG,
      required: true,
      advisory: null,
      started_at: '2026-09-19T12:00:00Z',
      completed_at: '2026-09-19T12:02:00Z',
    },
  ],
};

async function openPullRequest(page: import('@playwright/test').Page): Promise<void> {
  await mockBootstrap(page, { auth: { role: 'admin' } });
  await mockQualityGateApi(page);
  await mockRepoLookup(page, { id: REPO, default_branch: 'main' });
  await mockPullRequestDetail(page, {
    repoId: `${REPO.host}:${REPO.owner}/${REPO.name}`,
    number: PR_NUMBER,
    title: 'Add the quality gate view',
    state: 'open',
    head_sha: PR_SHA,
    approvals: 1,
    required_approvals: 1,
    passport: 'pass',
    can_merge: true,
  });
  await page.route(/\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/checks$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CHECKS),
    })
  );
  await page.route(/\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/diff$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ head_sha: PR_SHA, base_sha: PR_SHA, files: [], truncated: false }),
    })
  );
  // The checks of a pull request are a tab of their own, at full width.
  await page.goto(
    `/repos/${REPO.host}/${REPO.owner}/${REPO.name}/pulls/${PR_NUMBER}/checks`
  );
}

test.describe('PR checks say why', () => {
  test('each row says whether the merge waits for it and expands to the reason @action:pr.check_reasons', async ({
    page,
  }) => {
    await openPullRequest(page);

    const advisory = page.getByTestId('check-row-jankurai/proof');
    const required = page.getByTestId('check-row-jeryu/required');
    await expect(advisory).toBeVisible({ timeout: 15_000 });

    // Which are required, and why the other is not — on the row itself.
    await expect(advisory).toContainText('advisory - shadow mode');
    await expect(advisory).not.toContainText('failing, not required');
    await expect(required).toContainText('required to merge');

    // Click one: the summary and the owner's reason, in place.
    await advisory.getByRole('button').click();
    await expect(advisory).toContainText('score 42 / 85');
    await expect(advisory).toContainText('12 caps applied, 0 hard findings');
    await expect(advisory).toContainText('shadow mode by owner decision');

    // No row ever offers the raw API route the forge reported.
    expect(await advisory.locator('a[href*="/api/"]').count()).toBe(0);
    expect(await advisory.locator('a[href^="http://"]').count()).toBe(0);

    // Click two: the Quality gate view of this head, listing each applied cap.
    await advisory.getByRole('link', { name: /Open the jankurai\/proof report/ }).click();
    await expect(page.getByTestId('quality-gate-head-page')).toBeVisible({ timeout: 15_000 });
    const cap = page.getByTestId('quality-gate-cap-thin-tests');
    await expect(cap).toContainText('not proven by a test');
    await expect(cap).toContainText('Add the test that fails without the change and push.');
  });

  test('a failing commit status expands to its description and gate run log @action:pr.status_reasons', async ({
    page,
  }) => {
    await openPullRequest(page);

    const required = page.getByTestId('check-row-jeryu/required');
    await expect(required).toBeVisible({ timeout: 15_000 });

    await required.getByRole('button').click();
    await expect(required).toContainText('gate run 812 failed: cargo clippy -D warnings');
    await expect(
      required.getByRole('link', { name: /Open the jeryu\/required run log/ })
    ).toHaveAttribute('href', GATE_LOG);
  });
});
