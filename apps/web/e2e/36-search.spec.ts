// 36-search.spec.ts — /search?q= is a real, linkable results page.
//
// The header offers "Search or jump to…"; a search must also have an address
// that can be pasted into a todo or handed to an agent. Repositories come from
// `GET /api/v1/repos?q=`, pages and `name#12` pull requests are matched in the
// SPA.

import { expect, test } from './fixtures/test';

import { mockBootstrap, mockRepoList } from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const REPOS = [
  {
    id: { host: 'jeryu', owner: 'neverhuman', name: 'gatekeeper' },
    default_branch: 'main',
    description: 'Merge gate service.',
    visibility: 'internal' as const,
    open_pull_requests: 0,
    failing_checks: 0,
  },
  {
    id: { host: 'jeryu', owner: 'neverhuman', name: 'forge' },
    default_branch: 'main',
    description: 'Web Forge SPA.',
    visibility: 'private' as const,
    open_pull_requests: 0,
    failing_checks: 0,
  },
];

test.describe('Search page', () => {
  test('a /search?q= link renders results and the palette hands off to it @action:search.results', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockRepoList(page, REPOS, { search: true });

    const searched = page.waitForRequest(
      (r) => new URL(r.url()).pathname === '/api/v1/repos' && new URL(r.url()).searchParams.get('q') === 'gate'
    );
    await page.goto('/search?q=gate');
    await searched;

    await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible();
    await expect(page.getByText('Page not found')).toHaveCount(0);
    const repos = page.getByRole('region', { name: 'Repositories' });
    await expect(repos.getByRole('link', { name: 'neverhuman/gatekeeper' })).toBeVisible();
    await expect(repos.getByRole('link', { name: 'neverhuman/forge' })).toHaveCount(0);
    const pages = page.getByRole('region', { name: 'Pages' });
    await expect(pages.getByRole('link', { name: /Quality gate/i }).first()).toBeVisible();

    // A pull request reference resolves through the repository list.
    await page.getByLabel('Search query').fill('forge#7');
    await page.getByRole('search').getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/\/search\?q=forge%237$/);
    await expect(
      page.getByRole('link', { name: 'Open pull request #7 in neverhuman/forge' })
    ).toHaveAttribute('href', '/repos/jeryu/neverhuman/forge/pulls/7');

    // The palette's "See all results" lands on the same address.
    await page.goto('/repos');
    await page.getByRole('button', { name: /Search or jump to/ }).click();
    await page.getByRole('combobox', { name: 'Command palette' }).fill('gate');
    await page.getByRole('option', { name: 'See all results for “gate”' }).click();
    await expect(page).toHaveURL(/\/search\?q=gate$/);
    await expect(
      page.getByRole('region', { name: 'Repositories' }).getByRole('link', { name: 'neverhuman/gatekeeper' })
    ).toBeVisible();
  });
});
