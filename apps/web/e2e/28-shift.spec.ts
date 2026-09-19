// 28-shift.spec.ts — Work → Queue / Add / Workers (todoq shifts).
//
// The Shift API is mocked at the browser boundary in the exact shape of the
// Phase 2 contract so the SPA routes, tab strip, admin gating and chart
// surfaces are locked without a live queue.

import { expect, test } from '@playwright/test';

import { mockBootstrap } from './fixtures/mocks';
import { NIGHT, mockShiftApi } from './fixtures/shiftMocks';

test.describe('Work shift tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().route('**/api/v1/ws', (route) => route.abort());
  });

  test('opens Work on the Queue, filter and expand a todo @action:shift.tabs @action:shift.queue_filter', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'user' } });
    await mockShiftApi(page);

    await page.goto('/work');
    const tabs = page.getByRole('navigation', { name: 'Work' });
    await expect(page).toHaveURL(/\/work\/shift$/);
    await expect(tabs.getByRole('link', { name: 'Queue' })).toHaveAttribute('aria-current', 'page');
    await expect(tabs.getByRole('link', { name: 'Tracker' })).toHaveCount(0);
    await expect(page.getByTestId('shift-queue-page')).toBeVisible();
    await expect(page.getByTestId(`shift-branch-${NIGHT}`)).toContainText('last night');
    await expect(page.getByTestId('shift-todo-20260919-0800-aaa')).toBeVisible();

    await page.getByLabel('Mode').selectOption('night');
    await expect(page.getByTestId('shift-todo-20260919-0800-aaa')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ship heartbeats' }).click();
    const detail = page.getByTestId('shift-todo-detail-20260918-2200-bbb');
    await expect(detail).toContainText('Slots POST heartbeats every 30 s.');
    await expect(detail).toContainText('landed clean');
    await expect(detail).toContainText('alton@xbabe0/w1');
    // Non-admins see no row actions and no review-PR button.
    await expect(page.getByRole('button', { name: /Open review PR/ })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0);

    await tabs.getByRole('link', { name: 'Workers' }).click();
    await expect(page).toHaveURL(/\/work\/shift\/workers$/);
    await tabs.getByRole('link', { name: 'Add' }).click();
    await expect(page.getByText('Only admins can file shift todos.')).toBeVisible();
  });

  test('admin row actions and open review PR @action:shift.row_action @action:shift.open_pr', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    const log = await mockShiftApi(page);
    await page.goto('/work/shift');
    await expect(page.getByTestId('shift-todo-20260919-0800-aaa')).toBeVisible({ timeout: 15_000 });

    // Block asks for its reason inline, never through a browser dialog.
    await page.getByRole('button', { name: 'Block 20260919-0800-aaa' }).click();
    await page.getByLabel('Reason for blocking 20260919-0800-aaa').fill('needs design');
    await page.getByRole('button', { name: 'Confirm block' }).click();
    await expect.poll(() => log.posts.length).toBe(1);
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
    await page.goto('/work/shift');
    const blocked = page.getByTestId('shift-todo-20260919-0930-ddd');
    await expect(blocked).toBeVisible({ timeout: 15_000 });
    // Blocked sorts above claimed and open work, with its failed attempts on the row.
    const first = page.locator('tbody > tr[data-testid^="shift-todo-"]').first();
    await expect(first).toHaveAttribute('data-testid', 'shift-todo-20260919-0930-ddd');
    await expect(blocked).toContainText('2 attempts · last: blocked');
    await expect(blocked.getByRole('list', { name: /blocked — needs a human/ })).toBeVisible();

    // The landed todo links to the PR that carries it, from the trace and the commit chip.
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

  test('admin files one todo and many todos @action:shift.add_single @action:shift.add_many', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    const log = await mockShiftApi(page);
    await page.goto('/work/shift/new');
    await expect(page.getByTestId('shift-add-page')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Todo', { exact: true }).fill('Fix flaky gate\n\nDetails here.');
    await page.getByLabel('Night').check();
    await page.getByRole('button', { name: 'File todo' }).click();
    await expect(page.getByTestId('shift-add-filed')).toContainText('20260919-1000-new');
    expect(log.posts[0].body).toEqual({ family: 'jeryu', text: 'Fix flaky gate\n\nDetails here.', mode: 'night' });

    await page.getByLabel(/Paste many/).check();
    await page.getByLabel('Todos', { exact: true }).fill('one\n\ntwo\n\nthree');
    await expect(page.getByTestId('shift-add-count')).toHaveText('3 todos will be filed as night.');
    await page.getByRole('button', { name: 'File 3 todos' }).click();
    await expect(page.getByTestId('shift-add-filed')).toContainText('Filed 3 todos');
    await page.getByRole('link', { name: 'View in Queue' }).click();
    await expect(page).toHaveURL(/\/work\/shift\?family=jeryu&todo=/);
    expect(log.posts[1].body).toEqual({ family: 'jeryu', texts: ['one', 'two', 'three'], mode: 'night' });
  });

  test('workers table, timeline range and capacity chart @action:shift.workers', async ({ page }) => {
    await mockBootstrap(page, { auth: { role: 'user' } });
    await mockShiftApi(page);
    await page.goto('/work/shift/workers');
    const row = page.getByTestId('shift-worker-xbabe0-w1');
    await expect(row).toContainText('healthy', { timeout: 15_000 });
    await expect(row.getByRole('link', { name: '20260919-0900-ccc' })).toHaveAttribute(
      'href',
      '/work/shift?family=jeryu&todo=20260919-0900-ccc'
    );
    await expect(page.getByTestId('shift-worker-xbabe1-w2')).toContainText('stale');
    await expect(page.getByTestId('shift-timeline').getByRole('img')).toBeVisible();
    await expect(page.getByTestId('shift-capacity').getByRole('img')).toBeVisible();
    const history = page.waitForRequest((req) => req.url().includes('/api/v1/shift/workers/history?hours=168'));
    await page.getByRole('button', { name: '7d' }).click();
    await history;
    await expect(page.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');
  });
});
