// 29-pull-timeline-release.spec.ts — the Pull requests timeline grouped the way
// work is owned: one section per repository, and inside each section ONE list
// of branches in flight — shift branches with no pull request yet, then pull
// requests — furthest from done first, with only the tail folded away.

import { expect, test, type Page } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import { mockBootstrap } from './fixtures/mocks';
import { mockPullRoom } from './fixtures/pullRoomMocks';
import {
  FOUR_CHANNELS,
  mockReleaseChannels,
  mockShiftTodos,
  shiftTodo,
  snapshotWithReleaseHistory,
} from './fixtures/releaseChannelMocks';

test.describe.configure({ retries: 1 });

/** Every row's status line in one repository's section, in DOM order. */
async function rowStatuses(page: Page, repo: string): Promise<string[]> {
  return page
    .getByTestId(`pull-repo-${repo}`)
    .locator('.pull-timeline__status')
    .allTextContents();
}

test('The timeline lists each repository as one run of rows, furthest from done first @action:pull_room.repo_states', async ({
  page,
}) => {
  const snapshot = snapshotWithReleaseHistory();
  await mockBootstrap(page);
  await mockPullRoom(page, snapshot);
  await mockShiftTodos(page, []);
  await mockReleaseChannels(page, [FOUR_CHANNELS]);

  const shell = new AppShellPage(page);
  await shell.goto('/pull-room');
  await shell.assertShellLoaded();

  // One section per repository, headed by the repository and what it holds.
  const section = page.getByTestId('pull-repo-alice/jeryu');
  await expect(section).toBeVisible();
  await expect(section.getByRole('link', { name: 'alice/jeryu' })).toHaveAttribute(
    'href',
    '/repos/jeryu/alice/jeryu/pulls'
  );
  // #14 is folded into #9, so seven pull requests are counted, not eight.
  await expect(section.locator('.pull-repo__count')).toHaveText(
    '2 in flight · 1 awaiting release · 4 released'
  );

  // No state headings and no per-state expanders: every row is in the list,
  // and each says where it is. A row past the merge names its release.
  await expect(section.locator('.pull-state__label')).toHaveCount(0);
  expect(await rowStatuses(page, 'alice/jeryu')).toEqual([
    'Waiting on checks',
    'Waiting on checks',
    'Merged · not yet released',
    'In dev · v9',
    'In canary · v8',
    'In stable · v7',
    'In prod · v6',
  ]);
  for (const number of [8, 7, 12, 11, 10, 9, 13]) {
    const row = page.getByTestId(`pull-timeline-alice/jeryu-${number}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(`#${number}`);
    // The row does not repeat the repository: the section heading says it.
    await expect(row).not.toContainText('alice/jeryu#');
  }
  // Seven rows fit: nothing is folded.
  await expect(page.getByTestId('pull-older-alice/jeryu')).toHaveCount(0);

  // Each environment's pill is said once, on the newest row it runs: #9 marks
  // stable and carries only that pill, not the whole ladder.
  await expect(page.getByTestId('pull-ladder-alice/jeryu-9-stable')).toHaveAttribute(
    'data-membership',
    'in'
  );
  await expect(page.getByTestId('pull-ladder-alice/jeryu-9-production')).toHaveCount(0);
  await expect(section.locator('[data-testid$="-production"].pull-ladder__pip')).toHaveCount(1);
  await expect(page.getByTestId('pull-stage-alice/jeryu-9-released')).toContainText('stable · v7');

  // The page says how big the release manifest is.
  await expect(page.getByTestId('pull-room-sentence')).toContainText('1 merged, not yet released');

  // A closed pull request another one carried is a line on its successor, not
  // a row of its own.
  await expect(page.getByTestId('pull-timeline-alice/jeryu-14')).toHaveCount(0);
  await expect(page.getByTestId('pull-timeline-alice/jeryu-9')).toContainText('supersedes #14');
});

test('A repository that records no release says so instead of calling merged work unreleased @action:pull_room.repo_states', async ({
  page,
}) => {
  const snapshot = snapshotWithReleaseHistory();
  await mockBootstrap(page);
  await mockPullRoom(page, snapshot);
  await mockShiftTodos(page, []);
  // No fixture for alice/jeryu: no deployment and no tag.
  await mockReleaseChannels(page, []);

  const shell = new AppShellPage(page);
  await shell.goto('/pull-room');
  await shell.assertShellLoaded();

  // With no release to place them by, every merged row says exactly that —
  // not "merged, not yet released", which would be a claim about a release
  // process this repository does not have — and the count does not call it
  // released either.
  expect(await rowStatuses(page, 'alice/jeryu')).toEqual([
    'Waiting on checks',
    'Waiting on checks',
    'Merged · no release recorded',
    'Merged · no release recorded',
    'Merged · no release recorded',
    'Merged · no release recorded',
    'Merged · no release recorded',
  ]);
  await expect(page.getByTestId('pull-repo-alice/jeryu').locator('.pull-repo__count')).toHaveText(
    '2 in flight · 5 merged, release unknown'
  );
  // And it says why, rather than leaving the reader to guess.
  await expect(page.getByTestId('pull-status-alice/jeryu-9')).toHaveAttribute(
    'title',
    'no deployment and no release tag'
  );
  // The newest stands for the five, which only a release would move; the other
  // four are history.
  await expect(page.getByTestId('pull-waiting-alice/jeryu-9')).toHaveText(' + 4 more waiting');
  await expect(page.getByTestId('pull-timeline-alice/jeryu-13')).toBeHidden();
  await page.getByTestId('pull-older-alice/jeryu').locator('summary').click();
  await expect(page.getByTestId('pull-timeline-alice/jeryu-13')).toBeVisible();

  // Still folded into its successor, release history or not.
  await expect(page.getByTestId('pull-timeline-alice/jeryu-14')).toHaveCount(0);
});

test('Shift work on a branch is one row per branch in its repository; queued todos stay on Work @action:pull_room.ghost_rows', async ({
  page,
}) => {
  await mockBootstrap(page);
  await mockPullRoom(page);
  await mockReleaseChannels(page, []);
  await mockShiftTodos(page, [
    shiftTodo('t-claimed', {
      status: 'claimed',
      claim_by: 'alice@xbabe0/w2',
      lease_until: new Date(Date.now() + 20 * 60_000).toISOString(),
      lease_live: true,
      worked_by: [
        {
          by: 'alice@xbabe0',
          host: 'xbabe0',
          slot: 'w2',
          model: 'claude-opus-5',
          session: null,
          started: '2026-06-05T00:00:00Z',
          ended: null,
          outcome: 'running',
          cost_usd: null,
          note: '',
          shift: 'bulletshift/2026-06-05',
        },
      ],
    }),
    shiftTodo('t-done-no-pr', { status: 'done', commits: { jeryu: 'abc' } }),
    shiftTodo('t-open-1'),
    shiftTodo('t-open-2'),
    shiftTodo('t-has-pr', {
      status: 'done',
      pr: { repo: 'jeryu', number: 7, state: 'open', url: '/x' },
    }),
  ]);

  const shell = new AppShellPage(page);
  await shell.goto('/pull-room');
  await shell.assertShellLoaded();

  // The two todos on the shift's branch are one row, in the repository they
  // name, on the same track as the pull requests — and ahead of them.
  const section = page.getByTestId('pull-repo-alice/jeryu');
  const branch = page.getByTestId('pull-branch-alice/jeryu-bulletshift/2026-06-05');
  await expect(branch).toContainText('bulletshift/2026-06-05 · 2 todos');
  await expect(branch).toContainText('1 working · alice@xbabe0/w2');
  await expect(branch).toHaveAttribute('data-status', 'active');
  await expect(section.locator('.pull-timeline__rows > li').first()).toHaveAttribute(
    'data-testid',
    'pull-branch-alice/jeryu-bulletshift/2026-06-05'
  );
  await expect(section.getByText('Queued / in flight')).toHaveCount(0);

  // Its todos fold under it, each with a truthful "when".
  await expect(branch.getByTestId('pull-ghost-t-claimed')).toBeHidden();
  await branch.locator('summary').click();
  await expect(branch.getByTestId('pull-ghost-t-claimed')).toContainText('hands off in');
  await expect(branch.getByTestId('pull-ghost-t-done-no-pr')).toContainText('PR pending');

  // Queued todos have no branch yet: they are the Work page's, only counted here.
  await expect(page.getByTestId('pull-ghost-t-open-1')).toHaveCount(0);
  const queue = page.getByTestId('pull-shift-queue');
  await expect(queue).toContainText('2 in flight · 2 queued');
  await expect(queue.getByRole('link', { name: /Work/ })).toHaveAttribute(
    'href',
    '/work?family=core'
  );

  // A todo that already has a pull request is not also a branch row.
  await expect(page.getByTestId('pull-ghost-t-has-pr')).toHaveCount(0);

  // The real pull requests follow in the same list, with no expander between them.
  await expect(page.getByTestId('pull-timeline-alice/jeryu-8')).toBeVisible();
  await expect(page.getByTestId('pull-timeline-alice/jeryu-7')).toBeVisible();
});
