// 44-page-titles-scroll.spec.ts — what a tab says, and where a page starts.
//
// Every page used to be called "JeRyu" and every navigation landed wherever
// the last one had been scrolled to. Each page names itself now, a push starts
// at the top, and Back puts the position the reader left back.

import { expect, test } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import { mockBootstrap, mockRepoList } from './fixtures/mocks';
import { mockPipelineApi, pipelineEvents } from './fixtures/pipelineMocks';

/** The feed, long enough that the document scrolls well past one screen. */
function longFeed(): Array<Record<string, unknown>> {
  const base = pipelineEvents();
  return Array.from({ length: 120 }, (_, index) => ({
    ...base[index % base.length],
    seq: 1000 - index,
  }));
}

const scrollY = (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(() => window.scrollY);

test.describe('Page titles and scroll position', () => {
  test('each page names itself in the tab', async ({ page }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    await mockRepoList(page, []);
    const shell = new AppShellPage(page);

    await page.goto('/needs-you');
    await shell.assertShellLoaded(15_000);
    await expect(page).toHaveTitle('Needs you · JeRyu');

    await page.goto('/activity');
    await expect(page).toHaveTitle('Activity · JeRyu');

    await page.goto('/repos');
    await expect(page).toHaveTitle('Repositories · JeRyu');
  });

  test('a push starts at the top and Back restores where the reader was', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page, { events: longFeed() });
    await mockRepoList(page, []);
    const shell = new AppShellPage(page);

    await page.goto('/activity');
    await shell.assertShellLoaded(15_000);
    await expect(page.getByTestId('activity-event-1000')).toBeVisible({ timeout: 15_000 });

    // Read a way down the feed.
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect.poll(() => scrollY(page)).toBeGreaterThan(600);
    const left = await scrollY(page);

    // Another page, reached in-app: it opens at its top, not mid-feed.
    await page.getByRole('link', { name: 'Repositories' }).first().click();
    await expect(page).toHaveURL(/\/repos$/);
    await expect(page).toHaveTitle('Repositories · JeRyu');
    await expect.poll(() => scrollY(page)).toBe(0);

    // Back: the feed is where it was left.
    await page.goBack();
    await expect(page).toHaveTitle('Activity · JeRyu');
    await expect
      .poll(() => scrollY(page), { timeout: 10_000 })
      .toBeGreaterThan(left - 100);
  });
});
