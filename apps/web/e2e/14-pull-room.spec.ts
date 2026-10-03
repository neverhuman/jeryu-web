// 14-pull-room.spec.ts - W-FE-11 Pull Room smoke.

import { expect, test } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import { mockBootstrap, mockRepoList } from './fixtures/mocks';
import { controlPlane, mockPullRoom, truncatedSnapshot } from './fixtures/pullRoomMocks';

test.describe.configure({ retries: 1 });

test('Pull requests shows every open pull request as a timeline row, filters, and keeps the board one click away @action:pull_room.timeline @action:pull_room.filters @action:pull_room.search @action:pull_room.cockpit_link', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockPullRoom(page);

  const shell = new AppShellPage(page);
  await shell.goto('/pull-room');
  await shell.assertShellLoaded();

  await expect(page.getByTestId('pull-room-page')).toBeVisible();
  // The timeline is the page: one section per repository, and inside it one
  // list of every pull request, furthest from done first. Both open PRs are
  // waiting on checks, and both are in view without opening anything.
  const section = page.getByTestId('pull-repo-alice/jeryu');
  await expect(section.getByRole('link', { name: 'alice/jeryu' })).toHaveAttribute(
    'href',
    '/repos/jeryu/alice/jeryu/pulls'
  );
  const row = page.getByTestId('pull-timeline-alice/jeryu-7');
  await expect(row).toContainText('#7');
  await expect(row).toContainText('Fix BFF PR list');
  await expect(page.getByTestId('pull-stage-alice/jeryu-7-checks')).toHaveAttribute('data-status', 'pending');
  await expect(page.getByTestId('pull-stage-alice/jeryu-8-checks')).toHaveAttribute('data-status', 'blocked');
  // One sentence where three stat tiles were.
  await expect(page.getByTestId('pull-room-sentence')).toHaveText(
    '2 open · 1 waiting on checks · 1 stopped by a failing check'
  );
  await expect(page.getByText('Every change between claimed work and release, across every repository.')).toBeVisible();
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
  await expect(page).toHaveURL(/\/in-flight\?family=core$/);
  await expect(page.getByTestId('pull-timeline-alice/jeryu-7')).toBeVisible();
  await expect(page.getByTestId('pull-timeline-bob/jeryu-8')).toHaveCount(0);
  await expect(page.getByText(/did not answer/)).toHaveCount(0);

  // A pill sets the shell-wide family scope: it replaces the address rather
  // than stacking one, and the tab keeps the family across a reload. The
  // chip's × in the header asks for every family again.
  await page.reload();
  await expect(page).toHaveURL(/\/in-flight\?family=core$/);
  await expect(page.getByTestId('pull-timeline-bob/jeryu-8')).toHaveCount(0);
  await page.getByTestId('family-scope-clear').click();
  await expect(page).toHaveURL(/\/in-flight$/);
  await expect(page.getByTestId('pull-timeline-bob/jeryu-8')).toBeVisible();
});

test('Pull Room follows repository URLs and browser history @action:pull_room.filters', async ({ page }, testInfo) => {
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
  const state = page.getByRole('combobox', { name: 'State', exact: true });
  // A filter is in the URL, and it replaces: the address says 'open' and the
  // history entry it is on carries it.
  await state.selectOption('open');
  await expect(page).toHaveURL(/state=open/);

  // A link decides the whole view, so one that names no state shows none.
  await page.evaluate(() => {
    window.history.pushState(null, '', '/in-flight?repo=bob%2Fjeryu&view=queue');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(repo).toHaveValue('bob/jeryu');
  await expect(page.getByText('Repair check posture')).toBeVisible();
  await expect(page.getByText('Fix BFF PR list')).toHaveCount(0);
  await expect(state).toHaveValue('active');
  await page.goBack();
  await expect(repo).toHaveValue('alice/jeryu');
  await expect(state).toHaveValue('open');
  await page.goForward();
  await expect(repo).toHaveValue('bob/jeryu');
  await expect(state).toHaveValue('active');
  await repo.selectOption('all');
  await expect(page).toHaveURL(/\/in-flight\?view=queue$/);
  await expect(page.getByText('Fix BFF PR list')).toBeVisible();
  await expect(page.getByText('Repair check posture')).toBeVisible();
  await testInfo.attach('pull-room-url-navigation', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('Pull requests reads every open pull request out of a paged snapshot, and every family has a toggle @action:pull_room.family_pills', async ({
  page,
}, testInfo) => {
  // 509 pull requests, 22 of them open in the repositories that sort last by
  // name, and a page that holds 100 rows: the count in the header is the
  // server's, and the family bar is the repository list's, so neither can be
  // talked down to zero by a page boundary.
  const OPEN = ['root/jankurai-one', 'veox-ai/jekko', 'veox/redline'];
  const snapshot = truncatedSnapshot({ total: 509, open: 22, limit: 100 }, OPEN);
  await mockBootstrap(page);
  await mockPullRoom(page, snapshot);
  // Registered after the snapshot mock so this repository list wins: every
  // family the forge knows, including the ones with nothing open.
  await mockRepoList(page, [
    { id: { host: 'jeryu', owner: 'root', name: 'jankurai-one' }, family: 'jankurai', open_pull_requests: 8 },
    { id: { host: 'jeryu', owner: 'veox-ai', name: 'jekko' }, family: 'jekko', open_pull_requests: 7 },
    { id: { host: 'jeryu', owner: 'veox', name: 'redline' }, family: 'redline', open_pull_requests: 7 },
    { id: { host: 'jeryu', owner: 'jeryu', name: 'core' }, family: 'jeryu-split', open_pull_requests: 0 },
    { id: { host: 'jeryu', owner: 'veox', name: 'tooling' }, family: 'tooling', open_pull_requests: 0 },
  ]);

  const shell = new AppShellPage(page);
  await shell.goto('/pull-room?view=board');
  await shell.assertShellLoaded();

  // The header is the server's summary, not a count of the rows on this page.
  await expect(page.getByTestId('pull-room-sentence')).toHaveText(
    '22 open · 22 waiting on checks · 0 stopped by a failing check'
  );
  const pills = page.getByTestId('pull-room-families');
  await expect(pills.getByRole('button', { name: /^All/ })).toContainText('22');
  await expect(pills.getByRole('button', { name: /^jankurai/ })).toContainText('8');
  await expect(pills.getByRole('button', { name: /^jekko/ })).toContainText('7');
  await expect(pills.getByRole('button', { name: /^redline/ })).toContainText('7');
  // A family with nothing open keeps its toggle, at 0, and is selectable.
  await expect(pills.getByRole('button', { name: /^jeryu/ })).toContainText('0');
  await expect(pills.getByRole('button', { name: /^tooling/ })).toContainText('0');

  // Every open pull request is on the board, in all three repositories.
  await expect(page.getByTestId(/^pull-card-.+-\d+$/)).toHaveCount(22);
  for (const [repo, cards] of [
    [OPEN[0], 8],
    [OPEN[1], 7],
    [OPEN[2], 7],
  ] as const) {
    await expect(page.getByTestId(new RegExp(`^pull-card-${repo}-\\d+$`))).toHaveCount(cards);
  }
  // What the page could not fetch is stated, not dropped.
  await expect(page.getByTestId('pull-room-truncated')).toContainText(
    'showing 100 of 509 pull requests'
  );

  // Selecting a family scopes the page through `?family=`.
  await pills.getByRole('button', { name: /^tooling/ }).click();
  await expect(page).toHaveURL(/\/in-flight\?view=board&family=tooling$/);
  await expect(page.getByTestId('pull-room-sentence')).toHaveText(
    '0 open · 0 waiting on checks · 0 stopped by a failing check'
  );
  await pills.getByRole('button', { name: /^jekko/ }).click();
  await expect(page).toHaveURL(/family=jekko$/);
  await expect(page.getByTestId('pull-room-sentence')).toHaveText(
    '7 open · 7 waiting on checks · 0 stopped by a failing check'
  );
  await testInfo.attach('pull-room-family-bar', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
