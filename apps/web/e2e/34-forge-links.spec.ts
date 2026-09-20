// 34-forge-links.spec.ts — forge-shaped links land on the canonical pages.
//
// `/<owner>/<repo>/pull/<n>` is the link shape in circulation (pull request
// bodies, notifications, agent output, bookmarks). It must redirect to
// `/repos/<provider>/<owner>/<repo>/pulls/<n>` instead of falling through to
// the 404 page, and the provider must come from the repository list.

import { expect, test } from './fixtures/test';

import {
  mockBootstrap,
  mockPullRequestDetail,
  mockRepoList,
  mockRepoLookup,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const REPO = { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' } as const;
const PR_NUMBER = '42';
const PR_SHA = '1234567890abcdef1234567890abcdef12345678';
const CANONICAL = `/repos/${REPO.host}/${REPO.owner}/${REPO.name}/pulls/${PR_NUMBER}`;

test('a forge-shaped pull link opens the pull request page @action:routing.forge_pull_link', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockRepoList(page, [{ id: REPO, default_branch: 'main', visibility: 'public' }]);
  await mockRepoLookup(page, { id: REPO, default_branch: 'main' });
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

  await page.goto(`/${REPO.owner}/${REPO.name}/pull/${PR_NUMBER}`);

  await expect(page).toHaveURL(new RegExp(`${CANONICAL}$`), { timeout: 15_000 });
  const heading = page.locator('h1', {
    hasText: new RegExp(`Pull request #${PR_NUMBER}|PR #${PR_NUMBER}|Add JeRyu Phase 3 backend`, 'i'),
  });
  await expect(heading).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Page not found/i)).toHaveCount(0);
});

test('a forge-shaped issue link lands on the repository @action:routing.forge_issue_link', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockRepoList(page, [{ id: REPO, default_branch: 'main', visibility: 'public' }]);
  await mockRepoLookup(page, { id: REPO, default_branch: 'main' });

  await page.goto(`/${REPO.owner}/${REPO.name}/issues/7`);

  // The per-repository tracker is retired: its links land on the repository.
  await expect(page).toHaveURL(
    new RegExp(`/repos/${REPO.host}/${REPO.owner}/${REPO.name}$`),
    { timeout: 15_000 }
  );
  await expect(page.getByText(/Page not found/i)).toHaveCount(0);
});

test('a reserved top-level name still wins over the forge pattern @action:routing.forge_reserved_names', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockRepoList(page, [{ id: REPO, default_branch: 'main', visibility: 'public' }]);

  // `/quality-gate/heads/:owner/:name/:sha` has the same segment count as
  // `:owner/:repo/issues/:number`; the named route must win.
  await page.goto(`/repos/${REPO.host}/${REPO.owner}/${REPO.name}`);
  await expect(page.getByText(/Page not found/i)).toHaveCount(0);

  // An owner/repo we do not know is a bad address, not a silent redirect.
  await page.goto('/nobody/nothing/pull/1');
  await expect(page.getByText(/Page not found/i)).toBeVisible({ timeout: 15_000 });
});
