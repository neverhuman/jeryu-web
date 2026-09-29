// 36-search.spec.ts — /search?q= is a real, linkable results page over a real
// endpoint.
//
// The header offers "Search or jump to…"; a search must also have an address
// that can be pasted into a todo or handed to an agent, and it must find
// content, not only nav destinations. One `GET /api/v1/search` call answers
// every kind; pages are matched in the SPA.

import { expect, test } from './fixtures/test';

import { mockBootstrap, mockRepoList, mockSearch } from './fixtures/mocks';

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

const HITS = [
  {
    kind: 'repository' as const,
    id: 'repository:neverhuman/gatekeeper',
    title: 'neverhuman/gatekeeper',
    context: 'internal',
    snippet: 'Merge gate service.',
    path: '/repos/jeryu/neverhuman/gatekeeper',
  },
  {
    kind: 'repository' as const,
    id: 'repository:neverhuman/forge',
    title: 'neverhuman/forge',
    context: 'private',
    path: '/repos/jeryu/neverhuman/forge',
  },
  {
    kind: 'pull_request' as const,
    id: 'pull_request:neverhuman/forge#7',
    title: '#7 Close the gate before the receipt',
    context: 'neverhuman/forge · open',
    path: '/repos/jeryu/neverhuman/forge/pulls/7',
  },
  {
    kind: 'todo' as const,
    id: 'todo:jeryu/20260921-002945',
    title: 'Add product-wide search',
    context: 'jeryu · open',
    snippet: 'The command palette is a jump-to; the gate has no search.',
    path: '/work?family=jeryu&todo=20260921-002945',
  },
];

test.describe('Search page', () => {
  test('a /search?q= link renders server results and the palette hands off to it @action:search.results', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockRepoList(page, REPOS, { search: true });
    await mockSearch(page, HITS);

    const searched = page.waitForRequest(
      (r) =>
        new URL(r.url()).pathname === '/api/v1/search' &&
        new URL(r.url()).searchParams.get('q') === 'gate'
    );
    await page.goto('/search?q=gate');
    await searched;

    await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible();
    await expect(page.getByText('Page not found')).toHaveCount(0);

    // Content, not just destinations: a repository, a pull request title and a
    // todo, each linking to the page that opens it.
    const repos = page.getByRole('region', { name: 'Repositories' });
    await expect(repos.getByRole('link', { name: 'neverhuman/gatekeeper' })).toHaveAttribute(
      'href',
      '/repos/jeryu/neverhuman/gatekeeper'
    );
    await expect(repos.getByRole('link', { name: 'neverhuman/forge' })).toHaveCount(0);
    const pulls = page.getByRole('region', { name: 'Pull requests' });
    await expect(
      pulls.getByRole('link', { name: '#7 Close the gate before the receipt' })
    ).toHaveAttribute('href', '/repos/jeryu/neverhuman/forge/pulls/7');
    const todos = page.getByRole('region', { name: 'Todos' });
    await expect(todos.getByRole('link', { name: 'Add product-wide search' })).toHaveAttribute(
      'href',
      '/work?family=jeryu&todo=20260921-002945'
    );
    // A kind the server searched and found nothing in still says so.
    await expect(
      page.getByRole('region', { name: 'Issues' }).getByText('No issue matches “gate”.')
    ).toBeVisible();
    // Pages are matched in the SPA, next to the server's records.
    const pages = page.getByRole('region', { name: 'Pages' });
    await expect(pages.getByRole('link', { name: /Quality gate/i }).first()).toBeVisible();

    // A `name#12` reference is resolved by the same endpoint.
    await page.getByLabel('Search query').fill('forge#7');
    await page.getByRole('search').getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/\/search\?q=forge%237$/);
    await expect(
      page
        .getByRole('region', { name: 'Pull requests' })
        .getByRole('link', { name: '#7 Close the gate before the receipt' })
    ).toHaveAttribute('href', '/repos/jeryu/neverhuman/forge/pulls/7');

    // The palette's "See all results" lands on the same address.
    await page.goto('/repos');
    await page.getByRole('button', { name: /Search or jump to/ }).click();
    await page.getByRole('combobox', { name: 'Command palette' }).fill('gate');
    await page.getByRole('option', { name: 'See all results for “gate”' }).click();
    await expect(page).toHaveURL(/\/search\?q=gate$/);
    await expect(
      page
        .getByRole('region', { name: 'Repositories' })
        .getByRole('link', { name: 'neverhuman/gatekeeper' })
    ).toBeVisible();
  });
});
