// 29-pipeline.spec.ts — Needs you, Activity (feed, filters, wall), and the
// live dock and the pins ("Ready to pin"), on the pipeline visibility contract mocked at the browser
// boundary; plus the same surfaces against a server that predates it.

import { expect, test } from '@playwright/test';

import { mockBootstrap } from './fixtures/mocks';
import { DEPLOY_COMMAND, mockPipelineApi, pinsBody } from './fixtures/pipelineMocks';
import { compareBody, mockRepo, production, pull } from './fixtures/unreleasedMocks';

test.describe('Pipeline visibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().route('**/api/v1/ws', (route) => route.abort());
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
    await expect(staged.getByRole('button')).toHaveCount(1);

    // Watch rows are folded behind a count until asked for.
    const watch = page.getByTestId('needs-you-watch');
    await expect(watch).toContainText('1 thing worth a look');
    await expect(watch.getByText('Claim on 20260919-1 has a dead lease')).toBeHidden();
    await watch.locator('summary').click();
    await expect(watch.getByText('Claim on 20260919-1 has a dead lease')).toBeVisible();
    await page.getByTestId('needs-you-page').screenshot({ path: 'playwright-report/needs-you.png' });

    // In-app act: one link, to the place to act.
    await page
      .getByTestId('needs-you-item-todo-blocked:jeryu:20260919-130515-f8cc66')
      .getByRole('link', { name: /^Open: Allow PATCH/ })
      .click();
    await expect(page).toHaveURL(/\/work\/shift\?family=jeryu&todo=20260919-130515-f8cc66$/);
    // The badge counts critical + action (not watch) and follows the operator.
    await expect(page.getByTestId('needs-you-badge')).toHaveText('3');
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

    await page.getByLabel('Kind').fill('todo.');
    await page.getByLabel('Kind').press('Enter');
    await expect(page).toHaveURL(/kind=todo\./);
    // The filter is applied by the server, not in the browser.
    await expect.poll(() => log.eventQueries.join(' | ')).toContain('kind=todo.');
    await expect(page.getByTestId('activity-event-9')).toBeVisible();
    await expect(page.getByTestId('activity-event-12')).toHaveCount(0);

    // The box is bound to the URL, which the router updates in a transition:
    // click, then wait for the state rather than asserting it synchronously.
    await page.getByLabel('Needs a human only').click();
    await expect(page).toHaveURL(/needs_human=1/);
    await expect(page.getByLabel('Needs a human only')).toBeChecked();
    await expect(page.getByText('No events match these filters.')).toBeVisible();

    await page.goto('/activity?wall=1');
    await expect(page.getByRole('region', { name: 'Last 24 hours' })).toContainText('Todos finished');
    await expect(page.getByRole('region', { name: 'Activity filters' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Leave wall mode' }).click();
    await expect(page.getByRole('region', { name: 'Activity filters' })).toBeVisible();
  });

  test('the live dock shows the newest events on any page and remembers being collapsed @action:chrome.activity_dock', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);

    await page.goto('/settings');
    const dock = page.getByTestId('activity-dock');
    await expect(dock).toContainText('Merged neverhuman/jeryu#99', { timeout: 15_000 });
    await expect(dock).toContainText('1 need you');
    await dock.getByRole('button', { name: 'Live activity' }).click();
    await expect(dock.getByRole('log')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('activity-dock').getByRole('button', { name: 'Live activity' })).toHaveAttribute(
      'aria-expanded',
      'false',
      { timeout: 15_000 }
    );
    await page.getByTestId('activity-dock').getByRole('link', { name: 'All activity' }).click();
    await expect(page).toHaveURL(/\/activity$/);
  });
  test('Unreleased and Releases say what is merged but not pinned, with one next step @action:unreleased.ready_to_pin', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    await mockRepo(page, 'jeryu-deploy', {
      environments: [production],
      pulls: [pull('jeryu-deploy', 27, 'feat: already live', 'merged', 'a')],
      compare: compareBody('a', []),
    });

    await page.goto('/unreleased');
    const ready = page.getByTestId('ready-to-pin');
    await expect(ready).toBeVisible({ timeout: 15_000 });
    const web = ready.getByTestId('pin-jeryu/jeryu-web');
    await expect(web).toContainText('9 merged commits not pinned yet');
    await expect(web).toContainText('the pin bump opens by itself within minutes');
    await expect(web.getByText('test: the dock test brings its own Storage')).toBeHidden();
    await web.locator('summary').click();
    await expect(web.getByText('test: the dock test brings its own Storage')).toBeVisible();
    await expect(ready.getByTestId('pin-jeryu/jeryu-core')).toContainText(
      '3 commits since tag jeryu-core-v5.0.0-split.6, needs a new tag'
    );
    await expect(ready.getByTestId('pins-current-jeryu/jeryu-deploy')).toHaveText('1 pin current');
    // The existing content stays below it.
    await expect(page.getByTestId('unreleased-summary-jeryu/jeryu-deploy')).toBeVisible();

    await page.goto('/releases');
    const unpinned = page.getByTestId('releases-unpinned');
    await expect(unpinned).toContainText("jeryu-web has 9 merged commits not in this repo's pin");
    await unpinned.getByRole('link', { name: 'See what a bump would ship' }).click();
    await expect(page).toHaveURL(/\/unreleased\?repo=jeryu%2Fjeryu-deploy$/);
  });

  test('an open bump PR is the next step, and an older server stays quiet @action:unreleased.ready_to_pin', async ({
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
    await page.goto('/unreleased');
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
    await expect(page.getByTestId('unreleased-summary-jeryu/jeryu-deploy')).toBeVisible();
  });
});
