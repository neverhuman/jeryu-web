// 34-forge-links.spec.ts — the canonical public link lands on the right page.
//
// `/<owner>/<repo>/pull/<n>` is what the API returns as `html_url` for a
// repository this forge hosts, and the link shape already in circulation (pull
// request bodies, notifications, agent output, bookmarks). It must resolve to
// `/repos/<provider>/<owner>/<repo>/pulls/<n>` — the route the pages are
// served at — instead of falling through to the 404 page, and the provider
// must come from the repository list rather than the link.

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

test('a canonical pull tab link keeps its tab, query and fragment @action:routing.forge_pull_tab_link', async ({
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
    passport: 'pass',
    can_merge: true,
  });

  await page.goto(`/${REPO.owner}/${REPO.name}/pull/${PR_NUMBER}/checks?only=failing#top`);

  await expect(page).toHaveURL(
    new RegExp(`${CANONICAL}/checks\\?only=failing#top$`),
    { timeout: 15_000 }
  );
  await expect(page.getByText(/Page not found/i)).toHaveCount(0);
});

test('the pull request page copies the link the forge returned @action:links.copy_pull_link', async ({
  page,
}) => {
  // The clipboard the browser gives a page needs a permission this test does
  // not need to ask for: record what was written instead.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (value: string) => {
          (window as unknown as { __copied?: string }).__copied = value;
        },
      },
      configurable: true,
    });
  });
  await mockBootstrap(page);
  await mockRepoList(page, [{ id: REPO, default_branch: 'main', visibility: 'public' }]);
  await mockRepoLookup(page, { id: REPO, default_branch: 'main' });
  const detail = await mockPullRequestDetail(page, {
    repoId: `${REPO.host}:${REPO.owner}/${REPO.name}`,
    number: PR_NUMBER,
    title: 'Add JeRyu Phase 3 backend',
    state: 'open',
    head_sha: PR_SHA,
    passport: 'pass',
    can_merge: true,
  });
  const returned = detail.html_url as string;
  expect(returned).toBe(`/${REPO.owner}/${REPO.name}/pull/${PR_NUMBER}`);

  await page.goto(`${CANONICAL}`);
  const copy = page.getByTestId('pr-copy-link');
  await expect(copy).toBeVisible({ timeout: 15_000 });
  await copy.click();

  // What a reader shares is the link the API returned, made absolute — never
  // a route this page assembled.
  const copied = await page.evaluate(
    () => (window as unknown as { __copied?: string }).__copied
  );
  expect(copied).toBe(`${new URL(page.url()).origin}${returned}`);
});
