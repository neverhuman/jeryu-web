// 29-pipeline.spec.ts — Needs you, Activity (feed, filters, wall), and the
// live dock and the pins ("Ready to pin"), on the pipeline visibility contract mocked at the browser
// boundary; plus the same surfaces against a server that predates it.

import { expect, test } from './fixtures/test';

import { mockBootstrap } from './fixtures/mocks';
import {
  attentionBody,
  DEPLOY_COMMAND,
  DEPLOY_RUN_IN,
  mockPipelineApi,
  pinsBody,
  usageBody,
  queueFailedBody,
  reviewHoldBody,
} from './fixtures/pipelineMocks';
import { compareBody, mockRepo, production, pull } from './fixtures/releaseFixtures';
import { mockShiftApi } from './fixtures/shiftMocks';

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
    // Where before what: one line above the command, and the copy button's description.
    await expect(staged.getByTestId('copy-command-where')).toHaveText(`Run on ${DEPLOY_RUN_IN}`);
    await expect(staged.getByRole('button', { name: /^Copy Deploy command/ })).toHaveAccessibleDescription(
      `Run on ${DEPLOY_RUN_IN}`
    );
    // The command is the row's act; the title still leads to its subject.
    await expect(staged.getByRole('link', { name: /^Release prod-/ })).toHaveAttribute(
      'href',
      '/releases'
    );
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
    // The server's link names the todo, so it opens the todo's own page.
    await expect(page).toHaveURL(/\/work\/20260919-130515-f8cc66$/);
    await expect(page.getByTestId('todo-page')).toBeVisible();
    // The badge counts critical + action (not watch) and follows the operator.
    await expect(page.getByTestId('needs-you-badge')).toHaveText('3');
    // Each page carries its own share in the nav.
    await expect(page.getByTestId('nav-badge-work')).toHaveText('1');
    await expect(page.getByTestId('nav-badge-releases')).toHaveText('1');
    await expect(page.getByTestId('nav-badge-system')).toHaveText('1');
    await expect(page.getByTestId('nav-badge-pulls')).toHaveCount(0);
    // Work shows its own share of Needs you, as every other page does: the
    // rows the Work badge counted, above the queue's own state. (Its red count
    // of that share is in the queue's toolbar; 28-shift holds that.)
    await page.getByTestId('todo-page').getByRole('link', { name: 'Work', exact: true }).click();
    await expect(page.getByTestId('shift-queue-page')).toBeVisible();
    const here = page.getByTestId('needs-you-here-work');
    await expect(here).toHaveAttribute('aria-label', '1 waiting on you in Work');
    await expect(here.getByText('Allow PATCH of repo default_branch')).toBeVisible();
  });

  test('a Needs-you row about a todo is acknowledged until a date @action:needs_you.acknowledge', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    const shift = await mockShiftApi(page);

    await page.goto('/needs-you');
    const blocked = page.getByTestId('needs-you-item-todo-blocked:jeryu:20260919-130515-f8cc66');
    await expect(blocked).toBeVisible({ timeout: 15_000 });
    // It is folded away: a row still reads as one title, one reason, one act.
    const until = blocked.getByLabel('Acknowledge 20260919-130515-f8cc66 until');
    await expect(until).toBeHidden();
    await blocked.getByLabel('More for Allow PATCH of repo default_branch').click();
    await until.fill('2026-10-05T09:30');
    await blocked.getByRole('button', { name: 'Acknowledge' }).click();
    await expect.poll(() => shift.posts.length).toBe(1);
    expect(shift.posts[0].path).toBe(
      '/api/v1/shift/todos/jeryu/20260919-130515-f8cc66/action'
    );
    const body = shift.posts[0].body as { action: string; until: string };
    expect(body.action).toBe('acknowledge');
    expect(body.until).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

    // A row about a release names no todo: there is nothing to acknowledge.
    const staged = page.getByTestId('needs-you-item-release_staged:jeryu/jeryu-deploy');
    await expect(staged.getByText('More', { exact: true })).toHaveCount(0);
  });

  test("a Needs-you row runs the forge's own call in place @action:needs_you.run_action", async ({
    page,
  }) => {
    // The row names one API call; its button makes it, once, behind a confirm
    // step, and the title still leads to the pull request behind the row.
    const queuePath = '/api/v1/repos/jeryu:acme%2Fweb/pulls/7/queue';
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page, { attention: queueFailedBody() });
    const posts: Array<{ method: string; key: string | undefined }> = [];
    let refuse = true;
    await page.route('**/pulls/7/queue', async (route, request) => {
      posts.push({
        method: request.method(),
        key: request.headers()['idempotency-key'],
      });
      if (refuse) {
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'permission_denied',
              message: 'enqueueing needs write access to the repository',
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ number: 7, state: 'building' }),
      });
    });

    await page.goto('/needs-you');
    const row = page.getByTestId('needs-you-item-queue_failed:acme/web:7');
    await expect(row).toBeVisible({ timeout: 15_000 });
    // The next step only repeats the button and the title link, so the second
    // line is the reason, and no bare path is shown.
    await expect(row).toContainText('The queue gate failed twice on the same commit.');
    await expect(row).not.toContainText('open /repos/jeryu/acme/web/pulls/7');
    await expect(row.getByRole('link', { name: 'acme/web#7 failed in the merge queue' })).toHaveAttribute(
      'href',
      '/repos/jeryu/acme/web/pulls/7'
    );
    // One act plus the family pill, which only filters.
    await expect(row.getByRole('button')).toHaveCount(2);

    await row.getByRole('button', { name: /^Queue again: / }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Queue acme/web#7 again on its current head?');
    expect(posts).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Queue again', exact: true }).click();

    // One POST, with its own Idempotency-Key, and the refusal worded in place.
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0].method).toBe('POST');
    expect(posts[0].key).toBeTruthy();
    await expect(row.getByRole('alert')).toContainText(
      'enqueueing needs write access to the repository'
    );
    expect(new URL(page.url()).pathname).toBe('/needs-you');

    // Asked again it is one more call and no more, on a fresh key.
    refuse = false;
    await row.getByRole('button', { name: /^Queue again: / }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Queue again', exact: true }).click();
    await expect.poll(() => posts.length).toBe(2);
    expect(posts[0].key).not.toBe(posts[1].key);
    await expect(row.getByRole('alert')).toHaveCount(0);
  });

  test('three items about one pull request are one row with one act @action:needs_you.group_subject', async ({
    page,
  }) => {
    // A review hold on acme/widgets#7 raises changes requested, a reviewer
    // that could not finish and a failed queue entry. Three red rows with
    // three different acts would read as three problems, so they are one row:
    // the act of the first by precedence, the rest named under it.
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page, { attention: reviewHoldBody() });

    await page.goto('/needs-you');
    const rows = page.getByTestId('needs-you-page').locator('.needs-you__row');
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    const row = page.getByTestId('needs-you-item-reviewer_stuck:acme/widgets:7');
    await expect(row).toBeVisible();
    // The worst of the three names the row, and its act is the row's.
    await expect(page.getByTestId('needs-you-critical')).toContainText(
      'pr-redteam could not finish its review of acme/widgets#7'
    );
    await expect(page.getByTestId('needs-you-action')).toHaveCount(0);
    await expect(row.getByRole('link', { name: /^Review by hand: / })).toBeVisible();
    // The row's one act is that link, so its only button is the family pill,
    // which filters: nothing here queues the pull request again.
    await expect(row.getByRole('button')).toHaveCount(1);
    await expect(row.getByRole('button', { name: /Queue again/ })).toHaveCount(0);

    // The other two are context on the same row, each with where to go.
    const changes = row.getByTestId('needs-you-also-pr_changes_requested:acme/widgets:7');
    await expect(changes).toContainText('Push a fix, or dismiss the review');
    // It leads to the review that asks for changes, not just the pull request.
    await expect(changes.getByRole('link', { name: 'Changes requested' })).toHaveAttribute(
      'href',
      '/repos/jeryu/acme/widgets/pulls/7#changes-requested'
    );
    await expect(row.getByTestId('needs-you-also-queue_failed:acme/widgets:7')).toContainText(
      'Merge queue failed'
    );
    // The row waits as long as the oldest of the three.
    await expect(row.locator('time')).toHaveAttribute('datetime', /.+/);
    // The badge still counts the items the server counted.
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
      await expect(page.getByTestId('account-menu-button')).toBeVisible();
      await expect(page.getByRole('banner').getByRole('status')).toHaveAccessibleName(/^Live updates /);
      // The action stacks under the text instead of squeezing the title to a word per line.
      const title = page
        .getByTestId('needs-you-item-todo-blocked:jeryu:20260919-130515-f8cc66')
        .locator('.needs-you__title');
      const box = await title.boundingBox();
      expect(box?.width ?? 0, `title width at ${width}px`).toBeGreaterThan(200);
      // A command row stays inside the page: the where-line wraps and the
      // command scrolls inside its own box.
      const where = page
        .getByTestId('needs-you-item-release_staged:jeryu/jeryu-deploy')
        .getByTestId('copy-command-where');
      await expect(where).toBeVisible();
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(sideways, `page scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test('other roles land on the repositories index; an older server degrades plainly @action:needs_you.unavailable', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'user' } });
    await page.goto('/');
    await expect(page).toHaveURL(/\/repos$/);
    await expect(page.getByTestId('needs-you-badge')).toHaveCount(0);
    // The destinations whose reads are admin-only are not offered at all.
    for (const label of ['Needs you', 'Activity', 'Work']) {
      await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: label })).toHaveCount(0);
    }

    // No pipeline mocks: the shared fallback answers 404, like an old server.
    await page.goto('/needs-you');
    await expect(page.getByText('Not available on this server version.')).toBeVisible({ timeout: 15_000 });
    await page.goto('/activity');
    await expect(page.getByText('Not available on this server version.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('activity-dock')).toHaveCount(0);
  });

  test('Activity lists events with log tails, filters through the URL, and has a wall mode @action:activity.feed @action:activity.filters @action:activity.volume @action:activity.wall', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    const log = await mockPipelineApi(page);

    await page.goto('/activity');
    await expect(page.getByTestId('activity-event-12')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('activity-event-12')).toContainText('needs you');
    const gate = page.getByTestId('activity-event-10');
    await gate.getByRole('button', { name: 'Log for event 10' }).click();
    const tail = gate.getByTestId('activity-event-log-10');
    await expect(tail).toContainText('gate: FAILED');
    // The tail opens at its end, where the failure is, and the lines that
    // report one carry the danger tone while the build noise stays plain.
    await expect
      .poll(() => tail.evaluate((pre) => pre.scrollTop > 0 && pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 1))
      .toBe(true);
    await expect(tail.locator('.activity-row__log-line--bad')).toHaveText([
      'error[E0432]: unresolved import',
      'gate: FAILED',
    ]);
    await expect(gate).toContainText('2 failing lines');
    await expect(gate.getByRole('link', { name: 'neverhuman/jeryu#99' })).toHaveAttribute(
      'href',
      '/repos/jeryu/neverhuman/jeryu/pulls/99'
    );
    // Row times are a clock; a separator says which day they belong to, and the
    // internal sequence number stays out of sight.
    const day = page.locator('.activity__day').first();
    await expect(day).toBeVisible();
    // The header also says how much of that day is loaded, so a scroll keeps a
    // sense of volume without reading every row.
    await expect(day).toContainText(/\d+ events?/);
    await expect(page.getByTestId('activity-page')).not.toContainText('newest #');

    // The volume band sits above the chips and is a filter of its own: its
    // range is held in the URL, and a legend key sets the chip below it.
    const band = page.getByTestId('activity-volume');
    await expect(band.locator('.activity-volume__bar').first()).toBeVisible();
    await band.getByRole('button', { name: '6h' }).click();
    await expect(page).toHaveURL(/range=6h/);
    await band.getByRole('button', { name: 'Filter to gates' }).click();
    await expect(page).toHaveURL(/kind=gate\./);
    await expect(page.getByRole('button', { name: 'Gates', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/activity');
    await expect(page.getByTestId('activity-event-12')).toBeVisible({ timeout: 15_000 });

    // Each chip says how much is behind it over the band's range, and a chip
    // with nothing behind it is quieter but still a filter.
    const chips = page.getByRole('group', { name: 'Show' });
    await expect(chips.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
      'title',
      /in the last 24h/
    );
    await expect(chips.locator('.activity__chip-count').first()).toBeVisible();

    // Beside the chips: the slots' step beats are out of All, and this is how a
    // reader puts them back. Workers asks for them by name, so there the
    // toggle has nothing to say and is not drawn.
    const steps = page.getByTestId('activity-worker-steps');
    await expect(steps).toHaveAttribute('aria-pressed', 'false');
    await steps.click();
    await expect(page).toHaveURL(/steps=1/);
    await expect(steps).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Workers', exact: true }).click();
    await expect(page).toHaveURL(/kind=worker\.%2Cshift\./);
    await expect(page.getByTestId('activity-worker-steps')).toHaveCount(0);
    await page.goto('/activity');
    await expect(page.getByTestId('activity-event-12')).toBeVisible({ timeout: 15_000 });

    // The 24-hour strip is on the normal page too, under the chart, and its
    // numbers are the server's totals for the window, not the loaded page.
    const strip = page.getByTestId('activity-counters');
    await expect(strip).toContainText('42');
    await expect(strip).toContainText('$12.34');
    await expect(strip).not.toContainText('loaded here');
    await expect(strip.getByRole('link', { name: /Blocked/ })).toHaveAttribute('href', '/needs-you');

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
    await page.getByRole('button', { name: 'Needed a human' }).click();
    await expect(page).toHaveURL(/needs_human=1/);
    await expect(page.getByRole('button', { name: 'Needed a human' })).toHaveAttribute('aria-pressed', 'true');
    // The log is history; what waits on a person now is one link away.
    const note = page.getByTestId('activity-needs-you');
    await expect(note).toContainText('waiting on a person right now');
    // The same 3 rows the nav badge and Needs you show, not a fourth count.
    await expect(note).toContainText('(3)');
    await expect(note.getByRole('link', { name: 'Needs you' })).toHaveAttribute('href', '/needs-you');
    // A chip is a whole view: it replaces the kind filter rather than stacking on it.
    await expect(page).not.toHaveURL(/kind=/);
    await expect(page.getByTestId('activity-event-12')).toBeVisible();
    await expect(page.getByTestId('activity-event-9')).toHaveCount(0);

    await page.goto('/activity?wall=1');
    const wallStrip = page.getByRole('region', { name: 'Last 24 hours' });
    await expect(wallStrip).toContainText('Todos finished');
    // Wall and desk read the one source: the histogram's window totals.
    await expect(wallStrip).toContainText('42');
    await expect(wallStrip).not.toContainText('loaded here');
    await expect(page.getByRole('region', { name: 'Activity filters' })).toHaveCount(0);
    // The wall also carries the clock, and the band and the token panel at the
    // width of the screen, under the counters.
    await expect(page.getByTestId('activity-wall-clock')).toContainText(/\d\d:\d\d/);
    await expect(page.getByTestId('activity-volume')).toBeVisible();
    await expect(page.getByTestId('activity-usage')).toBeVisible();
    await page.getByRole('link', { name: 'Leave wall mode' }).click();
    await expect(page.getByRole('region', { name: 'Activity filters' })).toBeVisible();
  });

  test('Activity draws its controls once: a late family list and a chip’s note move nothing @action:activity.steady_controls', async ({
    page,
  }) => {
    // The family list is a second request: it used to arrive after the first
    // paint, put the pills beside the chips and push the row’s neighbours onto
    // a new line, moving the feed under them. Hold the answer, measure, let it
    // land, measure again: the controls must be where they were drawn.
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    let answer = (): void => {};
    const held = new Promise<void>((resolve) => {
      answer = () => resolve();
    });
    await page.route(/\/api\/v1\/shift\/families(\?.*)?$/, async (route) => {
      await held;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          families: [
            { name: 'jeryu', queue_repo: 'jeryu/jeryu-todo', repos: [], shift_tz: 'UTC', landing: 'shifts' },
            { name: 'globex', queue_repo: 'globex/todo', repos: [], shift_tz: 'UTC', landing: 'shifts' },
          ],
        }),
      });
    });

    await page.goto('/activity');
    const chips = page.getByRole('group', { name: 'Show' });
    const more = page.locator('.activity__more > summary');
    await expect(page.getByTestId('activity-event-12')).toBeVisible({ timeout: 15_000 });
    const slot = page.locator('.activity__family-slot');
    const before = {
      slot: await slot.boundingBox(),
      chips: await chips.boundingBox(),
      more: await more.boundingBox(),
      feed: await page.getByTestId('activity-event-12').boundingBox(),
    };

    answer();
    const strip = page.getByRole('group', { name: 'Filter by family' });
    await expect(strip.getByRole('button', { name: 'globex' })).toBeVisible();
    expect(await chips.boundingBox()).toMatchObject({ x: before.chips?.x, y: before.chips?.y });
    expect(await more.boundingBox()).toMatchObject({ y: before.more?.y });
    expect(await page.getByTestId('activity-event-12').boundingBox()).toMatchObject({
      y: before.feed?.y,
    });
    // The pills landed in the box that was held for them, which neither moved
    // nor changed size to take them.
    expect(await slot.boundingBox()).toEqual(before.slot);
    const stripBox = await strip.boundingBox();
    expect(stripBox).toMatchObject({ x: before.slot?.x, y: before.slot?.y });

    // The note a chip adds is a line of its own under the controls: it moves
    // no chip and no family pill.
    const steady = { chips: await chips.boundingBox(), strip: stripBox };
    await page.getByRole('button', { name: 'Needed a human' }).click();
    const note = page.getByTestId('activity-needs-you');
    await expect(note).toContainText('waiting on a person right now');
    expect(await chips.boundingBox()).toMatchObject({ x: steady.chips?.x, y: steady.chips?.y });
    expect(await strip.boundingBox()).toMatchObject({ x: steady.strip?.x, y: steady.strip?.y });
    // Its own line: below the chip row, above More filters.
    const noteBox = await note.boundingBox();
    expect(noteBox?.y ?? 0).toBeGreaterThanOrEqual((steady.chips?.y ?? 0) + (steady.chips?.height ?? 0));
    expect((await more.boundingBox())?.y ?? 0).toBeGreaterThanOrEqual(
      (noteBox?.y ?? 0) + (noteBox?.height ?? 0)
    );
  });

  test('Activity hands over the raw event and the query behind the screen @action:activity.api', async ({
    page,
  }) => {
    // What the clipboard received, kept on the window: the browser's own
    // clipboard needs a permission the test does not need to ask for.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (value: string) => {
            (window as unknown as { __copied?: string }).__copied = value;
          },
        },
        configurable: true,
      });
    });
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    const copied = (): Promise<string | undefined> =>
      page.evaluate(() => (window as unknown as { __copied?: string }).__copied);

    await page.goto('/activity');
    await expect(page.getByTestId('activity-event-12')).toBeVisible({ timeout: 15_000 });

    // Under the filters: the request this list is one page of.
    const api = page.getByTestId('activity-api');
    await expect(api).toContainText('/api/v1/events?limit=100');
    await expect(api.getByRole('link', { name: 'API' })).toHaveAttribute('href', '/api/v1/events?limit=100');
    await api.getByTestId('activity-api-copy').click();
    await expect(api).toContainText('Copied');
    expect(await copied()).toBe('/api/v1/events?limit=100');

    // A chip is another view, so it is another query, and the line says so.
    await page.getByRole('button', { name: 'Gates', exact: true }).click();
    await expect(api.getByRole('link', { name: 'API' })).toHaveAttribute(
      'href',
      '/api/v1/events?kind=gate.&limit=100'
    );

    // The row hands over itself, as the API returned it.
    const gate = page.getByTestId('activity-event-10');
    await gate.getByRole('button', { name: 'Log for event 10' }).click();
    await gate.getByTestId('activity-event-json-10').click();
    await expect(gate).toContainText('Copied');
    const json = JSON.parse((await copied()) ?? '{}') as { seq: number; kind: string };
    expect(json.seq).toBe(10);
    expect(json.kind).toBe('gate.log');

    // And the log tail itself, whole, for the ticket that quotes it.
    await gate.getByTestId('activity-event-log-copy-10').click();
    const tail = (await copied()) ?? '';
    expect(tail.startsWith('   Compiling jeryu-core unit 1')).toBe(true);
    expect(tail.endsWith('gate: FAILED')).toBe(true);
  });

  test('Activity names each field of an open row and hands over the deploy command @action:activity.detail_fields', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (value: string) => {
            (window as unknown as { __copied?: string }).__copied = value;
          },
        },
        configurable: true,
      });
    });
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);

    await page.goto('/activity');
    await expect(page.getByTestId('activity-event-12')).toBeVisible({ timeout: 15_000 });

    // A failed gate: which runner ran it, with which recipe, and where the
    // receipt landed — none of which the one line could say.
    const gate = page.getByTestId('activity-event-10');
    await gate.getByRole('button', { name: 'Log for event 10' }).click();
    const gateFields = gate.getByTestId('activity-event-fields-10');
    await expect(gateFields.locator('dt')).toHaveText(['Runner', 'Recipe', 'Receipt']);
    await expect(gateFields).toContainText('just required');
    // And the join keys are words now, not the bare wire value beside them.
    await expect(gate.locator('.activity-row__facts dt')).toHaveText([
      'Source',
      'Kind',
      'Outcome',
      'Actor',
      'Commit',
    ]);

    // The staged release carries the command that would deploy it, which is
    // the one field nobody should have to retype.
    const staged = page.getByTestId('activity-event-12');
    await staged.getByRole('button', { name: 'Why for event 12' }).click();
    await expect(staged.getByTestId('activity-event-fields-12').locator('dt')).toHaveText([
      'Release',
      'Head',
      'Deploy command',
    ]);
    await staged.getByTestId('activity-event-field-copy-12-deploy_command').click();
    expect(await page.evaluate(() => (window as unknown as { __copied?: string }).__copied)).toBe(
      'jeryu deploy prod-20260919T130210Z-01dfe68-unsigned'
    );
  });

  test('Activity freezes the list on Pause and picks the tail back up on Resume @action:activity.pause', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);

    await page.goto('/activity');
    await expect(page.getByTestId('activity-event-12')).toBeVisible({ timeout: 15_000 });
    // The pill next to the button says which of the two the list is.
    const pause = page.getByTestId('activity-pause');
    await expect(pause).toHaveText(/Pause/);
    await expect(page.getByTestId('activity-page')).toContainText('Live ·');

    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(pause).toHaveText(/Resume/);
    await expect(page.getByTestId('activity-page')).toContainText('Paused ·');
    // Frozen is still the list the reader had: nothing is taken away from them.
    await expect(page.getByTestId('activity-event-12')).toBeVisible();

    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('activity-page')).toContainText('Live ·');

    // Wall mode has no reader to freeze for.
    await page.goto('/activity?wall=1');
    await expect(page.getByTestId('activity-event-12')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('activity-pause')).toHaveCount(0);
  });

  test('Activity is walkable from the keyboard: j/k, the arrows, Enter and / @action:activity.row_keys', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);

    await page.goto('/activity');
    await expect(page.getByTestId('activity-event-12')).toBeVisible({ timeout: 15_000 });

    // j takes the focus to the newest row and down the list from there; the
    // focused row is the one the browser has, so it is visibly where the
    // reader is and a screen reader reads it.
    await page.keyboard.press('j');
    await expect(page.getByTestId('activity-event-12')).toBeFocused();
    await page.keyboard.press('j');
    await expect(page.getByTestId('activity-event-11')).toBeFocused();
    await page.keyboard.press('k');
    await expect(page.getByTestId('activity-event-12')).toBeFocused();
    // With the list focused the arrows move along it too.
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('activity-event-11')).toBeFocused();

    // Enter on the row opens it, and closes it again.
    await page.keyboard.press('ArrowDown');
    const gate = page.getByTestId('activity-event-10');
    await expect(gate).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(gate.getByLabel('Log tail of event 10')).toContainText('gate: FAILED');
    await page.keyboard.press('Enter');
    await expect(gate.getByLabel('Log tail of event 10')).toHaveCount(0);

    // `/` is More filters here, open at its first field, and what is typed
    // there is typed, not read as a shortcut.
    await page.keyboard.press('/');
    const repo = page.getByLabel('Repo');
    await expect(repo).toBeFocused();
    await repo.fill('jeryu/jeryu-web');
    await expect(repo).toHaveValue('jeryu/jeryu-web');
    await expect(page.getByTestId('activity-event-12')).not.toBeFocused();

    // The keys are the page's list, where a reader looks for them.
    await page.getByRole('heading', { name: 'Activity' }).click();
    await page.keyboard.press('Shift+/');
    const overlay = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(overlay).toContainText('Next event');
    await expect(overlay).toContainText('Open More filters');
  });

  test('Activity says what the pipeline is spending, live, and names a silent producer @action:activity.usage', async ({
    page,
    realtime,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    let spent = false;
    await mockPipelineApi(page);
    // The usage read answers more tokens once the socket says a slot reported:
    // the panel must follow the push, well inside its 10-second poll.
    await page.route(/\/api\/v1\/usage(\?.*)?$/, (route) => {
      const body = usageBody();
      if (spent) {
        (body.slots as Array<Record<string, unknown>>)[0].input_tokens = 980_000;
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    await page.goto('/activity');
    const panel = page.getByTestId('activity-usage');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    const w1 = page.getByTestId('activity-usage-slot-w1');
    await expect(w1).toContainText('opus-5');
    await expect(w1).toContainText('12.4k');
    await expect(w1).toContainText('$1.42');
    await expect(w1.getByRole('link', { name: '20260919-0800-aaa' })).toHaveAttribute(
      'href',
      /^\/work\/20260919-0800-aaa/
    );
    // A producer that reports nothing is said in words, not counted as zero.
    await expect(page.getByTestId('activity-usage-slot-w3')).toContainText(
      'no usage reported (todoq too old)'
    );
    // Today, beside the slots, and the 24-hour sparkline above them.
    await expect(page.getByTestId('activity-usage-totals')).toContainText('$18.40');
    await expect(page.getByTestId('activity-usage-totals')).toContainText('74%');
    await expect(page.getByTestId('activity-usage-spark')).toHaveAttribute(
      'aria-label',
      /Tokens per bucket over last 24 h/
    );
    // The attempt's own tokens sit beside its cost on the row that finished it.
    const finished = page.getByTestId('activity-event-9');
    await expect(finished).toContainText('$0.33');
    await expect(finished).toContainText('258k in · 1.4k out');

    await realtime.waitForOpen();
    await realtime.hello();
    spent = true;
    await realtime.event({ seq: 14, scope: 'pipeline', kind: 'usage.changed', entity: 'usage' });
    await expect(w1).toContainText('980k', { timeout: 8_000 });
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
    // The count is the Needs you list, the same number the nav badge shows,
    // and the pill opens that list.
    await expect(dock).toContainText('3 need you');
    await expect(dock.getByTestId('activity-dock-needs-you')).toHaveAttribute(
      'href',
      '/needs-you'
    );
    await dock.getByRole('button', { name: 'Live activity' }).click();
    await expect(dock.getByRole('log')).toContainText('Merged neverhuman/jeryu#99');
    await expect(dock.getByRole('log')).toContainText('Pull request merged');

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

    await page.goto('/releases?repo=jeryu%2Fjeryu-deploy');
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
    await expect(page).toHaveURL(/\/in-flight\?repo=jeryu%2Fjeryu-deploy$/);
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
      page.getByTestId('pin-jeryu/jeryu-web').getByRole('link', { name: 'bump pull request #53 is open' })
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
