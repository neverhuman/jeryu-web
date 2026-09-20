// 29-pipeline.spec.ts — Needs you, Activity (feed, filters, wall), and the
// live dock and the pins ("Ready to pin"), on the pipeline visibility contract mocked at the browser
// boundary; plus the same surfaces against a server that predates it.

import { expect, test } from './fixtures/test';

import { mockBootstrap } from './fixtures/mocks';
import { attentionBody, DEPLOY_COMMAND, mockPipelineApi, pinsBody } from './fixtures/pipelineMocks';
import { compareBody, mockRepo, production, pull } from './fixtures/releaseFixtures';

test.describe('Pipeline visibility', () => {

  test('a push on the pipeline scope refetches Needs you @action:needs_you.live_nudge', async ({
    page,
    realtime,
  }) => {
    // Needs you polls every 15 s; the socket is only a nudge. Change what the
    // read answers, then push one `pipeline` event: the row must follow well
    // inside the poll interval, which only the nudge can do.
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    let recovered = false;
    await page.route(/\/api\/v1\/attention(\?.*)?$/, (route) => {
      const body = attentionBody();
      if (recovered) {
        (body.items as Array<Record<string, unknown>>)[0].title = 'Two worker slots are back';
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    await page.goto('/needs-you');
    const critical = page.getByTestId('needs-you-critical');
    await expect(critical).toContainText('No healthy worker slot for jain', { timeout: 15_000 });

    await realtime.waitForOpen();
    await realtime.hello();
    recovered = true;
    await realtime.event({
      seq: 13,
      scope: 'pipeline',
      kind: 'workers.recovered',
      entity: 'shift',
    });

    await expect(critical).toContainText('Two worker slots are back', { timeout: 8_000 });
  });

  test('admins land on Needs you: red rows, one action each, badge on every page @action:needs_you.render @action:needs_you.badge', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);

    await page.goto('/');
    await expect(page).toHaveURL(/\/needs-you$/);
    await expect(page.getByTestId('needs-you-page')).toBeVisible({ timeout: 15_000 });

    const critical = page.getByTestId('needs-you-critical');
    await expect(critical).toContainText('No healthy worker slot for jain');
    await expect(critical).toContainText('Workers down');

    // Off-site act: the command is the single action.
    const staged = page.getByTestId('needs-you-item-release_staged:jeryu/jeryu-deploy');
    await expect(staged).toContainText(DEPLOY_COMMAND);
    await expect(staged.getByRole('link')).toHaveCount(0);
    // One act (copy) plus the family pill, which only filters.
    await expect(staged.getByRole('button')).toHaveCount(2);

    // Watch rows are folded behind a count until asked for.
    const watch = page.getByTestId('needs-you-watch');
    await expect(watch).toContainText('1 thing worth a look');
    await expect(watch.getByText('Claim on 20260919-1 has a dead lease')).toBeHidden();
    await watch.locator('summary').click();
    await expect(watch.getByText('Claim on 20260919-1 has a dead lease')).toBeVisible();
    await page.getByTestId('needs-you-page').screenshot({ path: 'playwright-report/needs-you.png' });

    // Family pills: the pill on a row filters the page to that family, in the
    // URL so it is a link; pressing it again shows every family.
    const blockedRow = page.getByTestId('needs-you-item-todo-blocked:jeryu:20260919-130515-f8cc66');
    await blockedRow.getByRole('button', { name: 'Show only jeryu' }).click();
    await expect(page).toHaveURL(/[?&]family=jeryu/);
    await expect(page.getByTestId('needs-you-item-workers_down:jain')).toHaveCount(0);
    await expect(blockedRow).toBeVisible();
    await blockedRow.getByRole('button', { name: /^Showing only jeryu/ }).click();
    await expect(page).not.toHaveURL(/family=/);
    await expect(page.getByTestId('needs-you-item-workers_down:jain')).toBeVisible();

    // The Live pill is the way to the feed.
    await expect(page.getByTestId('live-pill')).toHaveAttribute('href', '/activity');

    // In-app act: one link, to the place to act.
    await page
      .getByTestId('needs-you-item-todo-blocked:jeryu:20260919-130515-f8cc66')
      .getByRole('link', { name: /^Open: Allow PATCH/ })
      .click();
    await expect(page).toHaveURL(/\/work\?family=jeryu&todo=20260919-130515-f8cc66$/);
    // The badge counts critical + action (not watch) and follows the operator.
    await expect(page.getByTestId('needs-you-badge')).toHaveText('3');
  });

  test('narrow screens: the header never overflows and a Needs-you title keeps its width @action:chrome.narrow_header', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    for (const width of [900, 480]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/needs-you');
      await expect(page.getByTestId('needs-you-page')).toBeVisible({ timeout: 15_000 });
      const header = page.locator('.global-header');
      const overflow = await header.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, `header overflows at ${width}px`).toBeLessThanOrEqual(0);
      // Every header control is still there, by name, however small it got.
      await expect(page.getByRole('button', { name: /^Search or jump to/ })).toBeVisible();
      await expect(page.getByRole('banner').getByRole('link', { name: 'Settings' })).toBeVisible();
      await expect(page.getByRole('banner').getByRole('status')).toHaveAccessibleName(/^Live updates /);
      // The action stacks under the text instead of squeezing the title to a word per line.
      const title = page
        .getByTestId('needs-you-item-todo-blocked:jeryu:20260919-130515-f8cc66')
        .locator('.needs-you__title');
      const box = await title.boundingBox();
      expect(box?.width ?? 0, `title width at ${width}px`).toBeGreaterThan(200);
    }
  });

  test('other roles keep the family browser as home; an older server degrades plainly @action:needs_you.unavailable', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'user' } });
    await page.goto('/');
    await expect(page).toHaveURL(/\/repos\/family\/jeryu-split$/);
    await expect(page.getByTestId('needs-you-badge')).toHaveCount(0);

    // No pipeline mocks: the shared fallback answers 404, like an old server.
    await page.goto('/needs-you');
    await expect(page.getByText('Not available on this server version.')).toBeVisible({ timeout: 15_000 });
    await page.goto('/activity');
    await expect(page.getByText('Not available on this server version.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('activity-dock')).toHaveCount(0);
  });

  test('Activity lists events with log tails, filters through the URL, and has a wall mode @action:activity.feed @action:activity.filters @action:activity.wall', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    const log = await mockPipelineApi(page);

    await page.goto('/activity');
    await expect(page.getByTestId('activity-event-12')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('activity-event-12')).toContainText('needs you');
    const gate = page.getByTestId('activity-event-10');
    await gate.getByRole('button', { name: 'Log for event 10' }).click();
    await expect(gate.getByLabel('Log tail of event 10')).toContainText('gate: FAILED');
    await expect(gate.getByRole('link', { name: 'neverhuman/jeryu#99' })).toHaveAttribute(
      'href',
      '/repos/jeryu/neverhuman/jeryu/pulls/99'
    );
    await page.getByTestId('activity-page').screenshot({ path: 'playwright-report/activity.png' });

    // Plain words on the row; the wire kind is not shouted at the reader.
    await expect(gate).toContainText('Gate failed');
    await expect(gate.locator('.activity-row__line')).not.toContainText('gate.log');

    // One click per view: a chip sets the server-side filter through the URL.
    await page.getByRole('button', { name: 'Todos', exact: true }).click();
    await expect(page).toHaveURL(/kind=todo\./);
    await expect(page.getByRole('button', { name: 'Todos', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // The filter is applied by the server, not in the browser.
    await expect.poll(() => log.eventQueries.join(' | ')).toContain('kind=todo.');
    await expect(page.getByTestId('activity-event-9')).toBeVisible();
    await expect(page.getByTestId('activity-event-12')).toHaveCount(0);
    // The free-text filters are folded, not gone.
    await expect(page.getByLabel('Kind')).toBeHidden();

    // The chip is bound to the URL, which the router updates in a transition:
    // click, then wait for the state rather than asserting it synchronously.
    await page.getByRole('button', { name: 'Needs a human' }).click();
    await expect(page).toHaveURL(/needs_human=1/);
    await expect(page.getByRole('button', { name: 'Needs a human' })).toHaveAttribute('aria-pressed', 'true');
    // A chip is a whole view: it replaces the kind filter rather than stacking on it.
    await expect(page).not.toHaveURL(/kind=/);
    await expect(page.getByTestId('activity-event-12')).toBeVisible();
    await expect(page.getByTestId('activity-event-9')).toHaveCount(0);

    await page.goto('/activity?wall=1');
    await expect(page.getByRole('region', { name: 'Last 24 hours' })).toContainText('Todos finished');
    await expect(page.getByRole('region', { name: 'Activity filters' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Leave wall mode' }).click();
    await expect(page.getByRole('region', { name: 'Activity filters' })).toBeVisible();
  });

  test('the live dock is one quiet line on any page, opens to the newest events, and remembers @action:chrome.activity_dock', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);

    await page.goto('/settings');
    const dock = page.getByTestId('activity-dock');
    // One quiet line until opened: the newest event and how many need you.
    await expect(dock.getByRole('button', { name: 'Live activity' })).toHaveAttribute('aria-expanded', 'false', {
      timeout: 15_000,
    });
    await expect(dock.getByRole('log')).toHaveCount(0);
    await expect(dock).toContainText('1 need you');
    await dock.getByRole('button', { name: 'Live activity' }).click();
    await expect(dock.getByRole('log')).toContainText('Merged neverhuman/jeryu#99');
    await expect(dock.getByRole('log')).toContainText('PR merged');

    // Opening it is remembered.
    await page.reload();
    await expect(page.getByTestId('activity-dock').getByRole('button', { name: 'Live activity' })).toHaveAttribute(
      'aria-expanded',
      'true',
      { timeout: 15_000 }
    );
    await page.getByTestId('activity-dock').getByRole('link', { name: 'All activity' }).click();
    await expect(page).toHaveURL(/\/activity$/);
    // The Activity page is the same feed at full size, so the dock steps aside.
    await expect(page.getByTestId('activity-event-12')).toBeVisible();
    await expect(page.getByTestId('activity-dock')).toHaveCount(0);
  });
  test('Releases says what is merged but not pinned, with one next step @action:releases.ready_to_pin', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    await mockRepo(page, 'jeryu-deploy', {
      environments: [production],
      pulls: [pull('jeryu-deploy', 27, 'feat: already live', 'merged', 'a')],
      compare: compareBody('a', []),
    });

    await page.goto('/releases');
    const ready = page.getByTestId('ready-to-pin');
    await expect(ready).toBeVisible({ timeout: 15_000 });
    const web = ready.getByTestId('pin-jeryu/jeryu-web');
    await expect(web).toContainText('9 merged commits not pinned yet');
    await expect(web).toContainText('the pin bump opens by itself within minutes');
    await expect(web.getByText('test: the dock test brings its own Storage')).toBeHidden();
    await web.locator('summary').click();
    await expect(web.getByText('test: the dock test brings its own Storage')).toBeVisible();
    // Trailing tags cannot be acted on from here: they fold behind one line,
    // below the commit pin that can.
    const core = ready.getByTestId('pin-jeryu/jeryu-core');
    await expect(core).toBeHidden();
    const tagged = ready.getByTestId('pins-tagged-jeryu/jeryu-deploy');
    await expect(tagged.locator('> summary')).toHaveText('1 dependency has commits since its pinned tag');
    await tagged.locator('> summary').click();
    await expect(core).toBeVisible();
    await expect(core).toContainText('3 commits since tag jeryu-core-v5.0.0-split.6, needs a new tag');
    await expect(ready.getByTestId('pins-current-jeryu/jeryu-deploy')).toHaveText('1 pin current');

    // What a bump would ship is the timeline's question now, not this page's.
    const unpinned = page.getByTestId('releases-unpinned');
    await expect(unpinned).toContainText("jeryu-web has 9 merged commits not in this repo's pin");
    await unpinned.getByRole('link', { name: 'See what a bump would ship' }).click();
    await expect(page).toHaveURL(/\/pull-room\?repo=jeryu%2Fjeryu-deploy$/);
  });

  test('an open bump PR is the next step, and an older server stays quiet @action:releases.ready_to_pin', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page, {
      pins: pinsBody({ number: 53, state: 'open', url: '/repos/jeryu/jeryu/jeryu-deploy/pulls/53' }),
    });
    await mockRepo(page, 'jeryu-deploy', {
      environments: [production],
      pulls: [pull('jeryu-deploy', 27, 'feat: already live', 'merged', 'a')],
      compare: compareBody('a', []),
    });
    // The old path still resolves: the forge's attention items emit it.
    await page.goto('/unreleased');
    await expect(page).toHaveURL(/\/releases$/);
    await expect(
      page.getByTestId('pin-jeryu/jeryu-web').getByRole('link', { name: 'bump PR #53 is open' })
    ).toHaveAttribute('href', '/repos/jeryu/jeryu/jeryu-deploy/pulls/53');

    // A server that predates the route answers with the SPA shell.
    await page.route(/\/api\/v1\/pins(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html></html>' })
    );
    await page.reload();
    await expect(page.getByTestId('ready-to-pin-unavailable')).toHaveText(
      'Pins are not available on this server version.'
    );
    // The environments the page is really about are still there.
    await expect(page.getByTestId('releases-page')).toBeVisible();
  });
});
