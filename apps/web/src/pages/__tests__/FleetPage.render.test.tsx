// FleetPage.render.test.tsx — component render tier (pool cards, empty state,
// runner-network drilldown) for the /fleet operator page.
//
// Drive `FleetPage` with a seeded bootstrap query + a mocked control-plane
// runners payload and assert the page paints pool cards, the empty-pools
// roadmap note, the freshness badge, and the runner-network node board.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FleetPage } from '../FleetPage';
// The page's "Waiting on you" strip is Needs you's own list, with its own query
// and tests (needsYouAreas); these runner tests leave it out.
vi.mock('../needsYou/NeedsYouHere', () => ({ NeedsYouHere: () => null }));

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
    expect(within(screen.getByTestId('fleet-node-list')).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByTestId('fleet-node-xbabe0')).toHaveTextContent('xbabe0');
    expect(screen.getByTestId('fleet-node-local')).toHaveTextContent('local');
    // A task with an agent run opens its terminal; its last TTY line is the hint.
    const task = screen.getByTestId('fleet-task-ar-1');
    expect(screen.getByTestId('fleet-node-now-xbabe0')).toHaveTextContent('running editbot');
    expect(task.tagName).toBe('A');
    expect(task.getAttribute('title')).toContain('publishing patch');
    const local = screen.getByTestId('fleet-task-ar-local');
    expect(local.tagName).not.toBe('A');
    expect(local).toHaveAttribute('title', 'TTY preview unavailable.');
  });

  it('says runner availability is unknown instead of counting idle slots', () => {
    useRealtimeStore.setState({ events: [], status: 'open' });
    const now = new Date().toISOString();
    renderFleet(
      {
        generated_at: now,
        pool_activity: { repos: [], pools: [], unplaceable: [] },
        system: {},
      },
      {
        ...EMPTY_RUNNERS,
        local: {
          ...EMPTY_RUNNERS.local,
          state: 'unknown',
          lastUpdated: now,
          nodeDetails: [
            {
              runnerId: 'xbabe0/slot0',
              source: 'runnerd',
              state: 'registering',
              capacity: 4,
              inFlight: 0,
              labels: ['pr-gate'],
              classes: [],
              activeTaskCount: 0,
              lastUpdated: now,
              activeTasks: [],
            },
          ],
        },
      }
    );

    expect(screen.getByTestId('fleet-availability-unknown')).toHaveTextContent(
      'Runner availability unknown'
    );
    expect(screen.getByTestId('fleet-metrics')).toHaveTextContent(
      '1 gate runner on xbabe0: availability unknown'
    );
    expect(screen.getByTestId('fleet-metrics')).not.toHaveTextContent('idle');
    expect(
      screen.getByTestId('fleet-node-now-xbabe0_slot0')
    ).toHaveTextContent('availability unknown');
    expect(screen.getByTestId('fleet-node-xbabe0_slot0').className).toContain(
      'is-unknown'
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
    // Now and Last job are separate cells: a running gate no longer hides the last one.
    expect(screen.getByTestId('fleet-node-now-xbabe2_slot0')).toHaveTextContent(
      /^gating veox\/jain-web#13 for /
    );
    const last = screen.getByTestId('fleet-node-last-xbabe2_slot0');
    expect(last).toHaveTextContent('veox/jain-deploy#31 passed in 46s');
    expect(within(last).getByRole('link')).toHaveAttribute(
      'href',
      '/repos/jeryu/veox/jain-deploy/pulls/31'
    );
    expect(screen.getByTestId('fleet-node-xbabe2_slot0')).toHaveTextContent('xbabe2 · slot 0');
    // One sentence instead of six tiles; the dropped columns are gone.
    expect(screen.getByTestId('fleet-metrics')).toHaveTextContent(
      '1 gate runner on xbabe2: all busy · 0 offline'
    );
    for (const gone of ['Slots', 'In flight', 'Tasks', 'Labels', 'Status']) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
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
    expect(screen.getByTestId('fleet-metrics')).toHaveTextContent(
      '1 gate runner on xbabe2: all idle · 0 offline'
    );
    expect(screen.queryByTestId('fleet-node-xbabe0_redteam')).not.toBeInTheDocument();
    const reviewers = screen.getByTestId('fleet-reviewers');
    expect(reviewers).toHaveTextContent('Pull request reviewers');
    expect(screen.getByTestId('fleet-reviewer-xbabe0_redteam')).toHaveTextContent('xbabe0 · redteam');
    expect(screen.getByTestId('fleet-reviewer-now-xbabe0_redteam')).toHaveTextContent(
      /^reviewing jeryu\/jeryu-web#44 for /
    );
    expect(screen.getByTestId('fleet-reviewer-now-xbabe1_redteam')).toHaveTextContent('idle');
    // The same row shape in review words; the PR it last judged opens that PR.
    const verdict = screen.getByTestId('fleet-reviewer-last-xbabe0_redteam');
    expect(verdict).toHaveTextContent('approved jeryu/jeryu-deploy#43 in 22s');
    expect(within(verdict).getByRole('link')).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-deploy/pulls/43'
    );
    // A relative time for a person; the exact stamp stays on hover.
    expect(verdict).not.toHaveTextContent('2026-09-19T05:21:43Z');
    expect(within(verdict).getByTitle('2026-09-19T05:21:43Z')).toBeInTheDocument();
    expect(screen.getByTestId('fleet-reviewer-last-xbabe1_redteam')).toHaveTextContent(
      'held jeryu/jeryu-deploy#43'
    );
    expect(screen.getByTestId('fleet-reviewer-last-xbabe3_redteam')).toHaveTextContent(
      'no usable verdict on jeryu/jeryu-deploy#43'
    );
    expect(screen.queryByTestId('fleet-no-reviewer')).not.toBeInTheDocument();
  });

  it('says so when no review agent is reporting, instead of hiding the section', () => {
    useRealtimeStore.setState({ events: [], status: 'open' });
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
            {
              runnerId: 'xbabe2/slot0',
              source: 'pr-gate-runner',
              state: 'offline',
              capacity: 1,
              inFlight: 0,
              labels: ['xbabe2', 'slot 0'],
              classes: ['pr-gate'],
              activeTaskCount: 0,
              lastUpdated: '2026-09-19T05:00:00Z',
              activeTasks: [],
            },
          ],
        },
      }
    );
    expect(screen.getByTestId('fleet-reviewers')).toHaveTextContent('Pull request reviewers');
    expect(screen.getByTestId('fleet-no-reviewer')).toHaveTextContent(
      'No review agent has reported in the last 3 minutes.'
    );
    // An offline runner is the one thing that turns the sentence red.
    const metrics = screen.getByTestId('fleet-metrics');
    expect(metrics).toHaveTextContent('1 gate runner on xbabe2: 0 busy, 0 idle · 1 offline');
    expect(metrics.className).toContain('fleet__tone--failed');
    expect(screen.getByTestId('fleet-node-now-xbabe2_slot0')).toHaveTextContent('offline');
  });
});
