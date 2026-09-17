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
function rollup(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pool: 'trusted',
    tags: ['rust-hot'],
    trust_tier: 'trusted',
    paused: false,
    queued_jobs: 0,
    running_jobs: 1,
    failed_jobs: 0,
    active_slots: 4,
    configured_max_slots: 4,
    online_runners: 4,
    stuck_runners: 0,
    ...over,
  };
}

const SYSTEM_HEALTH = {
  scm: { name: 'scm', status: 'healthy', latency_ms: 12, detail: null },
  database: { name: 'database', status: 'healthy', latency_ms: 3, detail: null },
  sandbox: { name: 'sandbox', status: 'degraded', latency_ms: null, detail: 'slow' },
  cache: { name: 'cache', status: 'healthy', latency_ms: 1, detail: null },
  vault: { name: 'vault', status: 'warning', latency_ms: null, detail: null },
};

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

  it('renders pool cards + system-health strip from bootstrap, with a freshness badge', () => {
    // No live event arrives in this test, and the bootstrap timestamp is far
    // in the past, so the freshness badge must appear.
    useRealtimeStore.setState({ events: [], status: 'open' });
    renderFleet({
      generated_at: '2020-01-01T00:00:00Z',
      pool_activity: {
        repos: [{ repo: 'veox/redline' }],
        pools: [rollup({ pool: 'trusted' })],
        unplaceable: [],
      },
      system: SYSTEM_HEALTH,
    });

    expect(screen.getByTestId('fleet-page')).toBeInTheDocument();
    expect(screen.getByTestId('fleet-pool-trusted')).toBeInTheDocument();
    expect(screen.getByTestId('fleet-health-strip')).toBeInTheDocument();
    expect(screen.getByTestId('fleet-health-sandbox')).toBeInTheDocument();
    // Out of date because the only data is a 2020 bootstrap timestamp.
    expect(screen.getByTestId('fleet-freshness-badge')).toBeInTheDocument();
  });

  it('renders the empty-pools roadmap note when no pools report', () => {
    useRealtimeStore.setState({ events: [], status: 'open' });
    renderFleet({
      generated_at: new Date().toISOString(),
      pool_activity: { repos: [], pools: [], unplaceable: [] },
      system: {},
    });
    expect(screen.getByTestId('fleet-page')).toBeInTheDocument();
    expect(
      screen.getByText(/No runner pools are reporting yet/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No system health reported yet/i)
    ).toBeInTheDocument();
    // No pools/components → the banner reports "Awaiting fleet telemetry."
    expect(screen.getByTestId('fleet-banner')).toHaveTextContent(
      /Awaiting fleet telemetry/i
    );
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
    expect(screen.getByTestId('fleet-task-ar-1')).toHaveTextContent(
      'publishing patch'
    );
    expect(screen.getByTestId('fleet-task-ar-local')).toHaveTextContent(
      /TTY preview unavailable/i
    );
  });

  it('titles the page Runner Fleet and shows each gate runner\'s last gate', () => {
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
    expect(screen.getByRole('heading', { level: 1, name: 'Runner Fleet' })).toBeInTheDocument();
    expect(screen.getByText('veox/jain-deploy#31')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getByText(/just required in 46s · 3926cbd/)).toBeInTheDocument();
  });
});
