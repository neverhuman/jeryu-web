// 52-flow.spec.ts — the Flow page on `GET /api/v1/flow` mocked at the browser
// boundary: one number per station with the bottleneck marked, the picked
// station's work in progress newest first and paged from the server, the stale
// part (no live worker, or older than 14 days) folded away and named by kind,
// the Work claims, the station in the address and Back, the strip above the
// Activity feed, a phone in the dark theme, the nav entry and chord, and what
// an older server and a non-admin see.

import { expect, test, type Page } from './fixtures/test';

import {
  blockingViolations,
  persistAxeResult,
  persistRenderedEvidence,
  runAxe,
} from './fixtures/accessibility';
import { mockBootstrap, mockRepoList } from './fixtures/mocks';
import { ago, lot, mockFlowApi, mockFlowForbidden } from './fixtures/flowMocks';
import { mockPullRoom } from './fixtures/pullRoomMocks';
import {
  FOUR_CHANNELS,
  mockReleaseChannels,
  mockShiftTodos,
  snapshotWithReleaseHistory,
} from './fixtures/releaseChannelMocks';
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
  test('one number per station, the bottleneck marked and opened by default @action:flow.live', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockFlowApi(page);

    await page.goto('/flow');
    await expect(page.getByTestId('flow-page')).toBeVisible({ timeout: 15_000 });
    const strip = page.getByTestId('flow-strip');
    await expect(strip.getByRole('link')).toHaveCount(9);
    await expect(page.getByTestId('flow-strip-station-gate')).toContainText('6');
    await expect(page.getByTestId('flow-strip-station-gate')).toContainText('Bottleneck');
    await expect(page.getByTestId('flow-strip-station-gate')).toHaveAttribute('aria-current', 'true');
    // Nothing has reached Pin: no number, never a zero.
    await expect(page.getByTestId('flow-strip-station-pin')).toContainText('—');
    // The line's count, over every family the forge hosts.
    await expect(page.getByTestId('flow-coverage')).toHaveText('15 in progress across 2 families');
    await expect(page.getByTestId('flow-station')).toContainText('Gate · 6 in progress');
    await expect(page.getByTestId('flow-station-paging')).toHaveText('5 listed, newest first');
    // The removed views stay removed.
    await expect(page.getByText('Configuration and evidence not available')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Window' })).toHaveCount(0);

    const result = await runAxe(page, { disableRules: ['color-contrast'] });
    await persistAxeResult('flow-live', result);
    const rendered = await persistRenderedEvidence(page, 'flow-live');
    expect(rendered.geometry.width, 'the Flow page rendered with width').toBeGreaterThan(0);
    expect(blockingViolations(result).map((v) => `${v.impact ?? '?'} ${v.id}`)).toEqual([]);
  });

  test('a station lists its work newest first, folds the stale part, and keeps the pick in the address @action:flow.station_lots', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    const log = await mockFlowApi(page);

    await page.goto('/flow?days=7&mode=layout');
    await expect(page.getByTestId('flow-body')).toBeVisible({ timeout: 15_000 });
    const current = page.getByTestId('flow-current');
    await expect(current.locator('.flow-items__id').first()).toHaveText('acme-0002');
    const ids = await current.locator('.flow-items__id').evaluateAll((nodes) => nodes.map((node) => node.textContent));
    expect(ids).toEqual(['acme-0002', 'acme/widgets#42', 'acme-0001']);
    // The picked station is its own read, newest first.
    const gate = log.queries.find((query) => query.get('station') === 'gate');
    expect(gate?.get('lots_order')).toBe('newest');
    expect(gate?.get('lots_limit')).toBe('50');
    // The two old items are one line until it is opened.
    await expect(page.getByTestId('flow-stale')).toHaveCount(0);
    const toggle = page.getByTestId('flow-stale-toggle');
    await expect(toggle).toHaveText('2 stale · 2 older than 14 days');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const stale = await page.getByTestId('flow-stale').locator('.flow-items__id').evaluateAll((nodes) => nodes.map((node) => node.textContent));
    expect(stale).toEqual(['acme-0008', 'acme-0009']);

    // Picking a station is a new address; Back returns to the one before.
    await page.getByTestId('flow-strip-station-review').click();
    await expect(page).toHaveURL(/[?&]station=review\b/);
    await expect(page).not.toHaveURL(/days=|mode=/);
    const held = page.getByTestId('flow-item-acme/widgets#43');
    await expect(held).toContainText('review held it');
    await expect(held).toContainText('nobody acting');
    await expect(held.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/acme/widgets/pull/43#changes-requested');
    await expect(page.getByTestId('flow-item-acme-0003')).toContainText('no reason recorded');
    await page.goBack();
    await expect(page.getByTestId('flow-station')).toHaveAttribute('data-station', 'gate');

    // The keys walk the rows, and Enter opens the work.
    await page.getByTestId('flow-strip-station-gate').click();
    const first = current.locator('[data-list-row]').first();
    await expect(first).toContainText('acme-0002');
    await page.keyboard.press('j');
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/work\/acme-0002$/);
  });

  test('Work reads its claims against the heartbeats and folds the ones no live worker backs @action:flow.station_lots', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockFlowApi(page);

    await page.goto('/flow?station=work');
    await expect(page.getByTestId('flow-station')).toHaveAttribute('data-station', 'work', { timeout: 15_000 });
    await expect(page.getByTestId('flow-station-claims')).toHaveText(
      'Claims: 1 with a live worker · 2 with no live worker · 1 not reported'
    );
    const ids = await page.getByTestId('flow-current').locator('.flow-items__id').evaluateAll((nodes) => nodes.map((node) => node.textContent));
    expect(ids).toEqual(['acme-0010']);
    const toggle = page.getByTestId('flow-stale-toggle');
    await expect(toggle).toHaveText('3 stale · 2 with no live worker · 1 older than 14 days');
    await toggle.click();
    await expect(page.getByTestId('flow-item-acme-0011')).toContainText('no live worker');
    await expect(page.getByTestId('flow-item-acme-0013')).not.toContainText('no live worker');

    const result = await runAxe(page, { disableRules: ['color-contrast'] });
    await persistAxeResult('flow-work-claims', result);
    const rendered = await persistRenderedEvidence(page, 'flow-work-claims');
    expect(rendered.geometry.width, 'the Work station rendered with its claims').toBeGreaterThan(0);
    expect(blockingViolations(result).map((v) => `${v.impact ?? '?'} ${v.id}`)).toEqual([]);
  });

  test('a long station shows 50 and asks the server for the next page on Show more @action:flow.station_lots', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    const shift = Array.from({ length: 55 }, (_, n) =>
      lot(`acme-s${String(n).padStart(3, '0')}`, 'shift', 'waiting', { since: ago((n + 1) * 60_000) })
    );
    const log = await mockFlowApi(page, shift, { shift: { wip: { waiting: 55, active: 0, held: 0 } } });

    await page.goto('/flow?station=shift');
    const current = page.getByTestId('flow-current');
    await expect(current.locator('[data-list-row]')).toHaveCount(50, { timeout: 15_000 });
    await expect(current.locator('.flow-items__id').first()).toHaveText('acme-s000');
    await expect(page.getByTestId('flow-station')).toContainText('Shift · 55 in progress');
    await page.getByTestId('flow-station-more').click();
    await expect(current.locator('[data-list-row]')).toHaveCount(55);
    await expect(current.locator('.flow-items__id').last()).toHaveText('acme-s054');
    await expect(page.getByTestId('flow-station-more')).toHaveCount(0);
    await expect(page.getByTestId('flow-station-paging')).toHaveText('55 listed, newest first');
    // Pages by offset, nothing else (the dev server may read a page twice).
    const offsets = log.queries.filter((query) => query.get('station') === 'shift').map((query) => query.get('lots_offset'));
    expect([...new Set(offsets)]).toEqual(['0', '50']);
  });

  test('the line strip is Flow\'s: Activity and a repository tab do not repeat it @action:flow.activity_strip', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    await mockFlowApi(page);

    await mockRepoList(page, [{
      id: { host: 'jeryu', owner: 'acme', name: 'widgets' },
      default_branch: 'main', visibility: 'private', family: 'acme',
    }]);
    for (const route of ['/activity', '/repos/jeryu/acme/widgets/activity', '/activity?wall=1']) {
      await page.goto(route);
      await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('flow-line-strip')).toHaveCount(0);
    }
  });

  test('Activity links each event to its station on Flow @action:flow.activity_links', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    await mockFlowApi(page);

    await page.goto('/activity');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 15_000 });
    const merged = page.getByRole('link', { name: 'Merge on Flow' }).first();
    await expect(merged).toHaveAttribute('href', '/flow?station=merge');
    await merged.click();
    await expect(page).toHaveURL(/\/flow\?station=merge$/);
    await expect(page.getByTestId('flow-page')).toBeVisible();
  });

  test('the In flight timeline shows each open pull request its ETA @action:flow.eta', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPullRoom(page, snapshotWithReleaseHistory());
    await mockShiftTodos(page, []);
    await mockReleaseChannels(page, [FOUR_CHANNELS]);
    await mockFlowApi(page, [
      lot('alice/jeryu#8', 'gate', 'waiting', { href: '/alice/jeryu/pull/8', slowest_ahead: 'deploy' }),
    ]);

    await page.goto('/pull-room');
    const eta = page.getByTestId('pull-eta-alice/jeryu-8');
    await expect(eta).toBeVisible({ timeout: 15_000 });
    await expect(eta).toContainText('ETA 30m (p90 bound 1h 30m)');
    await expect(eta).toContainText('slowest ahead: Deploy');
    await expect(eta.getByRole('link', { name: 'Gate' })).toHaveAttribute('href', '/flow?station=gate');
    // A pull request the line has no estimate for shows none.
    await expect(page.getByTestId('pull-timeline-alice/jeryu-7')).toBeVisible();
    await expect(page.getByTestId('pull-eta-alice/jeryu-7')).toHaveCount(0);
    const rendered = await persistRenderedEvidence(page, 'flow-eta-in-flight');
    expect(rendered.geometry.width, 'the In flight timeline rendered with ETAs').toBeGreaterThan(0);
  });

  test('phone dark mode wraps the strip with no sideways scroll @action:flow.phone_dark', async ({
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
    // The strip wraps three to a row, and every label is still HTML text.
    const labels = page.getByTestId('flow-strip').locator('.flow-strip__label');
    await expect(labels.first()).toBeVisible();
    const labelPx = await labels.first().evaluate((el) => el.getBoundingClientRect().height);
    expect(labelPx, 'station labels stay legible at 390px').toBeGreaterThanOrEqual(12);
    const columns = await page.locator('.flow-strip__stations').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns, 'three stations per row on a phone').toBe(3);
    await expect(page.getByTestId('flow-station')).toContainText('Gate · 6 in progress');

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

