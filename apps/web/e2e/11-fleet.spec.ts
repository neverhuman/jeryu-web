// 11-fleet.spec.ts — Fleet runner-network smoke (Slice C-web).
//
// The Runners page is the live runner-network drilldown sourced from
// `/api/v1/control-plane/runners` (the fixture-backed pool summary is gone).
// This spec exercises the rendered node cards, active task preview, last TTY
// line, and the rule that `local` only appears when the backend payload
// actually includes it.

import { expect, test } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';
import {
  blockingViolations,
  persistAxeResult,
  persistRenderedEvidence,
  runAxe,
} from './fixtures/accessibility';
import {
  mockBootstrap,
  mockControlPlaneRunners,
  mockFleetBootstrap,
} from './fixtures/mocks';
import { mockPipelineApi } from './fixtures/pipelineMocks';
import { mockBoards, mockEnvironments } from './fixtures/releaseBoardMocks';
import type {
  RunnerFabricResponse,
  RunnerLastActivity,
  RunnerNodeSummary,
} from '../src/api/types';

test.describe.configure({ retries: 1 });

function runnerFabric(includeLocal: boolean): RunnerFabricResponse {
  return {
    schemaVersion: 'jeryu.runner_fabric/v1',
    local: {
      state: 'fresh',
      nodes: includeLocal ? 3 : 2,
      onlineRunners: includeLocal ? 2 : 1,
      offlineRunners: 1,
      busyRunners: includeLocal ? 2 : 1,
      idleRunners: includeLocal ? 1 : 0,
      totalSlots: includeLocal ? 32 : 30,
      activeSlots: includeLocal ? 22 : 20,
      utilization: includeLocal ? 0.091 : 0.05,
      lastUpdated: '2026-06-05T00:05:00Z',
      nodeDetails: [
        {
          runnerId: 'xbabe0',
          source: 'runnerd',
          state: 'active',
          capacity: 10,
          inFlight: 1,
          labels: ['rust', 'dogfood'],
          classes: ['native-rust-clean', 'native-rust-hot'],
          activeTaskCount: 1,
          lastUpdated: '2026-06-05T00:05:00Z',
          activeTasks: [
            {
              taskId: 'ar-000001',
              jobId: 'wc-0001',
              agentRunId: 'ar-000001',
              workcellId: 'wc-0001',
              repo: 'jeryu/veox',
              label: 'editbot',
              program: '/workspace/repair.sh',
              state: 'running',
              startedAt: '2026-06-05T00:00:00Z',
              updatedAt: '2026-06-05T00:05:00Z',
              ttyPreview: {
                state: 'fresh',
                lines: ['$ repair.sh', 'running tests', 'publishing patch'],
              },
            },
          ],
        },
        {
          runnerId: 'xbabe1',
          source: 'runnerd',
          state: 'draining',
          capacity: 10,
          inFlight: 0,
          labels: ['rust', 'dogfood'],
          classes: ['native-rust-clean', 'native-rust-hot'],
          activeTaskCount: 0,
          lastUpdated: '2026-06-05T00:04:00Z',
          activeTasks: [],
        },
        ...(includeLocal
          ? [
              {
                runnerId: 'local',
                source: 'local',
                state: 'active',
                capacity: 2,
                inFlight: 1,
                labels: ['local'],
                classes: ['native-rust-hot'],
                activeTaskCount: 1,
                lastUpdated: '2026-06-05T00:03:00Z',
                activeTasks: [
                  {
                    taskId: 'ar-local-1',
                    jobId: 'wc-local',
                    agentRunId: 'ar-local-1',
                    workcellId: 'wc-local',
                    repo: null,
                    label: 'local-repair',
                    program: '/workspace/local.sh',
                    state: 'running',
                    startedAt: '2026-06-05T00:01:00Z',
                    updatedAt: '2026-06-05T00:03:00Z',
                    ttyPreview: {
                      state: 'missing',
                      lines: [],
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    },
    mirror: {
      name: 'github_actions_runners',
      state: 'missing',
      reason: 'optional GitHub mirror runner adapter is not configured',
      docsUrl: 'docs/agent-native-standard.md',
    },
  };
}

test.describe('Fleet runner-network dashboard (Slice C-web)', () => {
  test('renders node cards, active task preview, and local only when present @action:fleet.render', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockFleetBootstrap(page, [
      {
        pool: 'trusted',
        tags: ['rust-hot'],
        running_jobs: 1,
        active_slots: 4,
        online_runners: 4,
      },
    ]);
    await mockControlPlaneRunners(page, runnerFabric(true));

    const shell = new AppShellPage(page);
    await shell.goto('/runners');
    await shell.assertShellLoaded();

    await expect(page.getByTestId('fleet-page')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('fleet-network')).toBeVisible();
    await expect(page.getByTestId('fleet-node-list')).toBeVisible();
    await expect(page.getByTestId('fleet-node-xbabe0')).toContainText(
      /xbabe0/
    );
    await expect(page.getByTestId('fleet-node-xbabe1')).toContainText(
      /draining/
    );
    await expect(page.getByTestId('fleet-node-local')).toContainText(/local/);
    // Four cells a row: Runner, Now, Last job, Seen. The header is one sentence.
    await expect(page.getByTestId('fleet-metrics')).toContainText(/gate runners? on /);
    await expect(page.getByTestId('fleet-node-now-xbabe0')).toContainText('running');
    await expect(page.getByTestId('fleet-task-ar-000001')).toHaveAttribute(
      'title',
      /publishing patch/
    );
    await expect(page.getByTestId('fleet-task-ar-local-1')).toHaveAttribute(
      'title',
      /TTY preview unavailable/i
    );

    await page.screenshot({
      path: 'playwright-report/fleet-runner-network.png',
      fullPage: true,
    });
  });

  test('does not invent a local node when the backend omits it @action:fleet.no_local_absence', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockFleetBootstrap(page, [
      {
        pool: 'trusted',
        tags: ['rust-hot'],
        running_jobs: 1,
        active_slots: 4,
        online_runners: 4,
      },
    ]);
    await mockControlPlaneRunners(page, runnerFabric(false));

    const shell = new AppShellPage(page);
    await shell.goto('/runners');
    await shell.assertShellLoaded();

    await expect(page.getByTestId('fleet-node-xbabe0')).toBeVisible();
    await expect(page.getByTestId('fleet-node-xbabe1')).toBeVisible();
    await expect(page.getByTestId('fleet-node-local')).toHaveCount(0);
    // No review agent in this snapshot: the section says so instead of vanishing.
    await expect(page.getByTestId('fleet-no-reviewer')).toHaveText(
      'No review agent has reported in the last 3 minutes.'
    );
  });

  test('clicking a task card with repo + agentRunId navigates to the agent terminal @action:fleet.task_navigation', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockFleetBootstrap(page, [
      {
        pool: 'trusted',
        tags: ['rust-hot'],
        running_jobs: 1,
        active_slots: 4,
        online_runners: 4,
      },
    ]);
    await mockControlPlaneRunners(page, runnerFabric(true));

    const shell = new AppShellPage(page);
    await shell.goto('/runners');
    await shell.assertShellLoaded();

    const taskCard = page.getByTestId('fleet-task-ar-000001');
    await expect(taskCard).toBeVisible();
    await expect(taskCard).toHaveAttribute('aria-label', /Open terminal/);

    const localTask = page.getByTestId('fleet-task-ar-local-1');
    await expect(localTask).toBeVisible();
    await expect(localTask).not.toHaveAttribute('aria-label', /Open terminal/);

    await taskCard.click();
    // The repo's owner and name stay separate segments, which is the only
    // spelling the repo router reads.
    await page.waitForURL(/\/repos\/jeryu\/jeryu\/veox\/agents\/ar-000001/);
  });

  test('task card without repo remains non-interactive @action:fleet.noninteractive_card', async ({ page }) => {
    await mockBootstrap(page);
    await mockFleetBootstrap(page, [
      {
        pool: 'trusted',
        tags: ['rust-hot'],
        running_jobs: 1,
        active_slots: 4,
        online_runners: 4,
      },
    ]);
    await mockControlPlaneRunners(page, runnerFabric(true));

    const shell = new AppShellPage(page);
    await shell.goto('/runners');
    await shell.assertShellLoaded();

    const localTask = page.getByTestId('fleet-task-ar-local-1');
    await expect(localTask).toBeVisible();
    const tagName = await localTask.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe('strong');
  });

  test('lists the pr-redteam reviewer apart from the gate slots @action:fleet.reviewer', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockFleetBootstrap(page, []);
    const fabric = runnerFabric(false);
    fabric.local.nodeDetails.push({
      runnerId: 'xbabe0/redteam',
      source: 'pr-redteam',
      state: 'active',
      capacity: 0,
      inFlight: 0,
      labels: ['xbabe0', 'slot 0', 'redteam'],
      classes: ['reviewer'],
      activeTaskCount: 0,
      lastUpdated: '2026-06-05T00:05:00Z',
      activeTasks: [],
      lastActivity: {
        repo: 'jeryu/jeryu-deploy',
        pr: 43,
        sha: '55ee4dd0efe046dc716f77fa73536d35b760fe4e',
        recipe: 'redteam-review',
        conclusion: 'hold',
        seconds: 22,
        finishedAt: '2026-06-05T00:04:30Z',
      },
    });
    await mockControlPlaneRunners(page, fabric);

    const shell = new AppShellPage(page);
    await shell.goto('/runners');
    await shell.assertShellLoaded();

    await expect(page.getByTestId('fleet-reviewers')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('fleet-reviewer-now-xbabe0_redteam')).toHaveText('idle');
    const lastReview = page.getByTestId('fleet-reviewer-last-xbabe0_redteam');
    await expect(lastReview).toContainText('held jeryu/jeryu-deploy#43 in 22s');
    await expect(lastReview.getByRole('link')).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-deploy/pulls/43'
    );
    await expect(page.getByTestId('fleet-no-reviewer')).toHaveCount(0);
    await expect(page.getByTestId('fleet-node-xbabe0_redteam')).toHaveCount(0);
  });

  test('folds reviewers that have never reviewed anything into one line @action:fleet.reviewer_unused', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockFleetBootstrap(page, []);
    const fabric = runnerFabric(false);
    const reviewer = (host: string, lastActivity: RunnerLastActivity | null) => ({
      runnerId: `${host}/redteam`,
      source: 'pr-redteam',
      state: 'idle',
      capacity: 0,
      inFlight: 0,
      labels: [host, 'redteam'],
      classes: ['reviewer'],
      activeTaskCount: 0,
      lastUpdated: '2026-06-05T00:05:00Z',
      activeTasks: [],
      ...(lastActivity ? { lastActivity } : {}),
    });
    fabric.local.nodeDetails.push(
      reviewer('xbabe0', {
        repo: 'jeryu/jeryu-deploy',
        pr: 43,
        sha: '55ee4dd0efe046dc716f77fa73536d35b760fe4e',
        recipe: 'redteam-review',
        conclusion: 'approve',
        seconds: 22,
        finishedAt: '2026-06-05T00:04:30Z',
      }),
      reviewer('xbabe1', null),
      reviewer('xbabe2', null)
    );
    await mockControlPlaneRunners(page, fabric);

    const shell = new AppShellPage(page);
    await shell.goto('/runners');
    await shell.assertShellLoaded();

    await expect(page.getByTestId('fleet-reviewers')).toBeVisible({ timeout: 10_000 });
    // The one that has reviewed keeps its row; the other two are one sentence.
    await expect(page.getByTestId('fleet-reviewer-xbabe0_redteam')).toBeVisible();
    await expect(page.getByTestId('fleet-reviewer-xbabe1_redteam')).toHaveCount(0);
    await expect(page.getByTestId('fleet-reviewer-xbabe2_redteam')).toHaveCount(0);
    await expect(page.getByTestId('fleet-reviewers-idle')).toHaveText(
      '2 reviewers have not reviewed anything yet: xbabe1 · redteam, xbabe2 · redteam.'
    );
    await expect(page.getByTestId('fleet-no-reviewer')).toHaveCount(0);
  });

  test('lists the background timers under Automation, and shows no section when none reports @action:fleet.automation', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockFleetBootstrap(page, []);
    const fabric = runnerFabric(false);
    const beat = new Date(Date.now() - 240_000).toISOString();
    const timer = (name: string, lastActivity: RunnerLastActivity) => ({
      runnerId: `xbabe0/${name}`,
      source: 'automation',
      state: 'active',
      capacity: 0,
      inFlight: 0,
      labels: ['xbabe0', 'slot 0', 'automation'],
      classes: ['automation'],
      activeTaskCount: 0,
      // Four minutes since the beat of a five-minute timer: healthy.
      lastUpdated: beat,
      activeTasks: [],
      offlineAfterSeconds: 900,
      lastActivity,
    });
    fabric.local.nodeDetails.push(
      timer('auto-pin', {
        repo: 'jeryu/jeryu-deploy',
        pr: 74,
        sha: 'ea04cac1f05eadc15694dd1434d9f8f99c44a0d3',
        recipe: 'auto-pin',
        conclusion: 'opened',
        seconds: 0,
        finishedAt: beat,
      }),
      timer('auto-stage', {
        repo: 'jeryu/jeryu-deploy',
        pr: null,
        sha: '77dc3310aa5eadc15694dd1434d9f8f99c44a0d3',
        recipe: 'auto-stage',
        conclusion: 'staged',
        seconds: 0,
        finishedAt: beat,
      })
    );
    await mockControlPlaneRunners(page, fabric);

    const shell = new AppShellPage(page);
    await shell.goto('/runners');
    await shell.assertShellLoaded();

    const section = page.getByTestId('fleet-automation');
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(section.getByRole('heading', { name: 'Automation' })).toBeVisible();
    const pin = page.getByTestId('fleet-automation-xbabe0_auto-pin');
    await expect(pin).toContainText('Auto-pin');
    await expect(pin).toContainText('opened jeryu-deploy#74');
    await expect(pin.getByRole('link')).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-deploy/pulls/74'
    );
    await expect(page.getByTestId('fleet-automation-seen-xbabe0_auto-pin')).not.toContainText('offline');
    const stage = page.getByTestId('fleet-automation-xbabe0_auto-stage');
    await expect(stage).toContainText('staged 77dc331');
    await expect(stage.getByRole('link')).toHaveCount(0);
    // A timer is neither a gate slot nor a reviewer as well.
    await expect(page.getByTestId('fleet-node-xbabe0_auto-pin')).toHaveCount(0);
    await expect(page.getByTestId('fleet-reviewer-xbabe0_auto-pin')).toHaveCount(0);

    // An older forge, or timers never installed: no section, not an empty box.
    await mockControlPlaneRunners(page, runnerFabric(false));
    await page.reload();
    await expect(page.getByTestId('fleet-node-xbabe0')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('fleet-automation')).toHaveCount(0);
  });

  test('says what code each runner and the forge run, and nothing from an older forge @action:fleet.code', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockFleetBootstrap(page, []);
    const fabric = runnerFabric(false);
    const slot = (runnerId: string, commit?: string) => ({
      runnerId,
      source: 'pr-gate-runner',
      state: 'idle',
      capacity: 1,
      inFlight: 0,
      labels: ['pr-gate'],
      classes: ['pr-gate'],
      activeTaskCount: 0,
      lastUpdated: '2026-06-05T00:05:00Z',
      activeTasks: [],
      ...(commit
        ? {
            code: {
              repo: 'acme/gate-scripts',
              commit,
              version: '1.4.0',
              installedAt: '2026-06-05T00:00:00Z',
            },
          }
        : {}),
    });
    const usual = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
    fabric.local.nodeDetails = [
      slot('gate-a/slot0', usual),
      slot('gate-a/slot1', usual),
      slot('gate-b/slot0', 'b2c3d4e5f60718293a4b5c6d7e8f901234567890'),
    ];
    fabric.forge = {
      version: '5.0.0',
      commit: 'b2c3d4e5f60718293a4b5c6d7e8f901234567890',
      webCommit: 'c3d4e5f60718293a4b5c6d7e8f90123456789012',
    };
    await mockControlPlaneRunners(page, fabric);

    const shell = new AppShellPage(page);
    await shell.goto('/runners');
    await shell.assertShellLoaded();

    await expect(page.getByTestId('fleet-forge-build')).toContainText(
      'Forge 5.0.0 · server b2c3d4e · web c3d4e5f',
      { timeout: 10_000 }
    );
    const code = page.getByTestId('fleet-node-code-gate-a_slot0');
    await expect(code).toHaveText('runs a1b2c3d · 1.4.0');
    await expect(code).toHaveAttribute(
      'title',
      `acme/gate-scripts@${usual} 1.4.0, installed 2026-06-05T00:00:00Z`
    );
    await expect(page.getByTestId('fleet-node-code-differs-gate-a_slot0')).toHaveCount(0);
    await expect(page.getByTestId('fleet-node-code-differs-gate-b_slot0')).toHaveText('· differs');

    await page.screenshot({
      path: 'playwright-report/fleet-runner-code.png',
      fullPage: true,
    });

    // An older forge sends neither field: the rows carry no code line.
    const older = runnerFabric(false);
    older.local.nodeDetails = [slot('gate-a/slot0')];
    await mockControlPlaneRunners(page, older);
    await page.reload();
    await expect(page.getByTestId('fleet-node-gate-a_slot0')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('fleet-node-code-gate-a_slot0')).toHaveCount(0);
    // This page's own build commit may still show; the forge's does not.
    await expect(
      page.getByTestId('fleet-forge-build').filter({ hasText: 'Forge' })
    ).toHaveCount(0);
  });

  test('links each runner and the forge to the release-board lane that ships it @action:fleet.releases', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);
    await mockEnvironments(page);
    // The invented globex board names build-1/slot0 and build-1/slot1 on its
    // gate-runner lane, and its forge-server production stage runs be19083.
    await mockBoards(page);
    const fabric = runnerFabric(false);
    const slot = (runnerId: string) => ({
      runnerId,
      source: 'pr-gate-runner',
      state: 'idle',
      capacity: 1,
      inFlight: 0,
      labels: ['pr-gate'],
      classes: ['pr-gate'],
      activeTaskCount: 0,
      lastUpdated: '2026-06-05T00:05:00Z',
      activeTasks: [],
    });
    fabric.local.nodeDetails = [slot('build-1/slot0'), slot('build-1/slot1'), slot('build-2/slot0')];
    fabric.forge = {
      version: '5.0.0',
      commit: 'be19083a1b2c3d4e5f60718293a4b5c6d7e8f901',
      webCommit: null,
    };
    let boardReads = 0;
    let runnerReads = 0;
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname === '/api/v1/release-board') boardReads += 1;
      if (pathname === '/api/v1/control-plane/runners') runnerReads += 1;
    });
    await mockControlPlaneRunners(page, fabric);
    await page.clock.install();

    const shell = new AppShellPage(page);
    await shell.goto('/runners');
    await shell.assertShellLoaded();

    const where = page.getByTestId('fleet-node-release-build-1_slot0');
    await expect(where).toHaveText('globex · Gate runner · installed aab6147', { timeout: 10_000 });
    await expect(where).toHaveAttribute('href', '/releases/family/globex#lane-gate-runner');
    await expect(page.getByTestId('fleet-node-build-1_slot0')).toHaveAttribute('id', 'runner-build-1-slot0');
    // A runner no board names has no such line.
    await expect(page.getByTestId('fleet-node-release-build-2_slot0')).toHaveCount(0);
    await expect(page.getByTestId('fleet-forge-release')).toHaveAttribute(
      'href',
      '/releases/family/globex#lane-forge-server'
    );

    // The runner rows poll every 15 s; the boards do not come along.
    const boardsBefore = boardReads;
    const runnersBefore = runnerReads;
    await page.clock.fastForward(20_000);
    await expect.poll(() => runnerReads).toBeGreaterThan(runnersBefore);
    expect(boardReads).toBe(boardsBefore);

    await where.click();
    await expect(page).toHaveURL(/\/releases\/family\/globex#lane-gate-runner$/);
    const lane = page.getByTestId('release-board-lane-gate-runner');
    await expect(lane).toHaveClass(/release-board__lane--target/, { timeout: 15_000 });
    await expect(lane).toBeInViewport();
  });

  test('keeps observed tasks but does not invent runner availability @action:fleet.availability_unknown', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockFleetBootstrap(page, []);
    const fabric = runnerFabric(false);
    fabric.local = {
      ...fabric.local,
      state: 'unknown',
      onlineRunners: 0,
      offlineRunners: 0,
      busyRunners: 0,
      idleRunners: 0,
      totalSlots: 0,
      activeSlots: 0,
      utilization: 0,
      nodeDetails: fabric.local.nodeDetails.map((node) => ({
        ...node,
        source: 'workcell',
        state: 'unknown',
        capacity: 0,
        inFlight: 0,
      })),
    };
    await mockControlPlaneRunners(page, fabric);

    const shell = new AppShellPage(page);
    await shell.goto('/runners');
    await shell.assertShellLoaded();

    const fleet = page.getByTestId('fleet-page');
    await expect(fleet).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('fleet-availability-unknown')).toContainText(
      'Runner availability unknown'
    );
    await expect(page.getByTestId('fleet-metrics')).toContainText(
      'availability unknown'
    );
    // No invented capacity: neither an idle slot nor an offline count.
    await expect(page.getByTestId('fleet-metrics')).not.toContainText(
      /idle|busy|offline/
    );
    await expect(page.getByTestId('fleet-node-now-xbabe1')).toContainText(
      'availability unknown'
    );
    // The work actually observed on the node stays visible.
    const task = page.getByTestId('fleet-task-ar-000001');
    await expect(task).toContainText('editbot');
    await expect(task).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/veox/agents/ar-000001'
    );
  });

  test('says what evaluates each pull request, lists quality audits, and flags a drifting scorer @action:fleet.tools', async ({
    page,
  }) => {
    await mockBootstrap(page);
    await mockFleetBootstrap(page, []);
    const usual = 'b05c03b1aa2233445566778899aabbccddeeff00112233445566778899aabbcc';
    const other = '9e6b8851aa2233445566778899aabbccddeeff00112233445566778899aabbcc';
    const scanners = [
      'gitleaks',
      'syft',
      'zizmor',
      'actionlint',
      'cargo-audit',
      'cargo-deny',
      'shellcheck',
      'cargo-public-api',
    ].map((name) => ({ name, version: '1.0.0', sha256: 'c0ffee00c0ffee00' }));
    const slot = (runnerId: string, governed: string, onPath = governed): RunnerNodeSummary => ({
      runnerId,
      kind: 'gate',
      source: 'pr-gate-runner',
      state: 'idle',
      capacity: 1,
      inFlight: 0,
      labels: ['pr-gate'],
      classes: ['pr-gate'],
      activeTaskCount: 0,
      lastUpdated: '2026-06-05T00:05:00Z',
      activeTasks: [],
      code: {
        repo: 'acme/gate-scripts',
        commit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        version: 'main 2026-06-05',
      },
      tools: [
        { name: 'jankurai', version: '1.6.11', sha256: onPath },
        { name: 'jankurai@governed', version: '1.6.11', sha256: governed },
        ...scanners,
      ],
    });
    const fabric = runnerFabric(false);
    fabric.local.nodeDetails = [
      slot('gate-a/slot0', usual),
      slot('gate-a/slot1', usual, other),
      slot('gate-b/slot0', other),
      {
        runnerId: 'gate-a/jankurai-audit',
        kind: 'jankurai-audit',
        source: 'jankurai-audit-runner',
        state: 'idle',
        capacity: 0,
        inFlight: 0,
        offlineAfterSeconds: 180,
        labels: ['gate-a', 'slot 0', 'jankurai-audit'],
        classes: ['jankurai-audit'],
        activeTaskCount: 0,
        lastUpdated: '2026-06-05T00:05:00Z',
        activeTasks: [],
        code: { repo: 'acme/audit-runner', commit: 'f00dfacef00dfacef00dfacef00dfacef00dface' },
        tools: [{ name: 'jankurai', version: '1.6.11', sha256: usual }],
        lastActivity: {
          repo: 'acme/widgets',
          pr: 12,
          sha: 'ea04cac1f05eadc15694dd1434d9f8f99c44a0d3',
          recipe: 'jankurai audit',
          conclusion: 'scored',
          seconds: 42,
          finishedAt: '2026-06-05T00:04:00Z',
        },
      },
    ];
    await mockControlPlaneRunners(page, fabric);

    const shell = new AppShellPage(page);
    await shell.goto('/runners');
    await shell.assertShellLoaded();

    // The runner's own scripts, then what scores the pull request.
    await expect(page.getByTestId('fleet-node-code-gate-a_slot0')).toHaveText(
      'runs a1b2c3d · main 2026-06-05',
      { timeout: 10_000 }
    );
    const tools = page.getByTestId('fleet-node-tools-gate-a_slot0');
    const summary = tools.locator('summary');
    await expect(summary).toHaveText(
      'evaluates with jankurai (governed) 1.6.11 (b05c03b) · +8 tools'
    );
    // The full list opens from the keyboard.
    const list = tools.getByRole('list', { name: 'Evaluation tools' });
    await expect(list).toBeHidden();
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(list).toBeVisible();
    await expect(list.getByRole('listitem')).toHaveCount(10);
    await expect(list).toContainText('gitleaks 1.0.0 c0ffee0');

    // A PATH copy that is another build is named, and amber.
    await expect(page.getByTestId('fleet-node-tools-gate-a_slot1-path')).toHaveText(
      '· PATH copy 1.6.11 (9e6b885) differs'
    );
    // gate-b scores with a build most gates do not use.
    await expect(page.getByTestId('fleet-node-gate-b_slot0')).toHaveClass(/is-tool-drift/);
    await expect(page.getByTestId('fleet-node-tools-gate-b_slot0-differs')).toBeVisible();
    const header = page.getByTestId('fleet-scorer-summary');
    await expect(header).toHaveText(
      'Gates evaluate with 2 jankurai builds: b05c03b ×2, 9e6b885 ×1'
    );
    await expect(header).toHaveClass(/fleet__tone--warn/);

    // The audit runner has its own section and the same row anatomy.
    const audits = page.getByTestId('fleet-audits');
    await expect(audits.getByRole('heading', { name: 'Quality audits' })).toBeVisible();
    await expect(page.getByTestId('fleet-audit-last-gate-a_jankurai-audit')).toContainText(
      'acme/widgets#12 scored in 42s'
    );
    await expect(page.getByTestId('fleet-audit-tools-gate-a_jankurai-audit')).toContainText(
      'evaluates with jankurai 1.6.11 (b05c03b)'
    );
    await expect(page.getByTestId('fleet-node-gate-a_jankurai-audit')).toHaveCount(0);

    const result = await runAxe(page, { disableRules: ['color-contrast'] });
    await persistAxeResult('fleet-tools', result);
    const rendered = await persistRenderedEvidence(page, 'fleet-tools');
    expect(rendered.geometry.width).toBeGreaterThan(0);
    expect(blockingViolations(result).map((violation) => violation.id)).toEqual([]);

    // Phone width: rows stack, nothing scrolls sideways.
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(summary).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Gates on one build: one plain summary line, no drift marks.
    fabric.local.nodeDetails = [slot('gate-a/slot0', usual), slot('gate-b/slot0', usual)];
    await mockControlPlaneRunners(page, fabric);
    await page.reload();
    await expect(page.getByTestId('fleet-scorer-summary')).toHaveText(
      'Gates evaluate with jankurai 1.6.11 (b05c03b)',
      { timeout: 10_000 }
    );
    await expect(page.getByTestId('fleet-scorer-summary')).not.toHaveClass(/fleet__tone--warn/);
    await expect(page.getByTestId('fleet-node-gate-b_slot0')).not.toHaveClass(/is-tool-drift/);
    await expect(page.getByTestId('fleet-audits')).toHaveCount(0);
  });

});
