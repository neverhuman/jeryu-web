// 28-shift.spec.ts — Work, one page: add work, who is working, the queue.
//
// The Shift API is mocked at the browser boundary in the exact shape of the
// Phase 2 contract so the page, its family filter, admin gating and chart
// surfaces are locked without a live queue.

import { expect, test } from '@playwright/test';

import { mockBootstrap } from './fixtures/mocks';
import { NIGHT, mockShiftApi } from './fixtures/shiftMocks';

test.describe('Work, one page', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().route('**/api/v1/ws', (route) => route.abort());
  });

  test('Work is one page: composer, workers line, queue; old addresses land on it @action:shift.tabs @action:shift.queue_filter', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'user' } });
    await mockShiftApi(page);

    await page.goto('/work');
    await expect(page).toHaveURL(/\/work$/);
    await expect(page.getByRole('navigation', { name: 'Work' })).toHaveCount(0);
    await expect(page.getByTestId('shift-queue-page')).toBeVisible();
    // Add work, then who is working, then the queue, in that order down the page.
    await expect(page.getByTestId('shift-todo-20260919-0800-aaa')).toBeVisible({ timeout: 15_000 });
    const order = await page
      .locator('#add, #workers, [data-testid="shift-todo-20260919-0800-aaa"]')
      .evaluateAll((nodes) => nodes.map((node) => node.id || 'queue'));
    expect(order).toEqual(['add', 'workers', 'queue']);
    await expect(page.getByTestId(`shift-branch-${NIGHT}`)).toContainText('last night');

    // What is live is the page; finished todos and finished shifts fold away.
    const finished = page.getByTestId('shift-finished-todos');
    await expect(finished).toContainText('1 finished todo');
    await expect(page.getByTestId('shift-todo-20260918-2200-bbb')).toBeHidden();
    await expect(page.getByTestId('shift-finished-shifts')).toContainText('1 finished shift');
    await expect(page.getByRole('columnheader', { name: 'Requested by' })).toHaveCount(0);

    // The six selects fold behind More filters.
    await expect(page.getByLabel('Mode')).toBeHidden();
    await page.getByText('More filters').click();
    await page.getByLabel('Mode').selectOption('night');
    await expect(page.getByTestId('shift-todo-20260919-0800-aaa')).toHaveCount(0);
    await finished.getByText('1 finished todo').click();
    await page.getByRole('button', { name: 'Ship heartbeats' }).click();
    const detail = page.getByTestId('shift-todo-detail-20260918-2200-bbb');
    await expect(detail).toContainText('Slots POST heartbeats every 30 s.');
    await expect(detail).toContainText('landed clean');
    await expect(detail).toContainText('alton@xbabe0/w1');
    // Non-admins see no row actions, no review-PR button, and why they cannot file.
    await expect(page.getByRole('button', { name: /Open review PR/ })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Action' })).toHaveCount(0);
    await expect(page.getByTestId('work-composer-readonly')).toContainText('Only admins can file todos');

    // The three old addresses are this page, query string kept.
    await page.goto('/work/shift?family=jeryu&todo=20260919-0900-ccc');
    await expect(page).toHaveURL(/\/work\?family=jeryu&todo=20260919-0900-ccc$/);
    await page.goto('/work/shift/workers?family=jeryu');
    await expect(page).toHaveURL(/\/work\?family=jeryu#workers$/);
    await expect(page.getByTestId('shift-workers-panel')).toBeVisible();
    await page.goto('/work/shift/new');
    await expect(page).toHaveURL(/\/work#add$/);
  });

  test('every family is listed, and a pill on a row filters the whole page @action:shift.family_pill', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockShiftApi(page);
    await page.goto('/work');
    const jain = page.getByTestId('shift-todo-20260919-0940-eee');
    await expect(jain).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('shift-todo-20260919-0800-aaa')).toBeVisible();
    const strip = page.getByRole('group', { name: 'Filter by family' });
    await expect(strip.getByRole('button', { name: /^All 4$/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(strip.getByRole('button', { name: /^jeryu 3$/ })).toBeVisible();

    // The pill is the first thing in the row.
    await expect(jain.locator('td').first().getByRole('button', { name: 'Show only jain' })).toBeVisible();
    await jain.getByRole('button', { name: 'Show only jain' }).click();
    await expect(page).toHaveURL(/\/work\?family=jain$/);
    await expect(page.getByTestId('shift-todo-20260919-0800-aaa')).toHaveCount(0);
    await expect(page.getByTestId(`shift-branch-${NIGHT}`)).toHaveCount(0);
    // The composer follows the filter, and can still be pointed elsewhere.
    await expect(page.getByLabel('Family', { exact: true })).toHaveValue('jain');

    // The same pill again, or All, shows every family.
    await jain.getByRole('button', { name: /^Showing only jain/ }).click();
    await expect(page).toHaveURL(/\/work$/);
    await expect(page.getByTestId('shift-todo-20260919-0800-aaa')).toBeVisible();
    await strip.getByRole('button', { name: /^jeryu 3$/ }).click();
    await expect(jain).toHaveCount(0);
    await strip.getByRole('button', { name: /^All 4$/ }).click();
    await expect(jain).toBeVisible();
  });

  test('admin row actions and open review PR @action:shift.row_action @action:shift.open_pr', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    const log = await mockShiftApi(page);
    await page.goto('/work');
    await expect(page.getByTestId('shift-todo-20260919-0800-aaa')).toBeVisible({ timeout: 15_000 });

    // Block asks for its reason inline, never through a browser dialog.
    await page.getByRole('button', { name: 'Block 20260919-0800-aaa' }).click();
    await page.getByLabel('Reason for blocking 20260919-0800-aaa').fill('needs design');
    await page.getByRole('button', { name: 'Confirm block' }).click();
    await expect.poll(() => log.posts.length).toBe(1);
    // Priority and now/night are adjustments: they live in the opened row.
    await expect(page.getByLabel('Priority for 20260919-0800-aaa')).toHaveCount(0);
    await page.getByRole('button', { name: 'Fix cache key' }).click();
    await page.getByLabel('Priority for 20260919-0800-aaa').selectOption('1');
    await expect.poll(() => log.posts.length).toBe(2);
    await page.getByRole('button', { name: 'Release 20260919-0900-ccc' }).click();
    await expect.poll(() => log.posts.length).toBe(3);
    expect(log.posts.map((p) => p.body)).toEqual([
      { action: 'block', note: 'needs design' },
      { action: 'priority', value: 1 },
      { action: 'release' },
    ]);
    expect(log.posts[0].path).toBe('/api/v1/shift/todos/jeryu/20260919-0800-aaa/action');

    await page.getByRole('button', { name: `Open review PR for ${NIGHT}` }).click();
    await expect(page.getByRole('link', { name: 'jeryu-deploy#41' })).toBeVisible();
    expect(log.posts[3]).toEqual({ path: '/api/v1/shift/shifts/jeryu/pr', body: { branch: NIGHT } });
  });

  test('todos that wait on a person come first, and a row traces queue to release @action:shift.needs_human @action:shift.lifecycle', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'user' } });
    await mockShiftApi(page);
    await page.goto('/work');
    const blocked = page.getByTestId('shift-todo-20260919-0930-ddd');
    await expect(blocked).toBeVisible({ timeout: 15_000 });
    // Blocked sorts above claimed and open work, with its failed attempts on the row.
    const first = page.locator('tbody > tr[data-testid^="shift-todo-"]').first();
    await expect(first).toHaveAttribute('data-testid', 'shift-todo-20260919-0930-ddd');
    await expect(blocked).toContainText('2 attempts · last: blocked');
    // Why it is stuck is on the row, not behind a click.
    await expect(blocked.getByTestId('shift-why-20260919-0930-ddd')).toContainText(
      'The jeryu-core tag split.7 does not exist.'
    );
    await expect(blocked.getByRole('list', { name: /blocked — needs a human/ })).toBeVisible();

    // The landed todo links to the PR that carries it, from the trace and the commit chip.
    await page.getByTestId('shift-finished-todos').getByText('1 finished todo').click();
    const done = page.getByTestId('shift-todo-20260918-2200-bbb');
    await expect(done.getByRole('list', { name: /PR #41, Merged, Released not yet/ })).toBeVisible();
    await expect(done.getByRole('link', { name: 'PR #41' })).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-deploy/pulls/41'
    );
    await expect(done.getByRole('link', { name: /^jeryu-deploy@/ })).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-deploy/pulls/41'
    );

    const toggle = page.getByTestId('shift-needs-human');
    await expect(toggle).toContainText('1 needs a human');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('shift-todo-20260918-2200-bbb')).toHaveCount(0);
    await expect(blocked).toBeVisible();
  });

  test('admin files one todo from the one-line composer, and many from the opened form @action:shift.add_single @action:shift.add_many', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    const log = await mockShiftApi(page);
    await page.goto('/work');
    const composer = page.getByRole('region', { name: 'Add work' });
    await expect(composer).toBeVisible({ timeout: 15_000 });

    // One row: family, night by default, one line, one filled button that waits for text.
    await expect(composer.getByLabel('Family', { exact: true })).toHaveValue('jeryu');
    await expect(composer.getByLabel('Night')).toBeChecked();
    const file = composer.getByRole('button', { name: 'File todo' });
    await expect(file).toBeDisabled();
    await expect(composer.getByLabel(/Paste many/)).toBeHidden();
    // Stepping into the line opens the full form in place, cursor in the text.
    await composer.getByLabel('What should be done?').click();
    await expect(composer.getByLabel('Todo', { exact: true })).toBeFocused();
    await composer.getByLabel('Todo', { exact: true }).fill('Fix flaky gate');
    await file.click();
    await expect(page).toHaveURL(/\/work\?todo=20260919-1000-new$/);
    expect(log.posts[0].body).toEqual({ family: 'jeryu', text: 'Fix flaky gate', mode: 'night' });
    // Filed: the composer is one empty line again.
    await expect(composer.getByLabel('What should be done?')).toHaveValue('');
    await expect(composer.getByLabel(/Paste many/)).toBeHidden();

    await composer.getByRole('button', { name: 'More' }).click();
    await composer.getByLabel('Family', { exact: true }).selectOption('jain');
    await composer.getByLabel(/Paste many/).check();
    await composer.getByLabel('Todos', { exact: true }).fill('one\n\ntwo\n\nthree');
    await expect(page.getByTestId('shift-add-count')).toHaveText('3 todos will be filed as night for jain.');
    await composer.getByRole('button', { name: 'File 3 todos' }).click();
    await expect(page).toHaveURL(/\/work\?todo=20260919-1000-n0/);
    expect(log.posts[1].body).toEqual({ family: 'jain', texts: ['one', 'two', 'three'], mode: 'night' });
  });

  test('palette: Add work puts the cursor in the composer @action:shift.add_palette', async ({ page }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockShiftApi(page);
    await page.goto('/needs-you');
    await page.getByRole('button', { name: /^Search or jump to/ }).click();
    await page.getByRole('combobox', { name: 'Command palette' }).fill('Add work');
    await page.getByRole('option', { name: 'Add work' }).click();
    await expect(page).toHaveURL(/\/work#add$/);
    await expect(page.getByRole('region', { name: 'Add work' }).getByLabel('Todo', { exact: true })).toBeFocused();
  });

  test('workers: one line that opens to the table, timeline and capacity chart @action:shift.workers', async ({ page }) => {
    await mockBootstrap(page, { auth: { role: 'user' } });
    await mockShiftApi(page);
    await page.goto('/work');
    const workers = page.getByTestId('work-workers');
    const summary = page.getByTestId('work-workers-summary');
    await expect(summary).toContainText('1 of 2 slots healthy', { timeout: 15_000 });
    await expect(summary).toContainText('1 working');
    await expect(summary.getByRole('link', { name: /Claimed refactor/ })).toHaveAttribute(
      'href',
      '/work?family=jeryu&todo=20260919-0900-ccc'
    );
    await expect(workers.getByRole('img', { name: 'Busy worker slots over the last 24 hours' })).toBeVisible();
    await expect(page.getByTestId('shift-workers-panel')).toHaveCount(0);

    await workers.getByRole('button', { name: 'Workers' }).click();
    const row = page.getByTestId('shift-worker-xbabe0-w1');
    await expect(row).toContainText('healthy');
    await expect(row.getByRole('link', { name: '20260919-0900-ccc' })).toHaveAttribute(
      'href',
      '/work?family=jeryu&todo=20260919-0900-ccc'
    );
    await expect(page.getByTestId('shift-worker-xbabe1-w2')).toContainText('stale');
    await expect(page.getByTestId('shift-timeline').getByRole('img')).toBeVisible();
    await expect(page.getByTestId('shift-capacity').getByRole('img')).toBeVisible();
    const history = page.waitForRequest((req) => req.url().includes('/api/v1/shift/workers/history?hours=168'));
    await page.getByRole('button', { name: '7d' }).click();
    await history;
    await expect(page.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');

    // Open stays open across a reload; the line is still there to close it.
    await page.reload();
    await expect(page.getByTestId('shift-workers-panel')).toBeVisible({ timeout: 15_000 });
  });
});
