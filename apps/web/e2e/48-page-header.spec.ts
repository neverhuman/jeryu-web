// 48-page-header.spec.ts — the shared page header on every route.
//
// "Where am I" used to be answered three ways (breadcrumbs on the repository
// pages, one-off back links, the header repo chip) and freshness on two pages
// only. Every route now wears one PageHeader: its single <h1> inside
// `[data-page-header]`, a detail page's breadcrumb starting at its nav parent,
// and a freshness stamp that moves when the page is read again.

import { expect, test, type Page } from './fixtures/test';

import { mockBootstrap, mockRepoList } from './fixtures/mocks';
import { mockPipelineApi } from './fixtures/pipelineMocks';
import { FLAGGED_SHA, mockQualityGateApi } from './fixtures/qualityGateMocks';
import { mockShiftApi } from './fixtures/shiftMocks';

/** Every top-level route the mocks below cover, by the nav that reaches it. */
const TOP_LEVEL = [
  '/needs-you',
  '/activity',
  '/search',
  '/repos',
  '/work',
  '/quality-gate',
  '/settings',
  '/nowhere-at-all',
];

/** The page's one heading, and the header it has to sit in. */
async function assertOneHeading(page: Page, path: string): Promise<void> {
  const header = page.locator('[data-page-header]');
  await expect(header, `${path} renders one page header`).toHaveCount(1);
  await expect(page.locator('h1'), `${path} renders one h1`).toHaveCount(1);
  await expect(
    header.locator('h1'),
    `${path} keeps its h1 inside the page header`
  ).toHaveCount(1);
}

test.describe('Page header', () => {
  test('every top-level route has one h1, inside the page header @action:page_header.one_h1', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    await mockQualityGateApi(page);
    await mockShiftApi(page);
    await mockRepoList(page, []);

    for (const path of TOP_LEVEL) {
      await page.goto(path);
      await assertOneHeading(page, path);
    }
  });

  test('a detail route’s breadcrumb starts at its nav parent @action:page_header.breadcrumb', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockQualityGateApi(page);
    await mockShiftApi(page);
    await mockRepoList(page, []);

    // One rule of the quality gate: the gate is its nav parent.
    await page.goto('/quality-gate/rules/stale-naming');
    await assertOneHeading(page, '/quality-gate/rules/stale-naming');
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link').first()).toHaveAttribute('href', '/quality-gate');
    await expect(crumbs.getByRole('link').first()).toHaveText('Quality gate');

    // One scored head, two levels down: the first link is still the nav entry.
    await page.goto(`/quality-gate/heads/jeryu/jeryu-web/${FLAGGED_SHA}`);
    await expect(crumbs.getByRole('link').first()).toHaveAttribute('href', '/quality-gate');

    // One todo: its parent is Work, and the family it is in links to the queue.
    await page.goto('/work/20260919-0800-aaa');
    await assertOneHeading(page, '/work/20260919-0800-aaa');
    await expect(crumbs.getByRole('link').first()).toHaveText('Work');
    await expect(crumbs.getByRole('link').first()).toHaveAttribute('href', '/work');

    // A nav destination is where the trail starts, so it carries none itself.
    await page.goto('/quality-gate');
    await expect(crumbs).toHaveCount(0);
  });

  test('the freshness stamp moves when the page is read again @action:page_header.freshness', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockQualityGateApi(page);

    await page.goto('/quality-gate');
    const stamp = page.getByTestId('page-freshness');
    await expect(stamp).toContainText('Updated', { timeout: 15_000 });
    const first = await stamp.getAttribute('data-updated-at');
    expect(first, 'the stamp carries the instant the read landed').toBeTruthy();

    // Past the stamp's one-second resolution, so a new read is a new instant.
    await page.waitForTimeout(1_200);
    await page.getByTestId('page-refresh').click();
    await expect
      .poll(() => stamp.getAttribute('data-updated-at'), { timeout: 15_000 })
      .not.toBe(first);
  });
});
