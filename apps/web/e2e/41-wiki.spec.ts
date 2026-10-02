// 41-wiki.spec.ts — the internal wiki: an admin picks the repository in
// Settings, the left navigation grows a Wiki link, and /wiki reads the
// wiki's start page and the Markdown under wiki/ as pages, with a change note
// beside each section; a repository without them is invited to add them.

import { expect, test, type Page, type Route } from './fixtures/test';

import {
  blockingViolations,
  persistAxeResult,
  persistRenderedEvidence,
  runAxe,
} from './fixtures/accessibility';
import { mockBootstrap, mockRepoList } from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const WIKI = {
  id: 'wiki-repo-1',
  host: 'jeryu',
  owner: 'acme',
  name: 'handbook',
  full_name: 'acme/handbook',
  default_branch: 'main',
  private: true,
};

const PAGES: Record<string, string> = {
  'index.md': '# Handbook\n\nStart with [[setup]].\n\n## Conventions\nOne topic per page.\n',
  'README.md': '# Code readme, not part of the wiki\n',
  'wiki/guides/setup.md':
    '---\ntitle: Setting up\nsummary: How a new machine gets the tools\nstatus: current\nupdated: 2026-09-30\nsources: [raw/setup-notes.md, live checks on node-a]\nowner: platform\n---\n# Setting up\n\nInstall the tools.\n',
};

const COMMITS = [
  { sha: 'b'.repeat(40), summary: 'docs: conventions', author: 'Bea', authored_at: '2026-02-01T00:00:00Z', boundary: false },
  { sha: 'a'.repeat(40), summary: 'docs: first pages', author: 'Ada', authored_at: '2026-01-01T00:00:00Z', boundary: true },
];

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** The site setting naming the wiki, plus everything /wiki reads from it. */
async function mockWiki(
  page: Page,
  wiki: typeof WIKI | null = WIKI,
  files: Record<string, string> = PAGES
): Promise<void> {
  await page.route('**/api/v1/site-settings', (route) => json(route, { internal_wiki: wiki }));
  const base = `**/api/v1/repos/${WIKI.id}`;
  await page.route(`${base}/pages**`, (route) =>
    json(route, {
      ref: 'main',
      sha: 'c'.repeat(40),
      truncated: false,
      pages: Object.keys(files).map((path) => ({ path, size_bytes: files[path].length })),
    })
  );
  await page.route(`${base}/blob**`, (route, request) => {
    const path = new URL(request.url()).searchParams.get('path') ?? '';
    return json(route, { path, ref: 'main', text: files[path] ?? '', is_binary: false, encoding: 'utf8' });
  });
  await page.route(`${base}/blame**`, (route, request) => {
    const path = new URL(request.url()).searchParams.get('path') ?? '';
    const lines = (files[path] ?? '').split('\n').length - 1;
    return json(route, {
      ref: 'main',
      sha: 'c'.repeat(40),
      path,
      line_count: lines,
      hunks: [
        { start_line: 1, line_count: 4, commit: COMMITS[1].sha },
        { start_line: 5, line_count: lines - 4, commit: COMMITS[0].sha },
      ],
      commits: COMMITS,
    });
  });
  await page.route(`${base}/commits**`, (route) =>
    json(route, {
      ref: 'main',
      sha: 'c'.repeat(40),
      commits: [{ sha: COMMITS[0].sha, summary: COMMITS[0].summary, author: 'Bea', committed_at: COMMITS[0].authored_at }],
      page: { limit: 1, page: 1, total: 1, has_more: false },
    })
  );
}

test.describe('Internal wiki', () => {
  test('the left navigation links to the wiki only when one is set @action:wiki.nav', async ({ page }) => {
    await mockBootstrap(page);
    await mockWiki(page, null);
    await page.goto('/settings');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link', { name: 'Repositories' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Wiki' })).toHaveCount(0);

    await page.unroute('**/api/v1/site-settings');
    await mockWiki(page);
    await page.goto('/settings');
    const wiki = nav.getByRole('link', { name: 'Wiki' });
    await expect(wiki).toBeVisible();
    await expect(wiki).toHaveAttribute('title', 'acme/handbook');
    await wiki.click();
    await expect(page).toHaveURL(/\/wiki$/);
    await expect(wiki).toHaveAttribute('aria-current', 'page');
  });

  test('reads pages with change notes and follows wiki links @action:wiki.read', async ({ page }) => {
    await mockBootstrap(page);
    await mockWiki(page);
    await page.goto('/wiki');

    const tree = page.getByRole('complementary', { name: 'Wiki pages' });
    await expect(page.getByRole('heading', { level: 1, name: 'Handbook' })).toBeVisible();
    await expect(tree.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    // The repository's own README is code, not a wiki page.
    await expect(tree.getByRole('link', { name: /readme/i })).toHaveCount(0);
    const note = page.getByRole('complementary', { name: 'Changes to lines 5 to 6' });
    await expect(note.getByRole('link', { name: /docs: conventions/ })).toHaveAttribute(
      'href',
      `/repos/jeryu/acme/handbook/commit/${COMMITS[0].sha}`
    );

    const result = await runAxe(page, { disableRules: ['color-contrast'] });
    await persistAxeResult('wiki-page', result);
    const rendered = await persistRenderedEvidence(page, 'wiki-page');
    expect(rendered.geometry.width).toBeGreaterThan(0);
    expect(blockingViolations(result).map((v) => v.id)).toEqual([]);

    await page.getByRole('link', { name: 'setup' }).click();
    await expect(page).toHaveURL(/\/wiki\/guides\/setup\.md$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Setting up' })).toBeVisible();
    await expect(page.getByText('platform')).toBeVisible();
    // Date and status pill top right, summary in its box, sources listed last.
    const badges = page.getByTestId('wiki-page-badges');
    await expect(badges.getByText('current')).toBeVisible();
    await expect(badges.locator('time')).toHaveAttribute('datetime', '2026-09-30');
    await expect(page.locator('.wiki-doc__summary')).toHaveText('How a new machine gets the tools');
    const sources = page.getByRole('region', { name: 'Sources' });
    await expect(sources.getByRole('link', { name: 'raw/setup-notes.md' })).toHaveAttribute(
      'href',
      '/repos/jeryu/acme/handbook/blob/main/raw/setup-notes.md'
    );
    await expect(sources.getByText('live checks on node-a')).toBeVisible();

    await page.getByRole('button', { name: 'Hide change notes' }).click();
    await expect(page.getByRole('complementary', { name: /Changes to lines/ })).toHaveCount(0);
  });

  test('a repository without a start page or wiki/ is invited to add them @action:wiki.read', async ({ page }) => {
    await mockBootstrap(page);
    await mockWiki(page, WIKI, { 'README.md': '# Code readme\n' });
    await page.goto('/wiki');
    const invite = page.getByTestId('wiki-invite');
    await expect(invite.getByRole('heading', { name: 'Start the wiki' })).toBeVisible();
    await expect(invite).toContainText('mkdir wiki');
    await expect(invite.getByRole('link', { name: 'Open acme/handbook' })).toHaveAttribute(
      'href',
      '/repos/jeryu/acme/handbook'
    );
    await expect(page.getByTestId('wiki-no-folder')).toContainText('No pages in wiki/ yet');
  });

  test('an admin chooses the wiki repository in Settings @action:admin.set_internal_wiki', async ({ page }) => {
    await mockBootstrap(page, { login: 'jeryu-admin', auth: { role: 'admin', csrfToken: 'csrf-admin' } });
    await mockRepoList(page, [{ id: { host: 'jeryu', owner: 'acme', name: 'handbook' }, default_branch: 'main' }]);
    let saved: typeof WIKI | null = null;
    const csrf: string[] = [];
    await page.route('**/api/v1/site-settings', (route) => json(route, { internal_wiki: saved }));
    await page.route('**/api/v1/admin/site-settings', async (route, request) => {
      if (request.method() === 'PUT') {
        csrf.push(request.headers()['x-jeryu-csrf'] ?? '');
        expect(request.postDataJSON()).toEqual({ internal_wiki: 'acme/handbook' });
        saved = WIKI;
      }
      await json(route, {
        internal_wiki: saved,
        internal_wiki_missing: false,
        updated_by: saved ? 'jeryu-admin' : null,
        updated_at: saved ? '2026-10-01T00:00:00Z' : null,
      });
    });

    await page.goto('/settings');
    const panel = page.getByRole('form', { name: 'Internal wiki' });
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link', { name: 'Wiki' })).toHaveCount(0);
    await panel.getByTestId('internal-wiki-select').selectOption('acme/handbook');
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(panel.getByText('Saved')).toBeVisible();
    expect(csrf).toEqual(['csrf-admin']);
    await expect(nav.getByRole('link', { name: 'Wiki' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Open the wiki' })).toHaveAttribute('href', '/wiki');
  });
});
