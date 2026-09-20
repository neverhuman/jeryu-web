// 14-pull-room.spec.ts - W-FE-11 Pull Room smoke.

import { expect, test, type Page } from '@playwright/test';

import { AppShellPage } from './pages/AppShellPage';
import { mockBootstrap } from './fixtures/mocks';
import { controlPlane, mockPullRoom } from './fixtures/pullRoomMocks';

test.describe.configure({ retries: 1 });

async function blockWebSocket(page: Page): Promise<void> {
  await page.context().route('**/api/v1/ws', (route) =>
    route.abort('failed').catch(() => undefined)
  );
}

test('Pull requests shows every open pull request as a timeline row, filters, and keeps the board one click away @action:pull_room.timeline @action:pull_room.filters @action:pull_room.search @action:pull_room.cockpit_link', async ({
  page,
}) => {
  await blockWebSocket(page);
  await mockBootstrap(page);
  await mockPullRoom(page);

  const shell = new AppShellPage(page);
  await shell.goto('/pull-room');
  await shell.assertShellLoaded();

  await expect(page.getByTestId('pull-room-page')).toBeVisible();
  // The timeline is the page: one section per repository, and inside it the
  // newest pull request at each state of the pipeline. Both open PRs are
  // waiting on checks, so #8 is the frontier and #7 sits behind the expander.
  const section = page.getByTestId('pull-repo-alice/jeryu');
  await expect(section.getByRole('link', { name: 'alice/jeryu' })).toHaveAttribute(
    'href',
    '/repos/jeryu/alice/jeryu/pulls'
  );
  await page.getByTestId('pull-older-alice/jeryu-checks').locator('summary').click();
  const row = page.getByTestId('pull-timeline-alice/jeryu-7');
  await expect(row).toContainText('#7');
  await expect(row).toContainText('Fix BFF PR list');
  await expect(page.getByTestId('pull-stage-alice/jeryu-7-checks')).toHaveAttribute('data-status', 'pending');
  await expect(page.getByTestId('pull-stage-alice/jeryu-8-checks')).toHaveAttribute('data-status', 'blocked');
  // One sentence where three stat tiles were.
  await expect(page.getByTestId('pull-room-sentence')).toHaveText(
    '2 open · 1 waiting on checks · 1 stopped by a failing check'
  );
  await expect(page.getByText('Open pull requests across every repository.')).toBeVisible();
  await expect(page.getByText('Tooling opportunities')).toHaveCount(0);
  await expect(page.getByText(/tool clusters/i)).toHaveCount(0);

  const link = page.getByRole('link', { name: /Fix BFF PR list/ });
  await expect(link).toHaveAttribute('href', '/repos/jeryu/alice/jeryu/pulls/7');

  // The filters fold away until someone wants them, and they filter the rows.
  await expect(page.getByLabel('Search pull requests')).toBeHidden();
  await page.getByText('Filters', { exact: true }).click();
  await page.getByLabel('Search pull requests').fill('Fix');
  await expect(page.getByTestId('pull-timeline-alice/jeryu-8')).toHaveCount(0);
  await expect(row).toBeVisible();
  await page.getByLabel('Search pull requests').fill('');

  // The lane board is still there, one click away, and the URL says so.
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await expect(page).toHaveURL(/view=board/);
  await page
    .locator('section[aria-label="Pull request filters"]')
    .getByLabel('Checks')
    .selectOption('missing');
  await expect(page.getByTestId('pull-lane-missing_checks')).toBeVisible();
  // An empty lane is a header over nothing: only lanes that hold a PR render.
  await expect(page.getByTestId('pull-lane-failing_checks')).toHaveCount(0);
  await expect(page.getByTestId('pull-card-alice/jeryu-7').getByTestId('pull-card-author')).toHaveText('by alice');
  await expect(page.getByText(/W-FE-11/i)).toHaveCount(0);
});

test('Pull requests filters by family from a pill, and one repo that does not answer is one quiet line @action:pull_room.family_pills', async ({
  page,
}) => {
  await blockWebSocket(page);
  await mockBootstrap(page);
  const snapshot = controlPlane();
  snapshot.pullRequests[1].repo = 'bob/jeryu';
  snapshot.pullRequests.push({ ...snapshot.pullRequests[0], repo: 'bob/broken', number: 9, title: 'Unlisted work' });
  await mockPullRoom(page, snapshot);
  const shell = new AppShellPage(page);
  await shell.goto('/pull-room');
  await shell.assertShellLoaded();

  const pills = page.getByTestId('pull-room-families');
  await expect(pills.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(pills.getByRole('button', { name: /^core/ })).toContainText('1');
  // Repos the forge gives no family fall under "other".
  await expect(pills.getByRole('button', { name: /^other/ })).toContainText('2');
  // A repo whose list fails is named quietly; the rest of the page still works.
  await expect(page.getByText(/bob\/broken did not answer/)).toBeVisible();
  await expect(page.getByTestId('pull-timeline-alice/jeryu-7')).toBeVisible();
  await expect(page.getByTestId('pull-timeline-bob/jeryu-8')).toBeVisible();

  await pills.getByRole('button', { name: /^core/ }).click();
  await expect(page).toHaveURL(/\/pull-room\?family=core$/);
  await expect(page.getByTestId('pull-timeline-alice/jeryu-7')).toBeVisible();
  await expect(page.getByTestId('pull-timeline-bob/jeryu-8')).toHaveCount(0);
  await expect(page.getByText(/did not answer/)).toHaveCount(0);

  // A pill is a navigation: the back button undoes it.
  await page.goBack();
  await expect(page.getByTestId('pull-timeline-bob/jeryu-8')).toBeVisible();
});

test('Pull Room follows repository URLs and browser history @action:pull_room.filters', async ({ page }, testInfo) => {
  await blockWebSocket(page);
  await mockBootstrap(page);
  const snapshot = controlPlane();
  snapshot.pullRequests[1].repo = 'bob/jeryu';
  await mockPullRoom(page, snapshot);
  const shell = new AppShellPage(page);
  await shell.goto('/pull-room?repo=alice%2Fjeryu&view=queue');
  await shell.assertShellLoaded();
  const repo = page.getByRole('combobox', { name: 'Repo', exact: true });
  await expect(repo).toHaveValue('alice/jeryu');
  await expect(page.getByText('Fix BFF PR list')).toBeVisible();
  await expect(page.getByText('Repair check posture')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('open');

  await page.evaluate(() => {
    window.history.pushState(null, '', '/pull-room?repo=bob%2Fjeryu&view=queue');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(repo).toHaveValue('bob/jeryu');
  await expect(page.getByText('Repair check posture')).toBeVisible();
  await expect(page.getByText('Fix BFF PR list')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'State', exact: true })).toHaveValue('open');
  await page.goBack();
  await expect(repo).toHaveValue('alice/jeryu');
  await page.goForward();
  await expect(repo).toHaveValue('bob/jeryu');
  await repo.selectOption('all');
  await expect(page).toHaveURL(/\/pull-room\?view=queue$/);
  await expect(page.getByText('Fix BFF PR list')).toBeVisible();
  await expect(page.getByText('Repair check posture')).toBeVisible();
  await testInfo.attach('pull-room-url-navigation', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
