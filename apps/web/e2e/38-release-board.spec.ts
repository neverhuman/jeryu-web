// 38-release-board.spec.ts — /releases opens on the family release board.
//
// The board reads `GET /api/v1/release-board` (which families reported) and
// `GET /api/v1/release-board/{family}` (one snapshot), both admin-only; stages
// linked to a forge environment also read `/api/v3/repos/{o}/{r}/environments`
// for a deployment reported after the snapshot. The snapshots served here are
// the invented acme, globex and initech fixtures the unit tests use. A board's
// address is /releases/family/<family> (`?family=` redirects there), each lane
// is `#lane-<id>`, and a target that names runners links to /runners.

import { expect, test, type Page } from './fixtures/test';

import { mockBootstrap, mockControlPlaneRunners } from './fixtures/mocks';
import type { RunnerFabricResponse } from '../src/api/types';
import { mockPipelineApi } from './fixtures/pipelineMocks';
import { BOARD_SNAPSHOTS, mockBoards, mockEnvironments } from './fixtures/releaseBoardMocks';

const SNAPSHOTS = BOARD_SNAPSHOTS;

async function openBoard(page: Page, path = '/releases'): Promise<void> {
  await mockBootstrap(page, { auth: { role: 'admin' } });
  await mockPipelineApi(page);
  await mockEnvironments(page);
  await mockBoards(page);
  await page.goto(path);
  await expect(page.getByTestId('release-board')).toBeVisible({ timeout: 15_000 });
}

test('the board opens on the first family, a pill switches family and the URL keeps it @action:releases.board', async ({
  page,
  realtime,
}) => {
  let updated = false;
  await mockBootstrap(page, { auth: { role: 'admin' } });
  await mockPipelineApi(page);
  await mockEnvironments(page);
  await mockBoards(page, {
    summaryOf: (family) =>
      updated && family === 'initech' ? 'package 10.1.7 published and in sync' : undefined,
  });
  await page.goto('/releases');
  const board = page.getByTestId('release-board');
  await expect(board).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Family board' })).toHaveAttribute('aria-current', 'page');

  // The first reported family, alphabetically.
  await expect(board.getByRole('link', { name: 'acme', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('release-board-summary')).toHaveText(SNAPSHOTS[0]?.summary ?? '');
  await expect(page.getByRole('heading', { level: 3, name: 'Cloud app', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Website' })).toBeVisible();
  await expect(page.getByTestId('release-board-observed')).toContainText('manual run on collector-1');

  // The parallel stage sits beside dev; the work bar counts and explains itself.
  const lane = page.getByTestId('release-board-lane-cloud-app');
  await expect(lane.getByText('runs beside the previous stage')).toBeAttached();
  await expect(page.getByTestId('release-board-work-live')).toHaveText('Live 3 (43%)');
  await expect(page.getByTestId('release-board-work')).toContainText('Matched by content');
  await expect(page.getByTestId('release-board-work').getByRole('img')).toHaveAttribute(
    'aria-label',
    /^7 todos\. Live: 3/
  );

  // A pill switches family; a lane shared from another family is read-only.
  await board.getByRole('link', { name: 'initech', exact: true }).click();
  await expect(page).toHaveURL(/\/releases\/family\/initech$/);
  await expect(page.getByTestId('release-board-summary')).toHaveText(SNAPSHOTS[2]?.summary ?? '');
  await expect(page.getByTestId('release-board-read-only-cloud-appliance')).toHaveText(
    'read-only here · owned by acme'
  );

  // A new snapshot pushes on the pipeline scope: the board follows at once.
  await realtime.waitForOpen();
  await realtime.hello();
  updated = true;
  await realtime.event({ seq: 90, scope: 'pipeline', kind: 'release_board.updated', entity: 'release_board' });
  await expect(page.getByTestId('release-board-summary')).toHaveText(
    'package 10.1.7 published and in sync',
    { timeout: 8_000 }
  );

  // Coming back without ?family= lands on the family picked last.
  await page.goto('/releases');
  await expect(page.getByRole('link', { name: 'initech', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
    { timeout: 15_000 }
  );

  // The per-repository view is one link away, and names no repository itself:
  // it opens on the first deploy repository the forge reports.
  await page.getByRole('link', { name: 'Per repository' }).click();
  await expect(page).toHaveURL(/\/releases\?view=repositories$/);
  await expect(page.getByLabel('Repository or family')).toHaveValue('repo:jeryu/jeryu-deploy');
  await expect(page.getByTestId('release-board')).toHaveCount(0);
});

test('a stage opens into its targets, what promoting ships and the command @action:releases.board.stage-detail', async ({
  page,
}) => {
  await openBoard(page, '/releases?family=acme');
  const prod = page.getByTestId('release-board-stage-cloud-app-prod');
  await expect(prod).toContainText('v0.8.12 · 96d8374');
  await expect(prod).toContainText('skew · 1 behind');
  await expect(prod).toContainText('known by reported');
  await expect(prod).toHaveAttribute('aria-expanded', 'false');

  // Keyboard first: a stage is a real button.
  await prod.focus();
  await page.keyboard.press('Enter');
  await expect(prod).toHaveAttribute('aria-expanded', 'true');
  const detail = page.getByTestId('release-board-detail-cloud-app');
  await expect(detail.getByRole('heading', { name: 'Cloud app · prod' })).toBeVisible();
  await expect(detail.getByRole('row')).toHaveCount(6);
  await expect(detail.getByRole('row', { name: /node-b · prod worker/ })).toContainText('v0.7.11 5c3af7f');
  await expect(detail).toContainText('Promoting ships');
  await expect(detail).toContainText('Rollback: a new, higher v* tag on the old commit');
  await expect(detail).toContainText('A person runs this');
  await expect(
    detail.getByRole('button', { name: 'Copy promote command for Cloud app prod' })
  ).toBeVisible();
  await expect(detail.locator('code', { hasText: 'just tag-release v0.8.13' })).toBeVisible();

  // Pressing it again closes the detail.
  await prod.click();
  await expect(prod).toHaveAttribute('aria-expanded', 'false');
  await expect(detail.getByRole('heading')).toHaveCount(0);

  // A board with fixed columns lines every lane up under one header; a column a
  // lane skips says "not used", and each tool is its own row.
  await page.getByRole('link', { name: 'globex', exact: true }).click();
  await expect(page.getByTestId('release-board-columns')).toHaveText(/main\s*dev\s*stage\s*prod/i);
  await expect(page.getByTestId('release-board-slot-gate-runner-dev')).toHaveText(/not used/);
  await expect(page.getByRole('group', { name: 'Tools' }).getByRole('heading', { level: 3 })).toHaveText([
    'Gate runner',
    'Reviewer',
    'Scorer',
  ]);

  // A never-deployed stage is dashed and says so.
  const idle = page.getByTestId('release-board-stage-forge-server-dev');
  await expect(idle).toHaveClass(/release-board__cell--never-deployed/);
  await idle.click();
  await expect(page.getByTestId('release-board-detail-forge-server')).toContainText(
    'Declared but never deployed to'
  );
});

test('pinned vs released lists every repo with how far behind it is @action:releases.board.pins', async ({
  page,
}) => {
  await openBoard(page, '/releases?family=globex');
  await page.getByRole('tab', { name: 'Pinned vs released' }).click();
  const pins = page.getByTestId('release-board-pins');
  await expect(pins.getByRole('columnheader')).toHaveText(['Repo', 'Main', 'Pinned', 'In prod', 'Behind', 'Note']);
  await expect(pins.getByRole('row')).toHaveCount(8);
  await expect(page.getByTestId('release-board-pin-release-ops')).toContainText('42');
  await expect(page.getByTestId('release-board-pin-release-ops')).toContainText(
    'the pin policy blocks the bump'
  );
  await expect(pins).toContainText('Read from Cargo.lock');

  // Arrow keys move between the views.
  await page.getByRole('tab', { name: 'Pinned vs released' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Release notes' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Release notes' })).toHaveAttribute('aria-selected', 'true');

  // A family that sends no pins has no such view.
  await page.getByRole('link', { name: 'acme', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Deliverables' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Pinned vs released' })).toHaveCount(0);
});

test('release notes say what promoting would ship and what they cover @action:releases.board.notes', async ({
  page,
}) => {
  await openBoard(page, '/releases?family=acme');
  await page.getByRole('tab', { name: 'Release notes' }).click();
  const notes = page.getByTestId('release-board-notes');
  await expect(notes).toContainText('Cloud app: what promoting prod would ship');
  await expect(notes.getByRole('listitem')).toHaveText([
    'PR #13 · deploy: report each deploy to the forge, and notes for v0.8.12',
  ]);
  await expect(notes).toContainText('Hand-written notes exist for v0.8.3–v0.8.12');
});

test('a deployment the forge reported after the snapshot shows at once @action:releases.board.overlay', async ({
  page,
}) => {
  await mockBootstrap(page, { auth: { role: 'admin' } });
  await mockPipelineApi(page);
  await mockEnvironments(page, { sha: '1a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d', ref: 'v0.8.13' });
  await mockBoards(page);
  await page.goto('/releases?family=acme');
  const prod = page.getByTestId('release-board-stage-cloud-app-prod');
  await expect(prod.getByTestId('release-board-overlay')).toHaveText('reported after this snapshot', {
    timeout: 15_000,
  });
  await expect(prod).toContainText('v0.8.13 · 1a2b3c4');
  await expect(prod).toContainText('known by reported');
  await expect(page.getByTestId('release-board-stage-cloud-app-stage')).not.toContainText(
    'reported after this snapshot'
  );
});

test('without an admin session the page says so and shows the per-repository view @action:releases.board.unavailable', async ({
  page,
}) => {
  await mockBootstrap(page, { auth: { role: 'admin' } });
  await mockPipelineApi(page);
  await mockEnvironments(page);
  await mockBoards(page, { listStatus: 403 });
  await page.goto('/releases');
  await expect(page.getByTestId('release-board-needs-admin')).toContainText(
    'The release board needs an admin session.',
    { timeout: 15_000 }
  );
  await expect(page.getByLabel('Repository or family')).toHaveValue('repo:jeryu/jeryu-deploy');
});

/** Gate slots and a reviewer whose ids the globex board names on its targets. */
function boardRunners(): RunnerFabricResponse {
  const node = (runnerId: string, labels: string[]) => ({
    runnerId,
    source: 'pr-gate-runner',
    state: 'idle',
    capacity: 1,
    inFlight: 0,
    labels,
    classes: [],
    activeTaskCount: 0,
    lastUpdated: new Date().toISOString(),
    activeTasks: [],
  });
  const nodes = [
    node('build-1/slot0', ['pr-gate']),
    node('build-1/slot1', ['pr-gate']),
    node('build-2/slot0', ['pr-gate']),
  ];
  return {
    schemaVersion: 'jeryu.runner_fabric/v1',
    local: {
      state: 'fresh',
      nodes: nodes.length,
      onlineRunners: nodes.length,
      offlineRunners: 0,
      busyRunners: 0,
      idleRunners: nodes.length,
      totalSlots: nodes.length,
      activeSlots: 0,
      utilization: 0,
      lastUpdated: new Date().toISOString(),
      nodeDetails: nodes,
    },
    mirror: { name: 'github_actions_runners', state: 'missing', reason: 'not configured', docsUrl: 'docs/x.md' },
  };
}

test('an old ?family= link lands on the board path and its lane, and a target links to its runners @action:releases.board.runners', async ({
  page,
}) => {
  await mockBootstrap(page, { auth: { role: 'admin' } });
  await mockPipelineApi(page);
  await mockEnvironments(page);
  await mockBoards(page);
  await mockControlPlaneRunners(page, boardRunners());

  // The older spelling redirects to the board's own address, hash kept.
  await page.goto('/releases?family=globex#lane-gate-runner');
  await expect(page).toHaveURL(/\/releases\/family\/globex#lane-gate-runner$/, { timeout: 15_000 });
  const lane = page.getByTestId('release-board-lane-gate-runner');
  await expect(lane).toHaveAttribute('id', 'lane-gate-runner');
  // Scrolled to and ringed for a moment.
  await expect(lane).toHaveClass(/release-board__lane--target/);
  await expect(lane).toBeInViewport();
  await expect(lane).not.toHaveClass(/release-board__lane--target/, { timeout: 6_000 });

  // The installed stage's target names two runners: one link to both.
  await page.getByTestId('release-board-stage-gate-runner-installed').click();
  const runners = page.getByTestId('release-board-detail-gate-runner').getByRole('link', { name: '2 runners' });
  await expect(runners).toHaveAttribute('title', 'build-1/slot0, build-1/slot1');
  await runners.click();

  await expect(page).toHaveURL(/\/runners\?runners=build-1%2Fslot0%2Cbuild-1%2Fslot1$/);
  await expect(page.getByTestId('fleet-node-build-1_slot0')).toHaveClass(/is-highlighted/, { timeout: 10_000 });
  await expect(page.getByTestId('fleet-node-build-1_slot1')).toHaveClass(/is-highlighted/);
  await expect(page.getByTestId('fleet-node-build-2_slot0')).not.toHaveClass(/is-highlighted/);
  await expect(page.getByTestId('fleet-picked')).toHaveText(
    '2 runners linked from a release board are highlighted. Clear'
  );
});
