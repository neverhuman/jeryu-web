// 43-pr-queue-again.spec.ts — the merge queue strip on the pull request page.
//
// The queue only ever lands a commit that passed the gate, so an entry that
// failed its gate twice is where the queue stops and a person starts. The page
// reads the repository's queue (`GET …/merge-queue`), says what became of this
// pull request's entry, and offers the one act that follows: queue it again
// (`POST …/pulls/{number}/queue`, with an Idempotency-Key). A refusal is
// worded in place, and an entry that is still building offers nothing.

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

test.describe('Queue a pull request again', () => {
  test('offers Queue again on a failed entry and nothing while it builds @action:pr.queue_again', async ({
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

    // Accepted: the entry is building again, so the strip has nothing to offer.
    refuse = false;
    await strip.getByRole('button', { name: 'Queue again' }).click();
    await expect.poll(() => posts.length).toBe(2);
    expect(posts[0].key).not.toBe(posts[1].key);
    await expect(page.getByTestId('pr-queue-again')).toHaveCount(0);
  });
});
