// 29-pull-timeline-release.spec.ts — the Pull requests timeline as one time
// axis: shift work that has no pull request yet, open rows, then merged work
// banded by how far out it has shipped, down to what production runs.

import { expect, test, type Page } from '@playwright/test';

import { AppShellPage } from './pages/AppShellPage';
import { mockBootstrap } from './fixtures/mocks';
import { controlPlane, mockPullRoom } from './fixtures/pullRoomMocks';
import {
  mockReleaseChannels,
  mockShiftTodos,
  shiftTodo,
} from './fixtures/releaseChannelMocks';

test.describe.configure({ retries: 1 });

async function blockWebSocket(page: Page): Promise<void> {
  await page.context().route('**/api/v1/ws', (route) =>
    route.abort('failed').catch(() => undefined)
  );
}

/** The snapshot's two open PRs, plus merged work at every rung of the ladder. */
function snapshotWithHistory(): ReturnType<typeof controlPlane> {
  const snapshot = controlPlane();
  const merged = (number: number, title: string, state = 'merged') => ({
    ...snapshot.pullRequests[0],
    number,
    title,
    state,
    headRef: `feature/${number}`,
    headSha: `head-${number}`,
    baseSha: `base-${number}`,
    checks: { total: 2, queued: 0, running: 0, failing: 0, successful: 2, missing: false },
  });
  snapshot.pullRequests.push(
    merged(9, 'Reached stable'),
    merged(10, 'Reached canary'),
    merged(11, 'Reached dev only'),
    merged(12, 'Merged, shipped nowhere'),
    merged(13, 'Settled in production'),
    merged(14, 'First attempt, superseded by #9', 'closed')
  );
  return snapshot;
}

test('The timeline bands merged work by release channel and keeps settled history behind one line @action:pull_room.release_bands', async ({
  page,
}) => {
  const snapshot = snapshotWithHistory();
  await blockWebSocket(page);
  await mockBootstrap(page);
  await mockPullRoom(page, snapshot);
  await mockShiftTodos(page, []);
  await mockReleaseChannels(page, [
    {
      repo: 'alice/jeryu',
      channels: {
        dev: { sha: 'dep-dev', release: 'v9' },
        canary: { sha: 'dep-canary', release: 'v8' },
        stable: { sha: 'dep-stable', release: 'v7' },
        production: { sha: 'dep-prod', release: 'v6' },
      },
      // What each environment lacks. Deeper environments lack strictly more.
      missing: {
        dev: ['head-12'],
        canary: ['head-12', 'head-11'],
        stable: ['head-12', 'head-11', 'head-10'],
        production: ['head-12', 'head-11', 'head-10', 'head-9'],
      },
    },
  ]);

  const shell = new AppShellPage(page);
  await shell.goto('/pull-room');
  await shell.assertShellLoaded();

  // The manifest — merged, shipped nowhere — is open, and it is what the
  // release step reads.
  const pending = page.getByTestId('pull-band-pending');
  await expect(pending).toContainText('Merged · not yet released');
  await expect(pending).toHaveAttribute('open', '');
  await expect(pending).toContainText('Merged, shipped nowhere');

  // One band per rung, each naming the release that carries it.
  await expect(page.getByTestId('pull-band-dev')).toContainText('In dev, not yet canary');
  await expect(page.getByTestId('pull-band-dev')).toContainText('v9');
  await expect(page.getByTestId('pull-band-canary')).toContainText('In canary, not yet stable');
  await expect(page.getByTestId('pull-band-stable')).toContainText('In stable, not yet prod');

  // Everything production runs is settled: one collapsed line until clicked.
  const settled = page.getByTestId('pull-band-production');
  await expect(settled).toContainText('In prod');
  await expect(settled).toContainText('v6');
  await expect(settled).not.toHaveAttribute('open', '');
  await expect(page.getByTestId('pull-timeline-alice/jeryu-13')).toBeHidden();
  await settled.locator('summary').click();
  await expect(page.getByTestId('pull-timeline-alice/jeryu-13')).toBeVisible();

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

test('A repository that records no release says so instead of calling merged work unreleased @action:pull_room.release_bands', async ({
  page,
}) => {
  const snapshot = snapshotWithHistory();
  await blockWebSocket(page);
  await mockBootstrap(page);
  await mockPullRoom(page, snapshot);
  await mockShiftTodos(page, []);
  // No fixture for alice/jeryu: no deployment and no tag.
  await mockReleaseChannels(page, []);

  const shell = new AppShellPage(page);
  await shell.goto('/pull-room');
  await shell.assertShellLoaded();

  const band = page.getByTestId('pull-band-unrecorded');
  await expect(band).toContainText('Merged · no release recorded');
  await expect(band).toContainText('no deployment and no release tag');
  await expect(page.getByTestId('pull-band-pending')).toHaveCount(0);
});

test('Shift work with no pull request yet sits above the open rows, with a truthful "when" @action:pull_room.ghost_rows', async ({
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
  // The real pull requests still render below.
  await expect(page.getByTestId('pull-timeline-alice/jeryu-7')).toBeVisible();
});
