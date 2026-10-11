// 49-yield.spec.ts — the Yield page on `GET /api/v1/yield` mocked at the
// browser boundary: the headline and its explanation, the controls in the
// request, the todo links, a phone in the dark theme, the System nav entry,
// and what an older server and a non-admin see.

import { expect, test, type Page } from './fixtures/test';

import {
  blockingViolations,
  persistAxeResult,
  persistRenderedEvidence,
  runAxe,
} from './fixtures/accessibility';
import { mockBootstrap } from './fixtures/mocks';
import { mockYieldApi, mockYieldForbidden } from './fixtures/yieldMocks';

const PHONE = { width: 390, height: 844 };

/** Pin the shell theme before the app boots. */
async function useTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  const entry: [string, string] = ['jeryu.preferences.v2', JSON.stringify({ theme })];
  await page.addInitScript(([key, value]) => {
    window.localStorage.setItem(key, value);
  }, entry);
}

/** How far the document can be scrolled sideways; 0 or less is the only pass. */
async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(root.scrollWidth - window.innerWidth, document.body.scrollWidth - window.innerWidth);
  });
}

test.describe('Yield', () => {
  test('leads with cost per merged change and explains it, with no a11y blocker @action:yield.overview', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockYieldApi(page);

    await page.goto('/yield');
    await expect(page.getByTestId('yield-page')).toBeVisible({ timeout: 15_000 });

    const headline = page.getByTestId('yield-kpi-per-merged');
    await expect(headline).toContainText('Cost per merged change');
    await expect(headline).toContainText('$5.00');
    await expect(headline).toContainText('95% range $3.90–$6.10');
    await expect(page.getByTestId('yield-kpi-yield')).toContainText('83%');
    await expect(page.getByTestId('yield-kpi-first-pass')).toContainText('70%');
    await expect(page.getByTestId('yield-kpi-review-share')).toContainText('20%');
    await expect(page.getByTestId('yield-kpi-waste')).toContainText('$12.50');

    await expect(page.getByTestId('yield-funnel-outcome-main')).toContainText('Reached main $150');
    await expect(page.getByTestId('yield-funnel-source-review')).toContainText('Review $40.00');

    // The arm still short of data shows what it spent, not a rate to act on.
    await expect(page.getByTestId('yield-arm-claude-model-a')).toContainText('$5.00');
    await expect(page.getByTestId('yield-arm-codex-model-b')).toContainText('Not enough data yet');

    await expect(
      page.getByRole('img', { name: /^Cost per merged change by week, 2026-09-14 to 2026-10-05/ })
    ).toBeVisible();
    await expect(page.getByTestId('yield-price-sources')).toContainText(
      'Token prices: catalog@0000001.'
    );

    const result = await runAxe(page, { disableRules: ['color-contrast'] });
    await persistAxeResult('yield', result);
    // Every axe receipt is paired with rendered evidence; the ux-qa lane fails
    // closed on a scope that scans but never shows what it scanned.
    const rendered = await persistRenderedEvidence(page, 'yield');
    expect(rendered.geometry.width, 'the Yield page rendered with width').toBeGreaterThan(0);
    expect(rendered.geometry.height, 'the Yield page rendered with height').toBeGreaterThan(0);
    expect(
      blockingViolations(result).map((v) => `${v.impact ?? '?'} ${v.id}`),
      'the Yield page adds no serious or critical violation'
    ).toEqual([]);
  });

  test('the window and the cut go into the request and the address; a todo opens its page @action:yield.controls', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    const log = await mockYieldApi(page);

    await page.goto('/yield');
    await expect(page.getByTestId('yield-kpi-per-merged')).toBeVisible({ timeout: 15_000 });
    expect(log.queries[0]?.get('by')).toBe('model');

    await page.getByRole('group', { name: 'Window' }).getByRole('button', { name: '7 d' }).click();
    await expect(page).toHaveURL(/[?&]days=7\b/);
    await expect.poll(() => log.queries.at(-1)?.get('since')).not.toBe(log.queries[0]?.get('since'));

    const cut = page.getByRole('group', { name: 'Break down by' });
    await cut.getByRole('button', { name: 'Agent' }).click();
    await expect(page).toHaveURL(/[?&]by=agent\b/);
    await expect.poll(() => log.queries.at(-1)?.get('by')).toBe('agent');
    const table = page.getByTestId('yield-breakdown-table');
    await expect(table.getByRole('columnheader', { name: 'Agent' })).toBeVisible();
    await expect(page.getByTestId('yield-group-codex')).toContainText('$70.00');

    const costliest = page.getByTestId('yield-costliest');
    await costliest.getByRole('link', { name: 'Split the billing module' }).click();
    await expect(page).toHaveURL(/\/work\/20261001-120000-aaaaaa$/);
  });

  test('a filter updates the page in place: the reader stays where they scrolled @action:yield.in_place', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockYieldApi(page);
    await page.setViewportSize({ width: 1280, height: 600 });

    await page.goto('/yield');
    const cut = page.getByRole('group', { name: 'Break down by' });
    await expect(cut).toBeVisible({ timeout: 15_000 });
    await cut.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before, 'the breakdown switcher sits below the fold').toBeGreaterThan(0);

    await cut.getByRole('button', { name: 'Agent' }).click();
    await expect(page).toHaveURL(/[?&]by=agent\b/);
    await expect(page.getByTestId('yield-breakdown-table').getByRole('columnheader', { name: 'Agent' })).toBeVisible();
    expect(await page.evaluate(() => window.scrollY), 'switching the cut keeps the scroll position').toBe(before);

    // Scroll a little, keeping the window switch in view, so a reset to the top would show.
    const week = page.getByRole('group', { name: 'Window' }).getByRole('button', { name: '7 d' });
    const weekTop = await week.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((top) => window.scrollTo(0, Math.max(1, Math.floor(top - 100))), weekTop);
    await expect(week).toBeInViewport();
    const atWindow = await page.evaluate(() => window.scrollY);
    expect(atWindow, 'the page is scrolled before the window switch').toBeGreaterThan(0);
    await week.click();
    await expect(page).toHaveURL(/[?&]days=7\b/);
    await expect(page.getByTestId('yield-body')).toHaveAttribute('aria-busy', 'false');
    expect(await page.evaluate(() => window.scrollY), 'switching the window keeps the scroll position').toBe(atWindow);
  });

  test('the report sections keep their spacing inside the report body @action:yield.overview', async ({ page }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockYieldApi(page);
    await page.goto('/yield');
    const body = page.getByTestId('yield-body');
    await expect(body.getByTestId('yield-kpi-per-merged')).toBeVisible({ timeout: 15_000 });
    const gaps = await body.evaluate((el) => {
      const sections = Array.from(el.querySelectorAll(':scope > section'));
      return sections.slice(1).map((section, index) =>
        Math.round(section.getBoundingClientRect().top - sections[index].getBoundingClientRect().bottom)
      );
    });
    expect(gaps.length, 'the body holds several sections').toBeGreaterThan(2);
    for (const gap of gaps) expect(gap, 'sections are spaced apart, not stacked flush').toBeGreaterThanOrEqual(16);
  });

  test('a phone in the dark theme reads the page without sideways scrolling @action:yield.phone_dark', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await useTheme(page, 'dark');
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockYieldApi(page);

    await page.goto('/yield');
    await expect(page.getByTestId('yield-kpi-per-merged')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('yield-scrap')).toBeVisible();
    expect(await sidewaysOverflow(page), 'no sideways scroll at 390px').toBeLessThanOrEqual(0);
    // The trend's axis text is HTML, so it keeps its size instead of shrinking
    // with the drawing on a narrow screen.
    const trend = page.getByTestId('yield-trend');
    await expect(trend.getByText('$10.00', { exact: true })).toBeVisible();
    await expect(trend.getByText('2026-10-05', { exact: true })).toBeVisible();
    const axisPx = await trend
      .locator('.yield-chart__y-label')
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(axisPx, 'axis labels stay legible at 390px').toBeGreaterThanOrEqual(12);

    const result = await runAxe(page, { disableRules: ['color-contrast'] });
    await persistAxeResult('yield-phone-dark', result);
    const rendered = await persistRenderedEvidence(page, 'yield-phone-dark');
    expect(rendered.geometry.width, 'the Yield page rendered on a phone').toBeGreaterThan(0);
    expect(blockingViolations(result).map((v) => `${v.impact ?? '?'} ${v.id}`)).toEqual([]);
  });

  test('reached from the System group by an admin, plain on an older server, refused to others @action:yield.nav', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });

    await page.goto('/repos');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('button', { name: 'System' }).click();
    await nav.getByRole('link', { name: 'Yield', exact: true }).click();
    await expect(page).toHaveURL(/\/yield$/);
    // No yield mock: the shared fallback answers 404, like an older server.
    await expect(page.getByText('Not available on this server version.')).toBeVisible({
      timeout: 15_000,
    });

    // A plain user has no Yield in the nav, and the read itself is refused.
    await mockBootstrap(page, { auth: { role: 'user' } });
    await mockYieldForbidden(page);
    await page.goto('/yield');
    await expect(page.getByText('Only admins can see what the work cost.')).toBeVisible({
      timeout: 15_000,
    });
    const userNav = page.getByRole('navigation', { name: 'Primary' });
    // The group may already be open (remembered, or held open on a System page).
    const system = userNav.getByRole('button', { name: 'System' });
    if ((await system.getAttribute('aria-expanded')) !== 'true') await system.click();
    await expect(userNav.getByRole('link', { name: 'Quality gate', exact: true })).toBeVisible();
    await expect(userNav.getByRole('link', { name: 'Yield', exact: true })).toHaveCount(0);
  });
});
