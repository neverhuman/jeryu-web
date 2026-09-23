// 37-scrollbar.spec.ts — one vertical scrollbar per page, owned by the
// document.
//
// The shell used to scroll inside `.app-shell__main`, which put an inner
// scrollbar beside the document's own. The document scrolls now, and its
// scrollbar is always drawn (`html { overflow-y: scroll }`) so the content
// keeps its width between a short page and a long one.

import { expect, test } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';

import {
  mockBlob,
  mockBootstrap,
  mockRefs,
  mockReadme,
  mockRepoList,
  mockRepoLookup,
  mockTree,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

/**
 * How the document scrolls, how wide its content is, and every element inside
 * it that scrolls vertically on its own.
 */
async function scrollMetrics(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const scrollers = Array.from(document.querySelectorAll('body *')).filter((el) => {
      const style = getComputedStyle(el);
      const scrolls = style.overflowY === 'auto' || style.overflowY === 'scroll';
      return scrolls && el.scrollHeight > el.clientHeight;
    });
    return {
      documentOverflowY: getComputedStyle(document.documentElement).overflowY,
      contentWidth: document.documentElement.clientWidth,
      documentScrolls:
        document.documentElement.scrollHeight > document.documentElement.clientHeight,
      innerScrollers: scrollers.map((el) => el.className || el.tagName),
    };
  });
}

test.describe('Page scrolling', () => {
  test('one document scrollbar on a short page and a long one, at the same content width @action:shell.single_scrollbar', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockRepoList(page, []);
    const shell = new AppShellPage(page);

    // 1. A short page: nothing to scroll, but the gutter is still reserved.
    await page.goto('/repos');
    await shell.assertShellLoaded(15_000);
    const short = await scrollMetrics(page);
    expect(
      short.documentOverflowY,
      'the document scrollbar must stay drawn on a short page'
    ).toBe('scroll');
    expect(short.documentScrolls).toBe(false);
    expect(short.innerScrollers).toEqual([]);

    // 2. A long file: the document scrolls, and nothing inside it does.
    const lines = Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join('\n');
    await mockRepoLookup(page, {
      id: { host: 'jeryu', owner: 'neverhuman', name: 'jeryu' },
      default_branch: 'main',
    });
    await mockRefs(page);
    await mockReadme(page, { html: '<h1>Portal</h1>' });
    await mockTree(page, [{ path: 'long.txt', kind: 'file' }]);
    await mockBlob(page, { path: 'long.txt', text: lines, mime: 'text/plain' });

    await page.goto('/repos/jeryu/neverhuman/jeryu/blob/main/long.txt');
    await shell.assertShellLoaded(15_000);
    await expect.poll(async () => (await scrollMetrics(page)).documentScrolls).toBe(true);
    const long = await scrollMetrics(page);
    expect(long.documentOverflowY).toBe('scroll');
    expect(long.contentWidth, 'content must not shift between short and long pages').toBe(
      short.contentWidth
    );
    expect(long.innerScrollers).toEqual([]);
  });
});
