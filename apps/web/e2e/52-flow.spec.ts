// 52-flow.spec.ts — the Flow page's Live mode on `GET /api/v1/flow` mocked at
// the browser boundary: the stations and the bottleneck, the rework loops, a
// station's lots and the trace behind one, the window and station in the
// address, the strip above the Activity feed, a phone in the dark theme, the
// nav entry and chord, and what an older server and a non-admin see.

import { expect, test, type Page } from './fixtures/test';

import {
  blockingViolations,
  persistAxeResult,
  persistRenderedEvidence,
  runAxe,
} from './fixtures/accessibility';
import { mockBootstrap } from './fixtures/mocks';
import { mockFlowApi, mockFlowForbidden } from './fixtures/flowMocks';
import { mockPipelineApi } from './fixtures/pipelineMocks';

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

test.describe('Flow', () => {
  test('lays the line out, names the bottleneck and draws the rework loops @action:flow.live', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockFlowApi(page);

    await page.goto('/flow');
    await expect(page.getByTestId('flow-page')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('flow-bottleneck-badge')).toContainText(
      'Gate holds the most waiting'
    );
    // The strip is the whole line in one row, with the line's own numbers.
    await expect(page.getByTestId('flow-line-strip-cycle')).toContainText('1.0 d');
    await expect(page.getByTestId('flow-line-strip-x-factor')).toContainText('4.2×');
    await expect(page.getByTestId('flow-line-strip-wip')).toContainText('13');

    const stations = await page
      .getByTestId('flow-stations')
      .locator('.flow-card__label')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent));
    expect(stations).toEqual([
      'Queue',
      'Work',
      'Shift',
      'Review',
      'Gate',
      'Merge',
      'Pin',
      'Stage',
      'Deploy',
    ]);
    const gate = page.getByTestId('flow-card-gate');
    await expect(gate).toContainText('3 waiting');
    await expect(gate).toContainText('Queue 15m · work 6m 40s');
    await expect(gate).toHaveClass(/flow-card--bottleneck/);
    // Unknown stays unknown: nothing has been pinned, so Pin has no numbers.
    await expect(page.getByTestId('flow-card-pin')).toContainText(
      'nothing has reached this station yet'
    );
    // The loops back along the line, as arcs and in the same words.
    await expect(page.getByTestId('flow-rework-gate-work')).toContainText('9');
    await expect(page.getByTestId('flow-rework-list')).toContainText(
      '9 lots sent back from Gate to Work (19% of what left)'
    );

    const result = await runAxe(page, { disableRules: ['color-contrast'] });
    await persistAxeResult('flow-live', result);
    const rendered = await persistRenderedEvidence(page, 'flow-live');
    expect(rendered.geometry.width, 'the Flow page rendered with width').toBeGreaterThan(0);
    expect(blockingViolations(result).map((v) => `${v.impact ?? '?'} ${v.id}`)).toEqual([]);
  });

  test('a station lists its lots oldest first, and a lot opens its own page @action:flow.station_lots', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    const log = await mockFlowApi(page);

    await page.goto('/flow?days=7');
    await expect(page.getByTestId('flow-body')).toBeVisible({ timeout: 15_000 });
    expect(log.queries[0]?.get('days')).toBe('7');

    await page.getByTestId('flow-card-gate').click();
    await expect(page).toHaveURL(/[?&]station=gate\b/);
    const lots = page.getByTestId('flow-lots');
    await expect(lots).toContainText('At Gate, oldest first');
    const ids = await lots.locator('.flow-lots__link').evaluateAll((nodes) =>
      nodes.map((node) => node.textContent)
    );
    expect(ids).toEqual(['acme-0001', 'acme/widgets#42', 'acme-0002']);
    // A partial estimate says which station it does not cover.
    await expect(lots).toContainText('not counting pin');

    // A held lot has no estimate: its next step is a person.
    await page.getByTestId('flow-card-review').click();
    await expect(page.getByTestId('flow-lots')).toContainText('held — a person is the next step');

    // The window stays a filter: the station picked stays picked.
    await page.getByRole('group', { name: 'Window' }).getByRole('button', { name: '90 d' }).click();
    await expect(page).toHaveURL(/[?&]days=90\b/);
    await expect(page).toHaveURL(/[?&]station=review\b/);
    await expect.poll(() => log.queries.at(-1)?.get('days')).toBe('90');

    // The lot opens the work itself, which is where its trace is.
    await page.getByTestId('flow-card-gate').click();
    await page.getByTestId('flow-lot-acme-0001').click();
    await expect(page).toHaveURL(/\/work\/acme-0001$/);
  });

  test('the same strip heads Activity and opens a station on Flow @action:flow.activity_strip', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    await mockFlowApi(page);

    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 15_000 });
    const strip = page.getByTestId('flow-line-strip');
    await expect(strip).toContainText('Gate holds the most waiting');
    // Where the work is, above when it happened.
    const order = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('[data-testid]')).map((node) =>
        node.getAttribute('data-testid')
      );
      return [ids.indexOf('flow-line-strip'), ids.indexOf('activity-volume')];
    });
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order[0]).toBeLessThan(order[1]);

    await strip.getByTestId('flow-line-strip-station-gate').click();
    await expect(page).toHaveURL(/\/flow\?station=gate/);
    await expect(page.getByTestId('flow-lots')).toContainText('At Gate, oldest first');

    // The wall is the feed itself: no strip on it.
    await page.goto('/activity?wall=1');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('flow-line-strip')).toHaveCount(0);

    const rendered = await persistRenderedEvidence(page, 'flow-activity-strip');
    expect(rendered.geometry.width, 'Activity rendered with the strip above it').toBeGreaterThan(0);
  });

  test('phone dark mode stacks the line with no sideways scroll @action:flow.phone_dark', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await useTheme(page, 'dark');
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockFlowApi(page);

    await page.goto('/flow?station=gate');
    await expect(page.getByTestId('flow-page')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await sidewaysOverflow(page), 'no sideways scroll at 390px').toBeLessThanOrEqual(0);
    // The cards become a vertical list, and every label is still HTML text.
    const labels = page.getByTestId('flow-stations').locator('.flow-card__label');
    await expect(labels.first()).toBeVisible();
    const labelPx = await labels.first().evaluate((el) => el.getBoundingClientRect().height);
    expect(labelPx, 'station labels stay legible at 390px').toBeGreaterThanOrEqual(12);
    const columns = await page
      .getByTestId('flow-stations')
      .locator('.flow-line__cards')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns, 'one station per row on a phone').toBe(1);
    await expect(page.getByTestId('flow-lots')).toContainText('At Gate, oldest first');

    const result = await runAxe(page, { disableRules: ['color-contrast'] });
    await persistAxeResult('flow-phone-dark', result);
    const rendered = await persistRenderedEvidence(page, 'flow-phone-dark');
    expect(rendered.geometry.width, 'the Flow page rendered on a phone').toBeGreaterThan(0);
    expect(blockingViolations(result).map((v) => `${v.impact ?? '?'} ${v.id}`)).toEqual([]);
  });

  test('nav and g f reach Flow for admins, while other roles are refused @action:flow.nav', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });

    await page.goto('/repos');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('link', { name: 'Flow', exact: true }).click();
    await expect(page).toHaveURL(/\/flow$/);
    await expect(page.getByText('Not available on this server version.')).toBeVisible({
      timeout: 15_000,
    });

    await mockFlowApi(page);
    await page.keyboard.press('g');
    await page.keyboard.press('f');
    await expect(page).toHaveURL(/\/flow$/);
    await expect(page.getByTestId('flow-page')).toBeVisible({ timeout: 15_000 });

    await mockBootstrap(page, { auth: { role: 'user' } });
    await mockFlowForbidden(page);
    await page.goto('/flow');
    await expect(page.getByText('Only admins can see the delivery line.')).toBeVisible({
      timeout: 15_000,
    });
    const userNav = page.getByRole('navigation', { name: 'Primary' });
    await expect(userNav.getByRole('link', { name: 'Flow', exact: true })).toHaveCount(0);
  });
});
