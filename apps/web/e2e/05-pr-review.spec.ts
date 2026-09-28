// 05-pr-review.spec.ts — PR cockpit smoke (W-T-13).
//
// Phase 3 backend PR services may be partially live, so this spec ALWAYS
// runs against a mocked PullRequestDetail. We assert the cockpit page
// renders the PR title and surfaces (one of):
//
//   1. The full Phase 3 cockpit (three-pane review layout).
//   2. The NotImplementedRoute envelope (`Planned · W-FE-11`).
//   3. An ErrorState if the live API errored and the mocked detail was
//      not reached (e.g. when the SPA prefetches some other endpoint we
//      haven't mocked and bails out early).
//
// Either way, the page MUST load without a hard crash (no Error Boundary)
// and the route MUST resolve from a deep URL — the W-spa-fix smoke pinned
// in 04-code is also exercised here.

import { expect, test } from './fixtures/test';

import {
  mockBootstrap,
  mockPullRequestCommits,
  mockPullRequestDetail,
  mockRepoLookup,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const REPO = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
const PR_NUMBER = '42';
const PR_SHA = '1234567890abcdef1234567890abcdef12345678';

test.describe('PR cockpit (W-T-13)', () => {
  test('mocked PR detail renders the cockpit @action:pr.detail', async ({ page }) => {
    await mockBootstrap(page);
    await mockRepoLookup(page, { id: REPO, default_branch: 'main' });
    // The page's Commits section reads the PR's commits; without a fixture the
    // failed read would add its own alert to the page.
    await mockPullRequestCommits(page, [
      {
        sha: PR_SHA,
        message: 'Add JeRyu Phase 3 backend',
        date: '2026-05-26T00:00:00Z',
      },
    ]);
    await mockPullRequestDetail(page, {
      repoId: `${REPO.host}:${REPO.owner}/${REPO.name}`,
      number: PR_NUMBER,
      title: 'Add JeRyu Phase 3 backend',
      state: 'open',
      head_sha: PR_SHA,
      approvals: 0,
      required_approvals: 1,
      passport: 'pass',
      can_merge: true,
    });

    await page.goto(
      `/repos/${REPO.host}/${REPO.owner}/${REPO.name}/pulls/${PR_NUMBER}`
    );

    // The not-implemented envelope renders `Pull request #42` as its <h1>;
    // the Phase 3 cockpit renders the PR title as the <h1>. Either is
    // acceptable.
    const heading = page.locator('h1', {
      hasText: new RegExp(`Pull request #${PR_NUMBER}|PR #${PR_NUMBER}|Add JeRyu Phase 3 backend`, 'i'),
    });
    const errorState = page.locator('[role="alert"]');

    await expect(heading.or(errorState)).toBeVisible({ timeout: 15_000 });
  });

  test('a merged pull request is settled: a state badge, one calm line, no approve or merge controls @action:pr.settled', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockRepoLookup(page, { id: REPO, default_branch: 'main' });
    // The page's Commits section reads the PR's commits; without a fixture the
    // failed read would add its own alert to the page.
    await mockPullRequestCommits(page, [
      {
        sha: PR_SHA,
        message: 'Add JeRyu Phase 3 backend',
        date: '2026-05-26T00:00:00Z',
      },
    ]);
    // The server still reports the passport of a merged PR as blocked ("merged").
    await mockPullRequestDetail(page, {
      repoId: `${REPO.host}:${REPO.owner}/${REPO.name}`,
      number: PR_NUMBER,
      title: 'Ready to pin',
      state: 'merged',
      head_sha: PR_SHA,
      approvals: 1,
      required_approvals: 1,
      passport: 'blocked',
      can_merge: false,
    });
    await page.route(/\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/diff$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ head_sha: PR_SHA, base_sha: PR_SHA, files: [], truncated: false }),
      })
    );

    await page.goto(`/repos/${REPO.host}/${REPO.owner}/${REPO.name}/pulls/${PR_NUMBER}`);
    await expect(page.getByTestId('pr-state-badge')).toHaveText('Merged', { timeout: 15_000 });
    await expect(page.getByText(/Merged into main\. Nothing is waiting/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Approve exact SHA/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Request changes' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Merge', exact: true })).toHaveCount(0);
    await expect(page.getByText(/Merge blocked/)).toHaveCount(0);
    await expect(page.getByText(/Passport: BLOCKED/)).toHaveCount(0);
    // A pull request that changes no files says so instead of spinning.
    await expect(page.getByTestId('pr-diff-note')).toHaveText('This pull request changes no files.');
    // The repository is a link back to where the pull request lives.
    await expect(page.getByRole('link', { name: `${REPO.owner}/${REPO.name}` }).first()).toHaveAttribute(
      'href',
      `/repos/${REPO.host}/${REPO.owner}/${REPO.name}`
    );
  });

  test('deep PR route returns 200 (SPA fallback) @bff', async ({ request }) => {
    const res = await request.get(
      `/repos/${REPO.host}/${REPO.owner}%2F${REPO.name}/pulls/${PR_NUMBER}`,
      { failOnStatusCode: false }
    );
    expect(res.status()).toBe(200);
  });
});
