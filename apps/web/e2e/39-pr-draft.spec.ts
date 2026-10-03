// 39-pr-draft.spec.ts — the draft lifecycle through the real PR cockpit.
//
// A draft showed "Draft" and a Merge Passport blocked on `passport_blocked_draft`
// with no control anywhere to mark it ready, so the only way forward was an
// undocumented API call. This drives the control that closes that gap:
//
//   1. On a draft, the merge box's draft row says it is still a draft and
//      carries "Ready for review". Clicking it POSTs `/pulls/{n}/ready`; the
//      server's new detail swaps in and the row is done.
//   2. On the now-open pull request the control reads "Convert to draft".
//   3. A refusal (403 `pull_draft_forbidden`) is worded next to the control
//      and leaves the PR a draft.
//
// Invented repository throughout: nothing here names a real deployment.

import { expect, test } from './fixtures/test';

import { mockBootstrap, mockPullRequestDetail, mockRepoList } from './fixtures/mocks';

const REPO = { host: 'jeryu', owner: 'acme', name: 'widget-shop' } as const;
const REPO_ID = `${REPO.host}:${REPO.owner}/${REPO.name}`;
const PR_NUMBER = '7';
const HEAD_SHA = 'dddddddddddddddddddddddddddddddddddddddd';
const PR_URL = `/repos/${REPO.host}/${REPO.owner}%2F${REPO.name}/pulls/${PR_NUMBER}`;
const AUTHOR = 'dana';

const DRAFT_BLOCKER = {
  code: 'passport_blocked_draft',
  message: 'Draft pull requests cannot be merged: mark it ready for review.',
  details: `POST /api/v1/repos/${REPO.owner}/${REPO.name}/pulls/${PR_NUMBER}/ready`,
};

/** The detail the `ready` route answers: same PR, no longer a draft. */
function readyDetail(draft: Record<string, unknown>): Record<string, unknown> {
  const summary = draft.summary as Record<string, unknown>;
  return {
    ...draft,
    summary: { ...summary, draft: false },
    merge_passport: {
      ...(draft.merge_passport as Record<string, unknown>),
      blockers: [
        {
          code: 'passport_blocked_approvals',
          message: 'Required approver count not satisfied.',
          details: null,
        },
      ],
    },
  };
}

test.describe('Draft pull requests', () => {
  test('the author marks a draft ready from the PR page and the draft blocker clears @action:pr.ready_for_review', async ({
    page,
  }) => {
    await mockBootstrap(page, { login: AUTHOR, auth: { role: 'user' } });
    await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);
    const draft = await mockPullRequestDetail(page, {
      repoId: REPO_ID,
      number: PR_NUMBER,
      title: 'Cart totals',
      author: AUTHOR,
      draft: true,
      head_sha: HEAD_SHA,
      base_ref: 'rc/auto',
      passport: 'blocked',
      blockers: [DRAFT_BLOCKER],
    });
    const posted: string[] = [];
    await page.route(/\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/ready$/, async (route, req) => {
      posted.push(req.url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(readyDetail(draft)),
      });
    });

    await page.goto(PR_URL);
    await expect(page.getByTestId('pr-state-badge')).toHaveText('Draft');
    // Before the click, the draft row says so and carries the way out.
    const row = page.getByTestId('pr-merge-row-draft');
    await expect(row).toHaveAttribute('data-state', 'needed');
    await expect(row).toContainText('Still a draft');
    await expect(row.getByTestId('pr-ready-for-review')).toBeVisible();
    // The note beside the actions names the same move.
    await expect(page.getByTestId('pr-draft-note')).toContainText('Ready for review');

    await page.getByTestId('pr-ready-for-review').click();

    await expect(page.getByTestId('pr-state-badge')).toHaveText('Open');
    await expect(page.getByTestId('pr-merge-row-draft')).toHaveAttribute(
      'data-state',
      'done'
    );
    await expect(page.getByTestId('pr-ready-for-review')).toHaveCount(0);
    expect(posted).toHaveLength(1);
    // And the way back is now on offer instead.
    await expect(page.getByTestId('pr-convert-to-draft')).toBeVisible();
  });

  test('an admin may mark somebody else\'s draft ready @action:pr.passport_ready', async ({
    page,
  }) => {
    await mockBootstrap(page, { login: 'root', auth: { role: 'admin' } });
    await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);
    const draft = await mockPullRequestDetail(page, {
      repoId: REPO_ID,
      number: PR_NUMBER,
      title: 'Cart totals',
      author: AUTHOR,
      draft: true,
      head_sha: HEAD_SHA,
      base_ref: 'rc/auto',
      passport: 'blocked',
      blockers: [DRAFT_BLOCKER],
    });
    await page.route(/\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/ready$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(readyDetail(draft)),
      });
    });

    await page.goto(PR_URL);
    // An admin may move somebody else's draft.
    const row = page.getByTestId('pr-merge-row-draft');
    await expect(row.getByTestId('pr-ready-for-review')).toBeVisible();
    await row.getByTestId('pr-ready-for-review').click();
    await expect(page.getByTestId('pr-state-badge')).toHaveText('Open');
  });

  test('a refused transition is worded next to the control @action:pr.draft_refused', async ({
    page,
  }) => {
    await mockBootstrap(page, { login: AUTHOR, auth: { role: 'user' } });
    await mockRepoList(page, [{ id: REPO, default_branch: 'main' }]);
    await mockPullRequestDetail(page, {
      repoId: REPO_ID,
      number: PR_NUMBER,
      title: 'Cart totals',
      author: AUTHOR,
      draft: true,
      head_sha: HEAD_SHA,
      passport: 'blocked',
      blockers: [DRAFT_BLOCKER],
    });
    await page.route(/\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/ready$/, async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'pull_draft_forbidden',
          message: 'only the pull request author or an admin can change its draft state',
          error: {
            code: 'pull_draft_forbidden',
            message: 'only the pull request author or an admin can change its draft state',
          },
        }),
      });
    });

    await page.goto(PR_URL);
    await page.getByTestId('pr-ready-for-review').click();
    await expect(page.getByTestId('pr-draft-error')).toContainText(
      'Not marked ready for review'
    );
    await expect(page.getByTestId('pr-draft-error')).toContainText(
      'Ask the author, or an administrator'
    );
    // Nothing moved: it is still a draft.
    await expect(page.getByTestId('pr-state-badge')).toHaveText('Draft');
  });
});
