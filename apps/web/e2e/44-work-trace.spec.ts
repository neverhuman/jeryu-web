// 44-work-trace.spec.ts — the work trace on a todo's page and on a PR page.
//
// One change, twelve stages, one of them current. The same rail is on both
// pages from the same model, so a reader lands on either and sees the same
// position; the PR page also names the todos the pull request carries, which
// is the link back from review to the queue.

import { expect, test } from './fixtures/test';

import {
  mockBootstrap,
  mockPullRequestCommits,
  mockPullRequestDetail,
  mockRepoLookup,
} from './fixtures/mocks';
import { mockPipelineApi } from './fixtures/pipelineMocks';
import { mockShiftApi } from './fixtures/shiftMocks';

const REPO = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
const PR_NUMBER = '91';
const PR_SHA = 'abc1230000000000000000000000000000000000';
const PR_URL = `/repos/${REPO.host}/${REPO.owner}/${REPO.name}/pulls/${PR_NUMBER}`;

/** The blocked todo of the shift fixtures, as `/api/v1/attention` reports it. */
function blockedTodoAttention(): Record<string, unknown> {
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    counts: { critical: 0, action: 1, watch: 0 },
    items: [
      {
        id: 'todo_blocked:jeryu:20260919-0930-ddd',
        kind: 'todo_blocked',
        severity: 'action',
        title: 'Cut the core tag',
        reason: 'The jeryu-core tag split.7 does not exist.',
        next_step: 'Cut the tag in jeryu-core, then release the todo.',
        since: new Date(Date.now() - 600_000).toISOString(),
        family: 'jeryu',
        repo: 'jeryu/jeryu-core',
        pr: null,
        todo_id: '20260919-0930-ddd',
        sha: null,
        shift: null,
        href: '/work/20260919-0930-ddd',
        action: null,
      },
    ],
  };
}

test.describe('the work trace', () => {
  test('a todo page shows twelve stages with one current, and the row that waits on you @action:shift.work_trace', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockShiftApi(page);
    await mockPipelineApi(page, { attention: blockedTodoAttention() });

    await page.goto('/work/20260919-0930-ddd');
    const rail = page.getByTestId('work-trace');
    await expect(rail).toBeVisible({ timeout: 15_000 });
    await expect(rail.locator('li')).toHaveCount(12);
    await expect(rail.locator('li[data-state="current"]')).toHaveCount(1);
    // Two attempts and no commit: the work stands at Worked, waiting on a person.
    await expect(rail.locator('li[data-state="current"]')).toContainText('Worked');
    await expect(rail).toHaveAccessibleName(/stage 4 of 12: Worked, waiting on a person/);
    await expect(rail.getByTestId('work-trace-stage-filed')).toHaveAttribute('data-state', 'done');
    await expect(rail.getByTestId('work-trace-stage-merged')).toHaveAttribute(
      'data-state',
      'pending'
    );

    // The Needs-you row about this todo is here, with its next step, not only on /needs-you.
    const here = page.getByTestId('needs-you-about');
    await expect(here).toContainText('Cut the core tag');
    await expect(here).toContainText('Cut the tag in jeryu-core');
  });

  test('a PR page says which todos it carries, and where the change stands @action:pr.carries_todos', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'user' } });
    await mockRepoLookup(page, { id: REPO, default_branch: 'main' });
    await mockPullRequestDetail(page, {
      repoId: `${REPO.host}:${REPO.owner}/${REPO.name}`,
      number: PR_NUMBER,
      title: 'Nightshift 2026-09-18',
      state: 'open',
      head_sha: PR_SHA,
      approvals: 0,
      required_approvals: 1,
      passport: 'blocked',
    });
    await mockShiftApi(page);
    await mockPullRequestCommits(page, [
      {
        sha: 'dddddddddddddddddddddddddddddddddddddddd',
        message: 'Ship heartbeats\n\nSlots had no pulse.\n\nTodo: 20260918-2200-bbb\nWorked-by: w1\n',
        date: '2026-09-28T08:00:00Z',
      },
      {
        sha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        message: 'Tidy the heartbeat test',
        date: '2026-09-28T09:00:00Z',
      },
    ]);

    await page.goto(PR_URL);
    const work = page.getByTestId('pr-work');
    await expect(work).toBeVisible({ timeout: 15_000 });

    // The todos it carries, with the queue's own title, each linking back.
    const carry = work.getByTestId('pr-work-carry-20260918-2200-bbb');
    await expect(carry).toContainText('carries todo 20260918-2200-bbb');
    await expect(carry).toContainText('Ship heartbeats');
    await expect(work.getByTestId('pr-work-carries').locator('li')).toHaveCount(1);
    await carry.getByRole('link', { name: '20260918-2200-bbb' }).click();
    await expect(page).toHaveURL(/\/work\/20260918-2200-bbb\?family=jeryu$/);

    // The same rail, on the review end: the checks pass, the approval is not in,
    // so the change stands at Checks with Reviewed still ahead of it.
    await page.goBack();
    const rail = page.getByTestId('pr-work-trace');
    await expect(rail.locator('li')).toHaveCount(12);
    await expect(rail.locator('li[data-state="current"]')).toHaveCount(1);
    await expect(rail).toHaveAccessibleName(/neverhuman\/jeryu#91: stage 8 of 12: Checks/);
    await expect(rail.getByTestId('work-trace-stage-reviewed')).toHaveAttribute(
      'data-state',
      'pending'
    );
  });
});
