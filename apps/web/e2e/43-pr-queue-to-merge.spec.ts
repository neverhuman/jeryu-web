// 43-pr-queue-to-merge.spec.ts — the merge queue's act in the merge box.
//
// The queue only ever lands a commit that passed the gate, so it is both the
// recovery after a failed entry and the only way to land a green head whose
// base has moved: a base that wants linear history refuses the direct merge,
// because the replay onto its tip is a commit no gate has run on.
//
// The box reads the repository's queue (`GET …/merge-queue`), says where this
// pull request stands, and offers the one act that follows — Queue again, or
// Queue to merge (`POST …/pulls/{number}/queue`, with an Idempotency-Key).
// A refusal is worded in place; once the entry builds, the replay gate's
// progress is on the page until it lands.

import { expect, test } from './fixtures/test';

import { mockBootstrap, mockPullRequestDetail, mockRepoList } from './fixtures/mocks';
import { mockPipelineApi } from './fixtures/pipelineMocks';

const REPO = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
const REPO_ID = `${REPO.host}:${REPO.owner}/${REPO.name}`;
const PR_NUMBER = '99';
const HEAD_SHA = '1111111111111111111111111111111111111111';
const PR_URL = `/repos/${REPO.host}/${REPO.owner}%2F${REPO.name}/pulls/${PR_NUMBER}`;

function entry(state: string, reason: string | null = null): Record<string, unknown> {
  return {
    repo: `${REPO.owner}/${REPO.name}`,
    base: 'main',
    number: Number(PR_NUMBER),
    pr_head_sha: HEAD_SHA,
    base_sha: '2222222222222222222222222222222222222222',
    queue_ref: `refs/queue/main/${PR_NUMBER}`,
    queue_sha: '3333333333333333333333333333333333333333',
    state,
    enqueued_at: '2026-10-01T09:00:00Z',
    enqueued_by: 'pr-redteam',
    reason,
  };
}

test.describe('Queue a pull request to merge it', () => {
  test('offers Queue again on a failed entry and follows the replay once it builds @action:pr.queue_again', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);
    await mockPullRequestDetail(page, {
      repoId: REPO_ID,
      number: PR_NUMBER,
      title: 'Shift queue depth',
      head_sha: HEAD_SHA,
      passport: 'blocked',
    });
    await mockPipelineApi(page);

    let state = 'failed';
    const posts: Array<{ method: string; key: string | undefined }> = [];
    let refuse = true;
    await page.route(/\/api\/v1\/repos\/[^/]+\/merge-queue$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ entries: [entry(state, 'The queue gate failed twice on 3333333.')] }),
      })
    );
    await page.route(/\/pulls\/\d+\/queue$/, (route, request) => {
      posts.push({ method: request.method(), key: request.headers()['idempotency-key'] });
      if (refuse) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'merge_gate_blocked',
              message: 'the pull request does not pass its merge gate: changes requested',
            },
          }),
        });
      }
      state = 'building';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(entry('building')),
      });
    });

    await page.goto(PR_URL);
    await expect(page.getByRole('heading', { name: /Pull request #99: Shift queue depth/i })).toBeVisible({
      timeout: 15_000,
    });

    const strip = page.getByTestId('pr-queue-again');
    await expect(strip).toContainText(
      'The merge queue failed on this pull request. The queue gate failed twice on 3333333.'
    );

    // The forge refuses: the reason is worded in place, nothing navigates.
    await strip.getByRole('button', { name: 'Queue again' }).click();
    await expect(page.getByTestId('pr-queue-again-error')).toContainText(
      'does not pass its merge gate'
    );
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0].method).toBe('POST');
    expect(posts[0].key).toBeTruthy();

    // Accepted: the entry is building, and the strip follows the replay gate.
    refuse = false;
    await strip.getByRole('button', { name: 'Queue again' }).click();
    await expect.poll(() => posts.length).toBe(2);
    expect(posts[0].key).not.toBe(posts[1].key);
    await expect(page.getByTestId('pr-queue-again')).toHaveCount(0);
    await expect(page.getByTestId('pr-queue-building')).toContainText(
      '3333333 is this head replayed onto main'
    );
    await expect(page.getByTestId('pr-queue-gate-progress')).toBeVisible();
  });

  test('a merge refused for the base having moved offers Queue to merge @action:pr.queue_to_merge', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);
    await mockPullRequestDetail(page, {
      repoId: REPO_ID,
      number: PR_NUMBER,
      title: 'Teach the gate to say which commit it ran on',
      head_sha: HEAD_SHA,
      passport: 'pass',
      can_merge: true,
      approvals: 1,
      required_approvals: 1,
    });
    await mockPipelineApi(page);

    const refusal =
      'main requires linear history, and the replay of the pull request onto it (9f3c1ab) has no result for neverhuman/required; queue the pull request so the forge gates the commit it lands';
    let queued = false;
    const posts: string[] = [];
    await page.route(/\/api\/v1\/repos\/[^/]+\/merge-queue$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ entries: queued ? [entry('building')] : [] }),
      })
    );
    await page.route(/\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/merge$/, async (route, request) => {
      if (request.method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'merge_blocked', message: refusal, details: {} } }),
      });
    });
    await page.route(/\/pulls\/\d+\/queue$/, (route, request) => {
      posts.push(request.method());
      queued = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(entry('building')),
      });
    });

    await page.goto(PR_URL);
    await expect(
      page.getByRole('heading', { name: /Pull request #99: Teach the gate/i })
    ).toBeVisible({ timeout: 15_000 });

    // Nothing says to queue it until the forge refuses the direct merge.
    await expect(page.getByTestId('pr-queue-to-merge')).toHaveCount(0);
    await page.getByRole('button', { name: /^Merge$/ }).click();
    await expect(page.getByTestId('pr-merge-error')).toContainText('queue the pull request');

    const offer = page.getByTestId('pr-queue-to-merge');
    await expect(offer).toContainText(
      'main moved since this was gated; the queue replays it onto main, gates that commit, then lands it'
    );
    await offer.getByRole('button', { name: 'Queue to merge' }).click();
    await expect.poll(() => posts).toEqual(['POST']);

    // The entry is in the queue now: its state and the replay gate's progress.
    await expect(page.getByTestId('pr-queue-building')).toContainText(
      'the gate is running on it'
    );
    await expect(page.getByTestId('pr-queue-gate-progress')).toBeVisible();
  });
});
