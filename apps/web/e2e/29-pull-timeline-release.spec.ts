// 29-pull-timeline-release.spec.ts — the Pull requests timeline grouped the way
// work is owned: shift work with no pull request yet on top, then one section
// per repository, and inside each section one row per state of the pipeline —
// least far first, the newest change at each state, the rest folded away.

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

async function blockWebSocket(page: Page): Promise<void> {
  await page.context().route('**/api/v1/ws', (route) =>
    route.abort('failed').catch(() => undefined)
  );
}

/** Every state heading of one repository's section, in DOM order. */
async function stateLabels(page: Page, repo: string): Promise<string[]> {
  return page.getByTestId(`pull-repo-${repo}`).locator('.pull-state__label').allTextContents();
}

test('The timeline groups by repository and shows the newest change at each state of the pipeline @action:pull_room.repo_states', async ({
  page,
}) => {
  const snapshot = snapshotWithReleaseHistory();
  await blockWebSocket(page);
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
  // #14 is folded into #9, so the section counts seven, not eight.
  await expect(section.locator('.pull-repo__count')).toHaveText(
    '7 PRs · 2 open · 1 older behind the states'
  );

  // The state blocks read top to bottom as the pipeline itself, and a state
  // past the merge names the release that carries it.
  expect(await stateLabels(page, 'alice/jeryu')).toEqual([
    'Waiting on checks',
    'Merged · not yet released',
    'In dev · v9',
    'In canary · v8',
    'In stable · v7',
    'In prod · v6',
  ]);

  // Each state shows exactly one row: the most recent PR that got that far.
  const frontier: [string, number][] = [
    ['checks', 8],
    ['merged', 12],
    ['dev', 11],
    ['canary', 10],
    ['stable', 9],
    ['production', 13],
  ];
  for (const [state, number] of frontier) {
    const block = page.getByTestId(`pull-state-alice/jeryu-${state}`);
    await expect(block.locator(':scope > ol > li')).toHaveCount(1);
    const row = block.getByTestId(`pull-timeline-alice/jeryu-${number}`);
    await expect(row).toBeVisible();
    // The row no longer repeats the repository: the section heading says it.
    await expect(row).toContainText(`#${number}`);
    await expect(row).not.toContainText('alice/jeryu#');
  }

  // Older work at the same state is behind that state's one expander. #7 is
  // waiting on checks too, but #8 is the newer one.
  const older = page.getByTestId('pull-older-alice/jeryu-checks');
  await expect(older.locator('summary')).toHaveText('+ 1 older at this state');
  await expect(page.getByTestId('pull-timeline-alice/jeryu-7')).toBeHidden();
  await older.locator('summary').click();
  await expect(page.getByTestId('pull-timeline-alice/jeryu-7')).toBeVisible();
  // A state with a single row has no expander at all.
  await expect(page.getByTestId('pull-older-alice/jeryu-production')).toHaveCount(0);

  // The released stage is a ladder: filled as far as the change has got.
  await expect(page.getByTestId('pull-ladder-alice/jeryu-9-stable')).toHaveAttribute(
    'data-membership',
    'in'
  );
  await expect(page.getByTestId('pull-ladder-alice/jeryu-9-production')).toHaveAttribute(
    'data-membership',
    'out'
  );
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
  await blockWebSocket(page);
  await mockBootstrap(page);
  await mockPullRoom(page, snapshot);
  await mockShiftTodos(page, []);
  // No fixture for alice/jeryu: no deployment and no tag.
  await mockReleaseChannels(page, []);

  const shell = new AppShellPage(page);
  await shell.goto('/pull-room');
  await shell.assertShellLoaded();

  // With no release to place them by, every merged row sits at one state that
  // says exactly that — not at "merged, not yet released", which would be a
  // claim about a release process this repository does not have.
  const unrecorded = page.getByTestId('pull-state-alice/jeryu-unrecorded');
  await expect(unrecorded.locator('.pull-state__label')).toHaveText(
    'Merged · no release recorded'
  );
  // And it says why, rather than leaving the reader to guess.
  await expect(unrecorded.locator('.pull-state__hint')).toHaveText(
    'no deployment and no release tag'
  );
  await expect(page.getByTestId('pull-state-alice/jeryu-merged')).toHaveCount(0);
  expect(await stateLabels(page, 'alice/jeryu')).toEqual([
    'Waiting on checks',
    'Merged · no release recorded',
  ]);

  // The newest merged PR leads; the four behind it are folded.
  await expect(unrecorded.getByTestId('pull-timeline-alice/jeryu-9')).toBeVisible();
  const older = page.getByTestId('pull-older-alice/jeryu-unrecorded');
  await expect(older.locator('summary')).toHaveText('+ 4 older at this state');
  await expect(page.getByTestId('pull-timeline-alice/jeryu-13')).toBeHidden();
  await older.locator('summary').click();
  await expect(page.getByTestId('pull-timeline-alice/jeryu-13')).toBeVisible();

  // Still folded into its successor, release history or not.
  await expect(page.getByTestId('pull-timeline-alice/jeryu-14')).toHaveCount(0);
});

test('Shift work with no pull request yet sits above the repositories, with a truthful "when" @action:pull_room.ghost_rows', async ({
  page,
}) => {
  await blockWebSocket(page);
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
    shiftTodo('t-open-3'),
    shiftTodo('t-open-4'),
    shiftTodo('t-has-pr', {
      status: 'done',
      pr: { repo: 'jeryu', number: 7, state: 'open', url: '/x' },
    }),
  ]);

  const shell = new AppShellPage(page);
  await shell.goto('/pull-room');
  await shell.assertShellLoaded();

  const band = page.getByTestId('pull-ghosts-bulletshift/2026-06-05');
  await expect(band).toContainText('bulletshift 2026-06-05');
  await expect(band).toContainText('in flight');

  // Claimed work reports its lease, not an invented arrival time.
  const claimed = page.getByTestId('pull-ghost-t-claimed');
  await expect(claimed).toContainText('no pull request yet');
  await expect(claimed).toContainText('hands off in');
  await expect(claimed).toContainText('alice@xbabe0/w2');

  // Finished work with no pull request is the row worth seeing.
  await expect(page.getByTestId('pull-ghost-t-done-no-pr')).toContainText('PR pending');

  // Only the first few of the open queue; the rest are a link to Work.
  await expect(page.getByTestId('pull-ghost-t-open-1')).toContainText('next up');
  await expect(page.getByTestId('pull-ghost-t-open-4')).toHaveCount(0);
  await expect(band.getByRole('link', { name: /queued/ })).toHaveAttribute(
    'href',
    '/work?family=core'
  );

  // A todo that already has a pull request is not also a ghost.
  await expect(page.getByTestId('pull-ghost-t-has-pr')).toHaveCount(0);

  // The ghosts lead the page; the repository sections follow.
  const sections = page.locator('[data-testid="pull-timeline"] > section');
  expect(await sections.first().getAttribute('data-testid')).toBe(
    'pull-ghosts-bulletshift/2026-06-05'
  );
  expect(await sections.last().getAttribute('data-testid')).toBe('pull-repo-alice/jeryu');

  // The real pull requests still render below: #8 is the frontier of the
  // checks state, with #7 behind its expander.
  await expect(page.getByTestId('pull-timeline-alice/jeryu-8')).toBeVisible();
  await expect(page.getByTestId('pull-older-alice/jeryu-checks')).toContainText(
    '+ 1 older at this state'
  );
});
