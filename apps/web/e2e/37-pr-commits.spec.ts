// 37-pr-commits.spec.ts — the Commits section of the PR page.
//
// A shift PR carries one commit per todo, so the reviewer reads the shift from
// this list. The specs below pin the count in the heading, the day groups, the
// expandable message with its trailers, and the error state.

import { expect, test } from './fixtures/test';

import {
  mockBootstrap,
  mockPullRequestCommits,
  mockPullRequestDetail,
  mockRepoLookup,
} from './fixtures/mocks';

const REPO = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
const PR_NUMBER = '89';
const PR_SHA = '1234567890abcdef1234567890abcdef12345678';
// The commits are the pull request's own tab.
const PR_URL = `/repos/${REPO.host}/${REPO.owner}/${REPO.name}/pulls/${PR_NUMBER}/commits`;

const COMMITS = [
  {
    sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    message:
      'Add the pull request commits endpoint\n\nA reviewer could not see what landed.\n\nTodo: 20260925-160159-76f16d\nWorked-by: w1\nShift: dayshift/2026-09-28\n',
    date: '2026-09-27T09:00:00Z',
  },
  {
    sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    message: 'Show the commits on the pull request page',
    date: '2026-09-28T08:00:00Z',
  },
  {
    sha: 'cccccccccccccccccccccccccccccccccccccccc',
    message: 'Group the commits by day\n\nTodo: 20260925-160159-76f16d\n',
    date: '2026-09-28T10:00:00Z',
  },
];

async function openPullRequest(page: import('@playwright/test').Page): Promise<void> {
  await mockBootstrap(page);
  await mockRepoLookup(page, { id: REPO, default_branch: 'main' });
  await mockPullRequestDetail(page, {
    repoId: `${REPO.host}:${REPO.owner}/${REPO.name}`,
    number: PR_NUMBER,
    title: 'Dayshift 2026-09-28',
    state: 'open',
    head_sha: PR_SHA,
    approvals: 1,
    required_approvals: 1,
    passport: 'pass',
    can_merge: true,
  });
}

test.describe('PR commits', () => {
  test('the Commits section lists every commit with its message @action:pr.commits', async ({
    page,
  }) => {
    await openPullRequest(page);
    await mockPullRequestCommits(page, COMMITS);

    await page.goto(PR_URL);

    const section = page.getByTestId('pr-commits');
    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('pr-commits-count')).toHaveText('3');

    const rows = section.getByTestId('pr-commit');
    await expect(rows).toHaveCount(3);
    // Oldest first, and two day groups (Sep 27, then Sep 28).
    await expect(rows.first()).toContainText('Add the pull request commits endpoint');
    await expect(rows.first()).toContainText('aaaaaaa');
    await expect(section.locator('.pr-commits__day')).toHaveCount(2);

    // The full message and its trailers are one click away.
    await expect(section.getByTestId('pr-commit-trailers')).toHaveCount(0);
    await rows
      .first()
      .getByRole('button', { name: /Add the pull request commits endpoint/ })
      .click();
    await expect(section.getByText('A reviewer could not see what landed.')).toBeVisible();
    const trailers = rows.first().getByTestId('pr-commit-trailers');
    await expect(trailers).toContainText('Todo');
    await expect(trailers).toContainText('20260925-160159-76f16d');
    await expect(trailers).toContainText('dayshift/2026-09-28');
  });

  test('a failing commits read shows an error, not an empty list @action:pr.commits_error', async ({
    page,
  }) => {
    await openPullRequest(page);
    await mockPullRequestCommits(page, [], 500);

    await page.goto(PR_URL);

    const section = page.getByTestId('pr-commits');
    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(section).toContainText('Could not load commits');
    await expect(section.getByTestId('pr-commits-empty')).toHaveCount(0);
  });
});
