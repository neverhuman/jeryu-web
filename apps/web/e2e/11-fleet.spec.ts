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
  mockBootstrap,
  mockControlPlaneRunners,
  mockFleetBootstrap,
} from './fixtures/mocks';
import type { RunnerFabricResponse, RunnerLastActivity } from '../src/api/types';

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
    await page.waitForURL(/\/repos\/jeryu\/jeryu%2Fveox\/agents\/ar-000001/);
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
      '/repos/jeryu/jeryu%2Fveox/agents/ar-000001'
    );
  });

});
