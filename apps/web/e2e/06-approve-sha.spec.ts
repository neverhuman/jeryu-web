// 06-approve-sha.spec.ts — exact-SHA approval flow + SHA drift conflict (W-T-14).
//
// Drives the §35.1.7 "approve at exact SHA" contract through the REAL PR
// cockpit UI (no `page.evaluate(fetch)`): we hydrate the page with the full
// `PullRequestDetail` wire shape, click the "Approve exact SHA <sha>" button
// in the Review sidebar, and assert the SPA's resulting surface.
//
//   1. Success path — the approve endpoint returns the updated detail (200);
//      the SPA swaps in the new copy and shows NO recovery banner.
//
//   1b. Self-approval — an author cannot approve their own pull request
//      (`403 pull_self_approval_forbidden`). When the signed-in account is
//      visibly the author the Approve button is disabled and says who has to
//      approve instead; when only the server can tell, the rejected click
//      surfaces the server's message plus the independent-reviewer next step
//      and leaves the approval count untouched.
//
//   2. Stale path — when the head moved since page load, the approve endpoint
//      returns `409 merge_sha_stale` with `expected_sha` / `current_sha`. The
//      cockpit must surface its recovery banner (role="alert") naming the SHA
//      drift (old → new) with a Refresh button.
//
// The Approve button always carries the head SHA the reviewer saw
// (`ReviewSidebar` reads `detail.summary.head_sha`), so clicking it is the
// real driver of the exact-SHA body the backend gates on.

import { expect, test } from './fixtures/test';

import {
  forceDriftSha,
  mockBootstrap,
  mockPullRequestDetail,
  mockRepoList,
} from './fixtures/mocks';
import { mockPipelineApi } from './fixtures/pipelineMocks';

test.describe.configure({ retries: 1 });

const REPO = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
const REPO_ID = `${REPO.host}:${REPO.owner}/${REPO.name}`;
const PR_NUMBER = '99';
const OLD_SHA = '1111111111111111111111111111111111111111';
const NEW_SHA = '2222222222222222222222222222222222222222';
const PR_URL = `/repos/${REPO.host}/${REPO.owner}%2F${REPO.name}/pulls/${PR_NUMBER}`;

/** Locate the Approve button by its exact-SHA label (`head_sha.slice(0,7)`). */
function approveButton(page: import('@playwright/test').Page) {
  return page.getByRole('button', {
    name: new RegExp(`Approve exact SHA ${OLD_SHA.slice(0, 7)}`, 'i'),
  });
}

test.describe('Approve at exact SHA (W-T-14)', () => {
  test('Request changes posts a review pinned to the head SHA; the Pipeline panel shows the gate log @action:pr.request_changes @action:pr.pipeline_events', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);
    const detail = await mockPullRequestDetail(page, {
      repoId: REPO_ID,
      number: PR_NUMBER,
      title: 'Needs a test',
      head_sha: OLD_SHA,
      passport: 'blocked',
    });
    await mockPipelineApi(page);
    const reviews: unknown[] = [];
    await page.route(/\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/reviews$/, async (route, req) => {
      reviews.push(JSON.parse(req.postData() ?? '{}'));
      const summary = detail.summary as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...detail,
          summary: {
            ...summary,
            review: { ...(summary.review as object), changes_requested: 1, user_review_state: 'changes_requested' },
          },
        }),
      });
    });

    await page.goto(PR_URL);
    await expect(page.getByRole('heading', { name: /PR #99: Needs a test/i })).toBeVisible({
      timeout: 15_000,
    });
    const request = page.getByRole('button', { name: 'Request changes' });
    await expect(request).toBeEnabled();
    await request.click();
    await page.getByLabel('Requested changes').fill('Please add a regression test.');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('.review-sidebar__changes')).toContainText('1 changes requested');
    expect(reviews).toEqual([
      {
        verdict: 'request_changes',
        expected_head_sha: OLD_SHA,
        body_markdown: 'Please add a regression test.',
        thread_comments: [],
        evidence: null,
      },
    ]);

    // The pipeline's record of this PR, with the failed gate's log one click away.
    const panel = page.getByTestId('pull-pipeline-events');
    await expect(panel).toContainText('Gate failed on neverhuman/jeryu#99');
    await panel.getByRole('button', { name: 'Log for event 10' }).click();
    await expect(panel.getByLabel('Log tail of event 10')).toContainText('gate: FAILED');
    await expect(panel.getByRole('link', { name: 'All activity' })).toHaveAttribute(
      'href',
      '/activity?repo=neverhuman%2Fjeryu&pr=99'
    );
  });

  test('clicking Approve on the cockpit succeeds and shows no recovery banner @action:pr.approve_success', async ({
    page,
  }) => {
    await mockBootstrap(page);
    // The list mock lets `useResolveRepo` map the URL to the backend repo id.
    await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);
    await mockPullRequestDetail(page, {
      repoId: REPO_ID,
      number: PR_NUMBER,
      title: 'Approve happy path',
      head_sha: OLD_SHA,
      passport: 'blocked',
    });

    // Approve endpoint accepts the exact head SHA and returns the (now
    // approved) detail. We echo back a 1-approval posture so the success
    // path is observable in the sidebar.
    await page.route(
      /\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/approve$/,
      async (route, req) => {
        if (req.method() !== 'POST') {
          await route.continue();
          return;
        }
        const body = JSON.parse(req.postData() ?? '{}') as {
          expected_head_sha?: string;
        };
        // The body must carry the exact SHA the reviewer saw.
        expect(body.expected_head_sha).toBe(OLD_SHA);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            summary: {
              repo: {
                id: REPO_ID,
                host: 'jeryu',
                owner: 'neverhuman',
                name: 'jeryu',
              },
              number: Number(PR_NUMBER),
              entity: { kind: 'pull_request', id: `${REPO_ID}#${PR_NUMBER}` },
              title: 'Approve happy path',
              author: '@author',
              head_ref: 'feature/x',
              base_ref: 'main',
              head_sha: OLD_SHA,
              base_sha: 'base000000000000000000000000000000000000',
              state: 'open',
              draft: false,
              mergeable: {
                level: 'blocked',
                can_merge: false,
                reason: 'Passport blocked',
                exact_head_sha: OLD_SHA,
                required_gate: 'passport',
              },
              review: {
                required_approvals: 1,
                approvals: 1,
                changes_requested: 0,
                unresolved_threads: 0,
                user_review_state: 'approved',
              },
              checks: {
                total: 2,
                passing: 2,
                failing: 0,
                pending: 0,
                skipped: 0,
              },
              agents: {
                active_sessions: 0,
                proposed_patches: 0,
                evidence_packets: 0,
                blockers: 0,
              },
              labels: [],
              updated_at: '2026-05-26T00:00:00Z',
              passport_hash: 'passport-hash-0001',
              available_actions: [],
            },
            description: null,
            merge_passport: {
              status: 'blocked',
              head_sha: OLD_SHA,
              blockers: [
                {
                  code: 'passport_blocked_checks',
                  message: 'Required checks failing.',
                  details: null,
                },
              ],
              evaluated_at: '2026-05-26T00:00:00Z',
            },
            passport_hash: 'passport-hash-0001',
          }),
        });
      }
    );

    await page.goto(PR_URL);

    // The cockpit hydrates: the PR title heading + the exact-SHA approve CTA.
    await expect(
      page.getByRole('heading', { name: /PR #99: Approve happy path/i })
    ).toBeVisible({ timeout: 15_000 });
    const approve = approveButton(page);
    await expect(approve).toBeVisible();
    await approve.click();

    // Success: the sidebar reflects the new approval posture and NO recovery
    // banner appears (the banner only renders on a 409 drift).
    await expect(page.locator('.review-sidebar__approvals')).toHaveText(
      /1 of 1 approvals/,
      { timeout: 10_000 }
    );
    await expect(page.locator('.pr-cockpit__recovery')).toHaveCount(0);
  });

  test('clicking Approve on a stale head surfaces the SHA-drift recovery banner @action:pr.approve_drift @action:pr.refresh_after_drift', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);
    await mockPullRequestDetail(page, {
      repoId: REPO_ID,
      number: PR_NUMBER,
      title: 'Approve stale path',
      head_sha: OLD_SHA,
      passport: 'blocked',
    });
    // The approve POST returns 409 merge_sha_stale with expected/current SHA.
    await forceDriftSha(page, OLD_SHA, NEW_SHA);

    await page.goto(PR_URL);
    await expect(
      page.getByRole('heading', { name: /PR #99: Approve stale path/i })
    ).toBeVisible({ timeout: 15_000 });

    await approveButton(page).click();

    // The cockpit recovery banner appears (role="alert"), names the SHA
    // drift, and renders both the old + new short SHAs with a Refresh CTA.
    const banner = page.locator('.pr-cockpit__recovery');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toHaveAttribute('role', 'alert');
    await expect(banner).toContainText(/Head SHA changed/i);
    await expect(banner.locator('code').first()).toHaveText(OLD_SHA.slice(0, 7));
    await expect(banner.locator('code').nth(1)).toHaveText(NEW_SHA.slice(0, 7));
    await expect(banner.getByRole('button', { name: /Refresh/i })).toBeVisible();
    await banner.getByRole('button', { name: /Refresh/i }).click();
    await expect(banner).toHaveCount(0);
  });

  test('merge controls send merge, squash, and rebase variants @action:pr.merge_success @action:pr.merge_variants', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);
    const detail = await mockPullRequestDetail(page, {
      repoId: REPO_ID,
      number: PR_NUMBER,
      title: 'Merge happy path',
      head_sha: OLD_SHA,
      passport: 'pass',
      can_merge: true,
      approvals: 1,
      required_approvals: 1,
    });
    const mergeMethods: string[] = [];
    await page.route(
      /\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/merge$/,
      async (route, request) => {
        if (request.method() !== 'POST') {
          await route.continue();
          return;
        }
        const body = JSON.parse(request.postData() ?? '{}') as {
          expected_head_sha?: string;
          expected_passport_hash?: string | null;
          merge_method?: string;
        };
        expect(body.expected_head_sha).toBe(OLD_SHA);
        expect(body.expected_passport_hash).toBe('passport-hash-0001');
        mergeMethods.push(body.merge_method ?? '');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(detail),
        });
      }
    );

    await page.goto(PR_URL);
    await expect(
      page.getByRole('heading', { name: /PR #99: Merge happy path/i })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /^Merge$/ }).click();
    await page.getByRole('button', { name: 'Squash' }).click();
    await page.getByRole('button', { name: 'Rebase' }).click();

    await expect
      .poll(() => mergeMethods.join(','), { timeout: 10_000 })
      .toBe('merge,squash,rebase');
  });
  test('a refused merge shows the server reason verbatim @action:pr.merge_refused', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);
    await mockPullRequestDetail(page, {
      repoId: REPO_ID,
      number: PR_NUMBER,
      title: 'Diverged from linear main',
      head_sha: OLD_SHA,
      passport: 'pass',
      can_merge: true,
      approvals: 1,
      required_approvals: 1,
    });
    const reason =
      'main requires linear history and the pull request could not be rebased onto it: replaying onto the base conflicts in: README.md';
    await page.route(
      /\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/merge$/,
      async (route, request) => {
        if (request.method() !== 'POST') {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'merge_blocked', message: reason, details: {} },
          }),
        });
      }
    );

    await page.goto(PR_URL);
    await expect(
      page.getByRole('heading', { name: /PR #99: Diverged from linear main/i })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /^Merge$/ }).click();
    await expect(page.getByTestId('pr-merge-error')).toHaveText(
      `Merge refused: ${reason}`
    );
  });

  test('the author sees Approve disabled with the reason @action:pr.approve_self_blocked', async ({
    page,
  }) => {
    await mockBootstrap(page, { login: 'alton' });
    await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);
    await mockPullRequestDetail(page, {
      repoId: REPO_ID,
      number: PR_NUMBER,
      title: 'Telemetry counters',
      author: 'alton',
      head_sha: OLD_SHA,
      passport: 'blocked',
    });
    // Any approve POST would be a bug: the button must never send one.
    let approveCalls = 0;
    await page.route(/\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/approve$/, async (route) => {
      approveCalls += 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    await page.goto(PR_URL);
    await expect(
      page.getByRole('heading', { name: /PR #99: Telemetry counters/i })
    ).toBeVisible({ timeout: 15_000 });

    const approve = approveButton(page);
    await expect(approve).toBeDisabled();
    await expect(page.getByTestId('pr-approve-note')).toContainText(
      'You opened this pull request, so you cannot approve it.'
    );
    await expect(page.getByTestId('pr-approve-note')).toContainText(
      `An authenticated reviewer other than alton has to approve exact SHA ${OLD_SHA.slice(0, 7)}.`
    );
    await approve.click({ force: true });
    expect(approveCalls).toBe(0);
  });

  test('a self-approval the server catches explains itself on the page @action:pr.approve_self_refused', async ({
    page,
  }) => {
    // The web login and the forge handle differ, so only the server can tell
    // that the reviewer is the author.
    await mockBootstrap(page, { login: 'alton' });
    await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);
    await mockPullRequestDetail(page, {
      repoId: REPO_ID,
      number: PR_NUMBER,
      title: 'Telemetry counters',
      author: 'alton.veox',
      head_sha: OLD_SHA,
      passport: 'blocked',
    });
    const message = 'pull request authors cannot approve their own changes';
    await page.route(
      /\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/approve$/,
      async (route, request) => {
        if (request.method() !== 'POST') {
          await route.continue();
          return;
        }
        const body = JSON.parse(request.postData() ?? '{}') as {
          expected_head_sha?: string;
        };
        expect(body.expected_head_sha).toBe(OLD_SHA);
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'pull_self_approval_forbidden',
              message,
              details: {
                pull_number: Number(PR_NUMBER),
                author: 'alton',
                reviewer: 'alton',
              },
            },
          }),
        });
      }
    );

    await page.goto(PR_URL);
    await expect(
      page.getByRole('heading', { name: /PR #99: Telemetry counters/i })
    ).toBeVisible({ timeout: 15_000 });

    const approve = approveButton(page);
    await expect(approve).toBeEnabled();
    await approve.click();

    const refusal = page.getByTestId('pr-approve-error');
    await expect(refusal).toBeVisible({ timeout: 10_000 });
    await expect(refusal).toHaveAttribute('role', 'alert');
    await expect(refusal).toContainText(`Approval refused: ${message}`);
    await expect(refusal).toContainText(
      'signed in as alton, which is also the author (alton)'
    );
    await expect(refusal).toContainText(
      `independent authenticated reviewer with write access has to approve exact SHA ${OLD_SHA.slice(0, 7)}`
    );
    // The refusal is not head drift, so no recovery banner, and no approval.
    await expect(page.locator('.pr-cockpit__recovery')).toHaveCount(0);
    await expect(page.locator('.review-sidebar__approvals')).toHaveText(
      /0 of 1 approvals/
    );
  });
});
