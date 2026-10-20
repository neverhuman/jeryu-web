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
import { mockBootstrap, mockRepoList } from './fixtures/mocks';
import { lot, mockFlowApi, mockFlowForbidden } from './fixtures/flowMocks';
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
  test('lays the line out, names the bottleneck and draws the rework loops @action:flow.live', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockFlowApi(page);

    await page.goto('/flow');
    await expect(page.getByTestId('flow-page')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('flow-card-gate')).toContainText('3 waiting');
    // The contributing repository and the integration repository each have
    // their own decision: the pin opens a second pull request.
    await expect(page.getByText('◇ Current revision satisfies configured merge requirements?')).toHaveCount(2);
    await expect(page.getByText('Yes → ⏸ awaiting activation authorization')).toBeVisible();
    await expect(page.getByTestId('flow-line-strip')).toContainText('Gate holds the most waiting');
    for (const id of ['pin', 'stage', 'deploy']) await expect(page.getByTestId(`flow-card-${id}`)).toBeVisible();
    // The default view is the family's product journey: every configured
    // repository, including one with no current work, converging on the chain
    // the configuration records.
    await expect(page.getByTestId('flow-family-acme')).toContainText('3 configured repositories');
    await expect(page.getByTestId('flow-repo-acme/widgets-core')).toContainText('configured · no current work');
    await expect(page.getByTestId('flow-converge-acme')).toContainText('converge in acme/widgets-deploy');
    await expect(page.getByTestId('flow-card-consumer-gate')).toContainText('1 waiting');
    await expect(page.getByText('Route configuration unavailable')).toHaveCount(0);

    await page.getByTestId('flow-line-strip-station-gate').click();
    await expect(page.getByTestId('flow-daily-chart')).toBeVisible();
    await page.getByRole('button', { name: '2026-10-13: Returned for fixes 1' }).click();
    await expect(page.getByText('Repair the queue')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Runner gate-b' })).toHaveAttribute('href', '/runners?runners=gate-b');
    const evidence = page.getByText('Repair the queue').locator('..');
    await evidence.getByRole('button', { name: 'Inspect journey' }).click();
    await expect(page.getByTestId('flow-item-journey')).toContainText('acme/widgets#41');

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


    // A held lot has no estimate: its next step is a person.
    await page.getByTestId('flow-card-review').click();
    await expect(page.getByTestId('flow-lots')).toContainText('held — awaiting an explicit release decision');

    // The window stays a filter: the station picked stays picked.
    await page.getByRole('group', { name: 'Window' }).getByRole('button', { name: '90 d' }).click();
    await expect(page).toHaveURL(/[?&]days=90\b/);
    await expect(page).toHaveURL(/[?&]station=review\b/);
    await expect.poll(() => log.queries.at(-1)?.get('days')).toBe('90');

    // The lot opens the work itself, which is where its trace is.
    await page.getByTestId('flow-card-gate').click();
    await expect(lots).toContainText('At Gate, oldest first');
    await expect(lots.locator('[data-list-row]').first()).toContainText('acme-0001');
    await page.keyboard.press('j');
    await expect(lots.locator('[data-list-row]').first()).toBeFocused();
    await page.keyboard.press('k');
    await expect(lots.locator('[data-list-row]').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/work\/acme-0001$/);
  });

  test('the same strip heads Activity and opens a station on Flow @action:flow.activity_strip', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    await mockFlowApi(page);

    await mockRepoList(page, [{
      id: { host: 'jeryu', owner: 'acme', name: 'widgets' },
      default_branch: 'main', visibility: 'private', family: 'acme',
    }]);
    for (const [route, scope] of [
      ['/activity', 'flow-activity-strip'],
      ['/repos/jeryu/acme/widgets/activity', 'flow-repo-activity-strip'],
    ]) {
      await page.goto(route);
      const strip = page.getByTestId('flow-line-strip');
      await expect(strip).toContainText('Gate holds the most waiting');
      const stations = ['queue', 'work', 'shift', 'review', 'gate', 'merge', 'pin', 'stage', 'deploy'];
      await expect(strip.getByRole('link')).toHaveCount(stations.length);
      for (const station of stations) {
        await expect(strip.getByTestId(`flow-line-strip-station-${station}`)).toHaveAttribute(
          'href', `/flow?station=${station}${route.startsWith('/repos') ? '&family=acme' : ''}`
        );
      }
      const stripBox = await strip.boundingBox();
      const histogramBox = await page.getByTestId('activity-volume').boundingBox();
      expect(stripBox!.y + stripBox!.height).toBeLessThanOrEqual(histogramBox!.y);
      const result = await runAxe(page, { include: '.line-strip' });
      await persistAxeResult(scope, result);
      expect(blockingViolations(result)).toEqual([]);
      expect((await persistRenderedEvidence(page, scope)).geometry.width).toBeGreaterThan(0);
      await strip.getByTestId('flow-line-strip-station-gate').click();
      await expect(page).toHaveURL(/\/flow\?station=gate/);
      await expect(page.getByTestId('flow-lots')).toContainText('At Gate, oldest first');
      await expect(page.getByTestId('flow-line-strip-station-gate')).toHaveAttribute('aria-pressed', 'true');
    }

    // The wall is the feed itself: no strip on it.
    await page.goto('/activity?wall=1');
    await expect(page.getByTestId('activity-page')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('flow-line-strip')).toHaveCount(0);

  });

  test('Layout mode shows each station\'s runners and flags a station short of tools @action:flow.layout', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockFlowApi(page);

    await page.goto('/flow');
    await expect(page.getByTestId('flow-body')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('flow-mode-layout').click();
    await expect(page).toHaveURL(/[?&]mode=layout\b/);

    const gate = page.getByTestId('flow-layout-card-gate');
    await expect(gate).toHaveAttribute('data-tone', 'human');
    await expect(page.getByTestId('flow-layout-capacity-gate')).toContainText('2 of 4 expected reporting');
    const busy = gate.getByTestId('flow-layout-tool-gate-b');
    await expect(busy).toContainText('node-b');
    await expect(busy).toContainText('online · busy');
    await expect(busy).toContainText('2.0.9 (1234567)');
    await expect(gate.getByTestId('flow-layout-tool-gate-c')).toContainText('offline · idle');
    await expect(busy.getByRole('link', { name: 'gate-b' })).toHaveAttribute('href', '/runners?runners=gate-b');
    // Nothing reports for Merge: a red card that says so.
    const merge = page.getByTestId('flow-layout-card-merge');
    await expect(merge).toHaveAttribute('data-tone', 'human');
    await expect(merge).toContainText('No tool is reporting for this station.');
    await expect(page.getByTestId('flow-layout-card-review')).toHaveAttribute('data-tone', 'ok');
    await expect(page.getByTestId('flow-layout-summary')).toContainText('Gate, Merge');

    const result = await runAxe(page, { disableRules: ['color-contrast'] });
    await persistAxeResult('flow-layout', result);
    const rendered = await persistRenderedEvidence(page, 'flow-layout');
    expect(rendered.geometry.width, 'the Flow Layout rendered with width').toBeGreaterThan(0);
    expect(blockingViolations(result).map((v) => `${v.impact ?? '?'} ${v.id}`)).toEqual([]);

    await page.getByTestId('flow-mode-live').click();
    await expect(page.getByTestId('flow-body')).toBeVisible();
    await expect(page).not.toHaveURL(/mode=layout/);
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
    const columns = await page.locator('.flow-map__intake').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns, 'one intake station per row on a phone').toBe(1);
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


test('closed work stays discoverable with replacement status and history @action:flow.closures', async ({ page }) => {
  await mockBootstrap(page, { auth: { role: 'admin' } });
  await mockFlowApi(page);
  await page.goto('/flow');
  const panel = page.getByTestId('flow-closures');
  await expect(panel).toContainText('2 items · 1 need attention');
  await panel.getByText('Inspect closed work', { exact: true }).click();
  await expect(panel.getByText('Original attempt closed.')).toBeHidden();
  await panel.getByText('Recorded explanation', { exact: true }).click();
  await expect(panel.getByText('Original attempt closed.')).toBeVisible();
  await panel.getByLabel('Disposition').selectOption('replacement_recorded');
  await expect(panel.getByRole('link', { name: 'acme/widgets#42', exact: true })).toHaveAttribute('href', '/acme/widgets/pull/42');
  expect(blockingViolations(await runAxe(page)).map(v => v.id)).toEqual([]);
  await panel.getByRole('button', { name: 'Inspect history' }).click();
  await expect(page).toHaveURL(/lot=acme%2Fwidgets%2340/);
  await expect(page.getByTestId('flow-item-journey')).toContainText('acme/widgets#40');
  await panel.getByLabel('Disposition').selectOption('attention');
  await panel.getByLabel('Only review').check();
  await expect(panel).toContainText('No closed work matches these filters.');
});
