// 40-pr-close.spec.ts — closing and reopening a pull request from the cockpit.
//
// The page drives the forge's GitHub-shaped edge:
//   PATCH /api/v3/repos/{owner}/{repo}/pulls/{number} {"state":"closed"}
// with an optional comment posted first to the pull request's issue thread.
//
//   1. Close — type a reason, click Close pull request. The comment lands on
//      /issues/{number}/comments BEFORE the PATCH, and the page repaints as
//      closed (the state badge and the settled line) with no reload.
//   2. Reopen — the now-closed pull request offers Reopen, which PATCHes
//      {"state":"open"} and brings the review actions back.
//
// A merged pull request offers neither button (asserted in the unit tests,
// which own the visibility rules).

import { expect, test } from './fixtures/test';

import { mockBootstrap, mockPullRequestDetail, mockRepoList } from './fixtures/mocks';
import { mockPipelineApi } from './fixtures/pipelineMocks';

const REPO = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
const REPO_ID = `${REPO.host}:${REPO.owner}/${REPO.name}`;
const PR_NUMBER = '99';
const HEAD_SHA = '1111111111111111111111111111111111111111';
const PR_URL = `/repos/${REPO.host}/${REPO.owner}%2F${REPO.name}/pulls/${PR_NUMBER}`;

test.describe('Close and reopen a pull request', () => {
  test('closes with a comment, then reopens, without a reload @action:pr.close @action:pr.reopen', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);
    const detail = await mockPullRequestDetail(page, {
      repoId: REPO_ID,
      number: PR_NUMBER,
      title: 'Stale shift work',
      head_sha: HEAD_SHA,
      passport: 'blocked',
    });
    await mockPipelineApi(page);

    // The forge's copy of the state, as the detail endpoint reports it.
    let state: 'open' | 'closed' = 'open';
    const order: string[] = [];
    const comments: string[] = [];
    const patched: Array<string | undefined> = [];

    await page.route(/\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+$/, async (route, request) => {
      if (request.method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...detail,
          summary: { ...(detail.summary as Record<string, unknown>), state },
        }),
      });
    });

    await page.route(
      `**/api/v3/repos/${REPO.owner}/${REPO.name}/issues/${PR_NUMBER}/comments`,
      async (route, request) => {
        order.push('comment');
        const body = JSON.parse(request.postData() ?? '{}') as { body?: string };
        comments.push(body.body ?? '');
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, body: body.body }),
        });
      }
    );

    await page.route(
      `**/api/v3/repos/${REPO.owner}/${REPO.name}/pulls/${PR_NUMBER}`,
      async (route, request) => {
        expect(request.method()).toBe('PATCH');
        order.push('patch');
        const body = JSON.parse(request.postData() ?? '{}') as { state?: string };
        patched.push(body.state);
        state = body.state === 'closed' ? 'closed' : 'open';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            number: Number(PR_NUMBER),
            state,
            merged: false,
          }),
        });
      }
    );

    await page.goto(PR_URL);
    await expect(
      page.getByRole('heading', { name: /Pull request #99: Stale shift work/i })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('pr-state-badge')).toHaveText('Open');

    // 1. Close, with a reason.
    await page.getByLabel('Closing comment').fill('Superseded by the new shift.');
    await page.getByRole('button', { name: 'Close pull request' }).click();

    await expect(page.getByTestId('pr-state-badge')).toHaveText('Closed', {
      timeout: 10_000,
    });
    await expect(page.locator('.review-sidebar__settled')).toContainText(
      'Closed into main'
    );
    await expect(page.getByTestId('pr-close-error')).toHaveCount(0);
    expect(comments).toEqual(['Superseded by the new shift.']);
    expect(order).toEqual(['comment', 'patch']);
    expect(patched).toEqual(['closed']);

    // 2. Reopen — no comment box on a closed pull request, so no comment call.
    await expect(page.getByLabel('Closing comment')).toHaveCount(0);
    await page.getByRole('button', { name: 'Reopen pull request' }).click();

    await expect(page.getByTestId('pr-state-badge')).toHaveText('Open', {
      timeout: 10_000,
    });
    await expect(
      page.getByRole('button', { name: /Approve exact SHA/i })
    ).toBeVisible();
    expect(patched).toEqual(['closed', 'open']);
    expect(order).toEqual(['comment', 'patch', 'patch']);
  });
});
