// FleetPage.render.test.tsx — component render tier (pool cards, empty state,
// runner-network drilldown) for the /fleet operator page.
//
// Drive `FleetPage` with a seeded bootstrap query + a mocked control-plane
// runners payload and assert the page paints pool cards, the empty-pools
// roadmap note, the freshness badge, and the runner-network node board.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { FleetPage } from '../FleetPage';
import { BOOTSTRAP_QUERY_KEY } from '../../hooks/useBootstrap';
import { CONTROL_PLANE_RUNNERS_QUERY_KEY } from '../../hooks/useControlPlaneRunners';
import { useRealtimeStore } from '../../stores/realtimeStore';
import type {
  RunnerFabricResponse,
  WebBootstrap,
} from '../../api/types';

// ── Fixtures ─────────────────────────────────────────────────────────────

/** A `PoolRollup`-shaped JSON object (the wire shape over `pool.{name}`). */
const EMPTY_RUNNERS: RunnerFabricResponse = {
  schemaVersion: 'jeryu.runner_fabric/v1',
  local: {
    state: 'unknown',
    nodes: 0,
    onlineRunners: 0,
    offlineRunners: 0,
    busyRunners: 0,
    idleRunners: 0,
    totalSlots: 0,
    activeSlots: 0,
    utilization: 0,
    lastUpdated: null,
    nodeDetails: [],
  },
  mirror: {
    name: 'github_actions_runners',
    state: 'missing',
    reason: 'optional GitHub mirror runner adapter is not configured',
    docsUrl: 'docs/agent-native-standard.md',
  },
};

function renderFleet(tui: unknown, runners: RunnerFabricResponse = EMPTY_RUNNERS): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const bootstrap: WebBootstrap = {
    generated_at: '2026-05-31T00:00:00Z',
    schema_version: '0.1.0-alpha',
    viewer: {
      id: 'local',
      login: 'local',
      display_name: 'Local',
      avatar_url: null,
      global_permissions: [],
    },
    tui: tui as Record<string, unknown>,
    recent_repositories: [],
    websocket_url: '/api/v1/ws',
    feature_flags: {
      repo_create: false,
      settings_write: false,
      merge_write: false,
      markdown_html: true,
      agents: false,
      mcp: false,
      workcells: false,
    },
  };
  client.setQueryData(BOOTSTRAP_QUERY_KEY, bootstrap);
  client.setQueryData(CONTROL_PLANE_RUNNERS_QUERY_KEY, runners);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FleetPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ── Tier 2: component render ─────────────────────────────────────────────

describe('FleetPage render', () => {
  afterEach(() => {
    // Reset the realtime singleton so events do not leak between tests.
    useRealtimeStore.setState({ events: [], status: 'idle' });
  });

  it('renders the runner-network drilldown from the control-plane runners payload', () => {
    useRealtimeStore.setState({ events: [], status: 'open' });
    renderFleet(
      {
        generated_at: new Date().toISOString(),
        pool_activity: { repos: [], pools: [], unplaceable: [] },
        system: {},
      },
      {
        schemaVersion: 'jeryu.runner_fabric/v1',
        local: {
          state: 'fresh',
          nodes: 2,
          onlineRunners: 2,
          offlineRunners: 0,
          busyRunners: 1,
          idleRunners: 1,
          totalSlots: 20,
          activeSlots: 20,
          utilization: 0.05,
          lastUpdated: '2026-06-05T00:05:00Z',
          nodeDetails: [
            {
              runnerId: 'xbabe0',
              source: 'runnerd',
              state: 'active',
              capacity: 10,
              inFlight: 1,
              labels: ['rust', 'dogfood'],
              classes: ['native-rust-clean'],
              activeTaskCount: 1,
              lastUpdated: '2026-06-05T00:05:00Z',
              activeTasks: [
                {
                  taskId: 'ar-1',
                  jobId: 'wc-1',
                  agentRunId: 'ar-1',
                  workcellId: 'wc-1',
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
                  taskId: 'ar-local',
                  jobId: 'wc-local',
                  agentRunId: 'ar-local',
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
          ],
        },
        mirror: {
          name: 'github_actions_runners',
          state: 'missing',
          reason: 'optional GitHub mirror runner adapter is not configured',
          docsUrl: 'docs/agent-native-standard.md',
        },
      }
    );

    expect(screen.getByTestId('fleet-network')).toBeInTheDocument();
    expect(screen.getByTestId('fleet-node-list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem', { name: /^Runner node / })).toHaveLength(
      2
    );
    expect(screen.getByTestId('fleet-node-xbabe0')).toHaveTextContent('xbabe0');
    expect(screen.getByTestId('fleet-node-local')).toHaveTextContent('local');
    expect(screen.getByTestId('fleet-task-ar-1')).toHaveTextContent('running');
    expect(screen.getByTestId('fleet-task-ar-1').getAttribute('title')).toContain(
      'publishing patch'
    );
    expect(screen.getByTestId('fleet-task-ar-local')).toHaveAttribute(
      'title',
      'TTY preview unavailable.'
    );
  });

  it('titles the page Runners and shows each gate runner\'s last gate', () => {
    useRealtimeStore.setState({ events: [], status: 'open' });
    renderFleet(
      {
        generated_at: new Date().toISOString(),
        pool_activity: { repos: [], pools: [], unplaceable: [] },
        system: {},
      },
      {
        schemaVersion: 'jeryu.runner_fabric/v1',
        local: {
          state: 'fresh',
          nodes: 1,
          onlineRunners: 1,
          offlineRunners: 0,
          busyRunners: 1,
          idleRunners: 0,
          totalSlots: 1,
          activeSlots: 1,
          utilization: 1,
          lastUpdated: '2026-09-17T03:05:00Z',
          nodeDetails: [
          {
            runnerId: 'xbabe2/slot0',
            source: 'pr-gate-runner',
            state: 'active',
            capacity: 1,
            inFlight: 1,
            labels: ['xbabe2', 'slot 0'],
            classes: ['pr-gate'],
            activeTaskCount: 1,
            lastUpdated: '2026-09-17T03:05:00Z',
            activeTasks: [
              {
                taskId: 'xbabe2/slot0@abc30d78',
                jobId: 'veox/jain-web#13',
                agentRunId: null,
                workcellId: null,
                repo: 'veox/jain-web',
                label: 'veox/jain-web#13',
                program: 'just required',
                state: 'running',
                startedAt: '2026-09-17T03:04:00Z',
                updatedAt: '2026-09-17T03:05:00Z',
                ttyPreview: { state: 'missing', lines: [] },
              },
            ],
            lastActivity: {
              repo: 'veox/jain-deploy',
              pr: 31,
              sha: '3926cbd7ddab0e48edc143d3b49607b3bf39bf20',
              recipe: 'just required',
              conclusion: 'success',
              seconds: 46,
              finishedAt: '2026-09-17T02:34:39Z',
            },
          },
          ],
        },
        mirror: {
          name: 'github_actions_runners',
          state: 'missing',
          reason: 'optional GitHub mirror runner adapter is not configured',
          docsUrl: 'docs/agent-native-standard.md',
        },
      }
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Runners' })).toBeInTheDocument();
    // The running gate takes the last-gate cell in place of the finished one.
    const running = screen.getByTestId('fleet-task-xbabe2_slot0_abc30d78');
    expect(running).toHaveTextContent('veox/jain-web#13 running just required');
    expect(screen.queryByText('veox/jain-deploy#31')).not.toBeInTheDocument();
    const metrics = screen.getByTestId('fleet-metrics');
    expect(metrics).toHaveTextContent('100%');
    expect(metrics).toHaveTextContent('1 runner(s)');
    expect(metrics).toHaveTextContent('1 busy');
    expect(metrics).toHaveTextContent('1 active task(s)');
    expect(screen.queryByText('Runner pools')).not.toBeInTheDocument();
    expect(screen.queryByText('System health')).not.toBeInTheDocument();
  });

  it('lists pr-redteam as a PR reviewer apart from the gate slots', () => {
    useRealtimeStore.setState({ events: [], status: 'open' });
    const gate = {
      runnerId: 'xbabe2/slot0',
      source: 'pr-gate-runner',
      state: 'active',
      capacity: 1,
      inFlight: 0,
      labels: ['xbabe2', 'slot 0'],
      classes: ['pr-gate'],
      activeTaskCount: 0,
      lastUpdated: '2026-09-19T05:22:00Z',
      activeTasks: [],
    };
    const reviewer = (
      runnerId: string,
      conclusion: string,
      reviewing: boolean
    ): RunnerFabricResponse['local']['nodeDetails'][number] => ({
      runnerId,
      source: 'pr-redteam',
      state: 'active',
      capacity: 0,
      inFlight: reviewing ? 1 : 0,
      labels: ['xbabe0', 'slot 0', 'redteam'],
      classes: ['reviewer'],
      activeTaskCount: reviewing ? 1 : 0,
      lastUpdated: '2026-09-19T05:22:00Z',
      activeTasks: reviewing
        ? [
            {
              taskId: `${runnerId}@abc30d78`,
              jobId: 'jeryu/jeryu-web#44',
              agentRunId: null,
              workcellId: null,
              repo: 'jeryu/jeryu-web',
              label: 'jeryu/jeryu-web#44',
              program: 'redteam-review',
              state: 'running',
              startedAt: '2026-09-19T05:20:00Z',
              updatedAt: '2026-09-19T05:22:00Z',
              ttyPreview: { state: 'missing', lines: [] },
            },
          ]
        : [],
      lastActivity: {
        repo: 'jeryu/jeryu-deploy',
        pr: 43,
        sha: '55ee4dd0efe046dc716f77fa73536d35b760fe4e',
        recipe: 'redteam-review',
        conclusion,
        seconds: 22,
        finishedAt: '2026-09-19T05:21:43Z',
      },
    });
    renderFleet(
      {
        generated_at: new Date().toISOString(),
        pool_activity: { repos: [], pools: [], unplaceable: [] },
        system: {},
      },
      {
        ...EMPTY_RUNNERS,
        local: {
          ...EMPTY_RUNNERS.local,
          state: 'fresh',
          lastUpdated: '2026-09-19T05:22:00Z',
          nodeDetails: [
            gate,
            reviewer('xbabe0/redteam', 'approve', true),
            reviewer('xbabe1/redteam', 'hold', false),
            reviewer('xbabe3/redteam', 'failed', false),
          ],
        },
      }
    );
    // Reviewers are not gate slots: the gate list and its totals skip them.
    expect(screen.getByTestId('fleet-metrics')).toHaveTextContent('1 runner(s)');
    expect(screen.queryByTestId('fleet-node-xbabe0_redteam')).not.toBeInTheDocument();
    const reviewers = screen.getByTestId('fleet-reviewers');
    expect(reviewers).toHaveTextContent('PR reviewers');
    expect(screen.getByTestId('fleet-reviewer-current-xbabe0_redteam')).toHaveTextContent(
      'jeryu/jeryu-web#44 reviewing'
    );
    expect(screen.getByTestId('fleet-reviewer-verdict-xbabe0_redteam')).toHaveTextContent(
      'jeryu/jeryu-deploy#43 approve'
    );
    expect(screen.getByTestId('fleet-reviewer-last-pass-xbabe0_redteam')).toHaveTextContent(
      '2026-09-19T05:21:43Z'
    );
    expect(screen.getByTestId('fleet-reviewer-verdict-xbabe1_redteam')).toHaveTextContent(
      'hold'
    );
    expect(screen.getByTestId('fleet-reviewer-verdict-xbabe3_redteam')).toHaveTextContent(
      'no usable verdict'
    );
  });
});
