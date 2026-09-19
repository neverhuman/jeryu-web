// 04-code.spec.ts — reading code on the one repository page (W-T-12).
//
// The repository front page and the file page are one layout: the README or
// the open file on the left, a Files panel on the right that stays put. `/code`
// redirects to the front page with the panel open.

import { expect, test } from '@playwright/test';

import {
  mockBlob,
  mockBootstrap,
  mockRefs,
  mockReadme,
  mockRepoLookup,
  mockTree,
  mockTreeByPath,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

test.describe('Code browser (W-T-12)', () => {
  test('/code lands on the front page with the Files panel open; branch selector and file finder work @action:code.branch_selector @action:code.file_tree @action:code.file_search', async ({ page }) => {
    await mockBootstrap(page);
    await mockRepoLookup(page, {
      id: { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' },
      default_branch: 'main',
    });
    await mockRefs(page);
    await mockReadme(page, { html: '<h1>Portal</h1>' });
    await mockTree(page, [
      { path: 'README.md', kind: 'file' },
      { path: 'src', kind: 'directory' },
    ]);
    await mockBlob(page);

    await page.goto('/repos/jeryu/neverhuman/jeryu/code');
    await expect(page).toHaveURL(/\/repos\/jeryu\/neverhuman\/jeryu$/);
    await expect(page.getByTestId('repo-overview-page')).toBeVisible({ timeout: 15_000 });

    const files = page.getByRole('complementary', { name: 'Files' });
    await expect(files).toBeVisible();
    await expect(files.getByRole('treeitem', { name: 'README.md' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Files', exact: true })).toHaveAttribute('aria-expanded', 'true');
    // The panel is the code browser: there is no separate "Browse code" page to go to.
    await expect(page.getByRole('link', { name: 'Browse code' })).toHaveCount(0);

    await page.getByRole('button', { name: /Switch branches\/tags: main/i }).click();
    await page.getByRole('combobox', { name: 'Switch branches/tags' }).fill('develop');
    await page.getByRole('option', { name: /develop/ }).click();
    await expect(page.getByRole('button', { name: /Switch branches\/tags: develop/i })).toBeVisible();
    await expect(page).toHaveURL(/\?ref=develop$/);

    await page.getByRole('button', { name: /Find files/i }).click();
    await page.getByRole('combobox', { name: 'Find files' }).fill('README');
    await page.getByRole('option', { name: 'README.md' }).click();
    await expect(page).toHaveURL(/\/blob\/develop\/README\.md$/);
    await expect(page.getByRole('link', { name: 'View raw file' })).toBeVisible();
  });

  test('the Files panel stays while files open, highlights the file, hides on request and remembers it @action:code.files_panel', async ({ page }) => {
    await mockBootstrap(page);
    await mockRepoLookup(page, {
      id: { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' },
      default_branch: 'main',
    });
    await mockRefs(page);
    await mockReadme(page, { html: '<h1>Portal</h1>' });
    await mockTreeByPath(page, {
      '': [
        { path: 'src', kind: 'directory' },
        { path: 'README.md', kind: 'file' },
      ],
      src: [
        { path: 'src/web', kind: 'directory' },
        { path: 'src/lib.rs', kind: 'file' },
      ],
      'src/web': [{ path: 'src/web/pipeline.rs', kind: 'file' }],
    });
    await mockBlob(page, { text: 'pub fn nested() {}', html: '', mime: 'text/plain' });

    await page.goto('/repos/jeryu/neverhuman/jeryu');
    const files = page.getByRole('complementary', { name: 'Files' });
    await expect(files).toBeVisible({ timeout: 15_000 });

    // Open a nested file from the panel.
    await files.getByRole('treeitem', { name: 'src', exact: true }).click();
    await files.getByRole('treeitem', { name: 'web', exact: true }).click();
    await files.getByRole('treeitem', { name: 'pipeline.rs' }).click();
    await expect(page).toHaveURL(/\/blob\/main\/src\/web\/pipeline\.rs$/);
    await expect(page.getByTestId('repo-file-page')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Source of src/web/pipeline.rs' })).toContainText('pub fn nested() {}');

    // The panel did not go away: same folders open, the file highlighted.
    await expect(files).toBeVisible();
    await expect(files.getByRole('treeitem', { name: 'src', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expect(files.getByRole('treeitem', { name: 'web', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expect(files.getByRole('treeitem', { name: 'pipeline.rs' })).toHaveAttribute('aria-selected', 'true');

    // Another file, still there; back to the front page, nothing highlighted.
    await files.getByRole('treeitem', { name: 'lib.rs' }).click();
    await expect(page).toHaveURL(/\/blob\/main\/src\/lib\.rs$/);
    await expect(files.getByRole('treeitem', { name: 'lib.rs' })).toHaveAttribute('aria-selected', 'true');
    await page.locator('nav[aria-label="Breadcrumb"] a[href$="/neverhuman/jeryu"]').click();
    await expect(page.getByTestId('repo-overview-page')).toBeVisible();
    await expect(files.getByRole('treeitem', { name: 'web', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expect(files.locator('[aria-selected="true"]')).toHaveCount(0);

    // Hide, show, hide; the choice survives a reload.
    const toggle = page.getByRole('button', { name: 'Files', exact: true });
    await toggle.click();
    await expect(files).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(files).toBeVisible();
    await toggle.click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Files', exact: true })).toHaveAttribute('aria-expanded', 'false', { timeout: 15_000 });
    await expect(page.getByRole('complementary', { name: 'Files' })).toBeHidden();
  });

  test('blob page exposes rendered/raw tabs and file toolbar actions @action:code.blob_tabs @action:code.blob_raw_link @action:code.blob_download @action:code.blob_permalink', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (value: string) => {
            (
              window as unknown as { __copiedPermalink?: string }
            ).__copiedPermalink = value;
          },
        },
        configurable: true,
      });
    });
    await mockBootstrap(page);
    await mockRepoLookup(page, {
      id: { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' },
      default_branch: 'main',
    });
    await mockBlob(page, {
      path: 'README.md',
      text: '# Blob toolbar proof.',
      html: '<h1>Blob toolbar proof.</h1>',
      sha: '1234567890abcdef1234567890abcdef12345678',
    });

    await page.goto('/repos/jeryu/neverhuman/jeryu/blob/main/README.md');

    await expect(page.getByText('Blob toolbar proof.')).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('tab', { name: 'Raw' }).click();
    await expect(page.getByRole('tab', { name: 'Raw' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    // The source renders in the page itself: numbered lines, no editor to load
    // (the old one came from a CDN that the site's own CSP refused).
    const source = page.getByRole('table', { name: 'Source of README.md' });
    await expect(source).toContainText('# Blob toolbar proof.');
    await expect(source.getByRole('link', { name: 'Line 1' })).toHaveAttribute('href', '#L1');
    await expect(page.getByText(/Loading editor/)).toHaveCount(0);

    const raw = page.getByRole('link', { name: 'View raw file' });
    await expect(raw).toHaveAttribute('href', /\/api\/v1\/repos\/.*\/raw\?/);
    await expect(
      page.getByRole('link', { name: 'Download file' })
    ).toHaveAttribute('download', 'README.md');

    await page.getByRole('button', { name: 'Copy permalink' }).click();
    await expect(
      page.getByRole('button', { name: 'Copy permalink' })
    ).toContainText('Copied');
    const copied = await page.evaluate(
      () =>
        (window as unknown as { __copiedPermalink?: string })
          .__copiedPermalink
    );
    expect(copied).toContain('1234567890abcdef1234567890abcdef12345678');
    expect(copied).toContain('README.md');
  });

  test('deep file path returns 200 (SPA fallback) @bff', async ({ request }) => {
    // The exact deep-link that broke before the W-spa-fix landing — must
    // continue to return 200 with the SPA HTML body so React Router can
    // resolve the route in the browser.
    const res = await request.get(
      '/repos/jeryu/neverhuman/jeryu/blob/main/src/main.tsx',
      {
        failOnStatusCode: false,
        headers: { Accept: 'text/html' },
      }
    );
    expect(
      res.status(),
      'deep SPA route must be served by the SPA fallback (200)'
    ).toBe(200);
    const body = await res.text();
    expect(body.toLowerCase()).toContain('<!doctype html');
  });
});
