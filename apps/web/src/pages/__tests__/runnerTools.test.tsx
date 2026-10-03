// runnerTools.test.tsx — what evaluates a pull request on each runner of
// /runners: parsing `tools` (present, absent, malformed), which scorer build a
// row names and when it is flagged, the header's scorer summary, and the
// Quality audits section for `jankurai-audit` runners.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { FleetPage } from '../FleetPage';
// The page's "Waiting on you" strip is Needs you's own list, with its own query
// and tests (needsYouAreas); these runner tests leave it out.
vi.mock('../needsYou/NeedsYouHere', () => ({ NeedsYouHere: () => null }));

import { CONTROL_PLANE_RUNNERS_QUERY_KEY } from '../../hooks/useControlPlaneRunners';
import {
  rowLast,
  rowNow,
  runnerNetworkFromResponse,
  type RowTone,
  type RunnerNetworkNode,
} from '../runnerNetworkModel';
import {
  evaluatesLine,
  scorerOf,
  scorerOutliers,
  scorerSummary,
  toolsFromRaw,
} from '../fleet/runnerTools';
import type {
  RunnerFabricResponse,
  RunnerLastActivity,
  RunnerNodeSummary,
  RunnerTool,
} from '../../api/types';

const BUILD_A = 'b05c03b1aa2233445566778899aabbccddeeff00112233445566778899aabbcc';
const BUILD_B = '9e6b8851aa2233445566778899aabbccddeeff00112233445566778899aabbcc';
const SCRIPTS = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

const scanners: RunnerTool[] = [
  { name: 'gitleaks', version: '8.21.2', sha256: 'aa11bb22cc33dd44' },
  { name: 'syft', version: '1.18.1' },
  { name: 'zizmor', version: '1.0.0' },
  { name: 'actionlint', version: '1.7.4' },
  { name: 'cargo-audit', version: '0.21.0' },
  { name: 'cargo-deny', version: '0.16.2' },
  { name: 'shellcheck', version: '0.10.0' },
  { name: 'cargo-public-api', version: '0.42.0' },
];

function gateTools(governed: string, onPath = governed): RunnerTool[] {
  return [
    { name: 'jankurai', version: '1.6.11', sha256: onPath },
    { name: 'jankurai@governed', version: '1.6.11', sha256: governed },
    ...scanners,
  ];
}

function slot(runnerId: string, tools?: RunnerTool[]): RunnerNodeSummary {
  return {
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
    code: { repo: 'acme/gate-scripts', commit: SCRIPTS, version: 'main 2026-06-05' },
    ...(tools ? { tools } : {}),
  };
}

function auditRunner(lastActivity?: RunnerLastActivity): RunnerNodeSummary {
  return {
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
    code: { repo: 'acme/audit-runner', commit: SCRIPTS },
    tools: [{ name: 'jankurai', version: '1.6.11', sha256: BUILD_A }],
    ...(lastActivity ? { lastActivity } : {}),
  };
}

function fabric(nodeDetails: RunnerNodeSummary[]): RunnerFabricResponse {
  return {
    schemaVersion: 'jeryu.runner_fabric/v1',
    local: {
      state: 'fresh',
      nodes: nodeDetails.length,
      onlineRunners: nodeDetails.length,
      offlineRunners: 0,
      busyRunners: 0,
      idleRunners: nodeDetails.length,
      totalSlots: nodeDetails.length,
      activeSlots: nodeDetails.length,
      utilization: 0,
      lastUpdated: '2026-06-05T00:05:00Z',
      nodeDetails,
    },
    mirror: {
      name: 'github_actions_runners',
      state: 'missing',
      reason: 'optional GitHub mirror runner adapter is not configured',
      docsUrl: 'docs/agent-native-standard.md',
    },
  };
}

describe('runner tools model', () => {
  it('keeps the tools a runner reports, and none when it reports none', () => {
    const state = runnerNetworkFromResponse(
      fabric([slot('gate-a/slot0', gateTools(BUILD_A)), slot('gate-b/slot0')])
    );
    expect(state.nodes[0].tools).toHaveLength(10);
    expect(state.nodes[0].tools?.[1]).toEqual({
      name: 'jankurai@governed',
      version: '1.6.11',
      sha256: BUILD_A,
    });
    expect(state.nodes[1].tools).toEqual([]);
  });

  it('drops malformed entries and reads a non-list as none', () => {
    expect(toolsFromRaw('jankurai')).toEqual([]);
    expect(toolsFromRaw(null)).toEqual([]);
    expect(
      toolsFromRaw([
        { name: 'jankurai', version: 1, sha256: 'ABCDEF0123' },
        { version: '1.0' },
        'gitleaks',
        null,
        { name: '  ' },
        { name: 'jankurai', version: 'again' },
        { name: 'syft', version: '1.18.1' },
      ])
    ).toEqual([
      { name: 'jankurai', sha256: 'abcdef0123' },
      { name: 'syft', version: '1.18.1' },
    ]);
  });

  it('names the governed scorer first and the PATH copy only when it is another build', () => {
    expect(evaluatesLine(gateTools(BUILD_A))).toEqual({
      scorer: 'jankurai (governed)',
      scorerBuild: '1.6.11 (b05c03b)',
      pathCopy: null,
      others: 8,
    });
    expect(evaluatesLine(gateTools(BUILD_A, BUILD_B))?.pathCopy).toBe('1.6.11 (9e6b885)');
    expect(evaluatesLine([{ name: 'jankurai', version: '1.6.11', sha256: BUILD_A }])).toEqual({
      scorer: 'jankurai',
      scorerBuild: '1.6.11 (b05c03b)',
      pathCopy: null,
      others: 0,
    });
    expect(evaluatesLine(scanners)?.scorer).toBeNull();
    expect(evaluatesLine([])).toBeNull();
    expect(scorerOf(gateTools(BUILD_A, BUILD_B))?.sha256).toBe(BUILD_A);
  });

  it('flags the runner whose scorer build differs from its section majority', () => {
    const nodes = runnerNetworkFromResponse(
      fabric([
        slot('gate-a/slot0', gateTools(BUILD_A)),
        slot('gate-a/slot1', gateTools(BUILD_A)),
        slot('gate-b/slot0', gateTools(BUILD_B)),
        slot('gate-b/slot1'),
      ])
    ).nodes;
    expect([...scorerOutliers(nodes)]).toEqual(['gate-b/slot0']);
    // Two builds, one each: neither is the odd one out.
    expect(
      scorerOutliers([
        { runnerId: 'x', tools: gateTools(BUILD_A) },
        { runnerId: 'y', tools: gateTools(BUILD_B) },
      ]).size
    ).toBe(0);
  });

  it('sums up the gates in one line, and says so when they are mixed', () => {
    expect(scorerSummary([{ tools: gateTools(BUILD_A) }, { tools: gateTools(BUILD_A) }])).toEqual({
      text: 'Gates evaluate with jankurai 1.6.11 (b05c03b)',
      mixed: false,
    });
    expect(
      scorerSummary([
        { tools: gateTools(BUILD_B) },
        { tools: gateTools(BUILD_A) },
        { tools: gateTools(BUILD_A) },
        { tools: [] },
      ])
    ).toEqual({
      text: 'Gates evaluate with 2 jankurai builds: b05c03b ×2, 9e6b885 ×1',
      mixed: true,
    });
    expect(scorerSummary([{ tools: scanners }, {}])).toBeNull();
  });

  it('files jankurai-audit runners under audits, with their own words', () => {
    const state = runnerNetworkFromResponse(
      fabric([
        slot('gate-a/slot0'),
        auditRunner({
          repo: 'acme/widgets',
          pr: 12,
          sha: SCRIPTS,
          recipe: 'jankurai audit',
          conclusion: 'scored',
          seconds: 42,
          finishedAt: '2026-06-05T00:04:00Z',
        }),
      ])
    );
    expect(state.nodes.map((node) => node.runnerId)).toEqual(['gate-a/slot0']);
    expect(state.totals.nodes).toBe(1);
    const [audit] = state.audits;
    expect(audit.kind).toBe('audit');
    // Scored means the report was recorded, not that the code passed.
    expect(rowLast(audit)).toMatchObject({ verb: 'scored', tone: 'unknown', subject: 'acme/widgets#12' });
    const outcomes: [string, string, RowTone][] = [
      ['failed', 'failed', 'failed'],
      ['tool-failed', 'tool failed', 'warn'],
      ['refused', 'refused', 'warn'],
      ['cancelled', 'errored', 'failed'],
    ];
    for (const [conclusion, verb, tone] of outcomes) {
      const last = audit.lastActivity ? { ...audit.lastActivity, conclusion } : null;
      expect(rowLast({ ...audit, lastActivity: last })).toMatchObject({ verb, tone });
    }
    const busy: RunnerNetworkNode = {
      ...audit,
      tasks: [
        {
          taskId: 't1',
          jobId: 'j1',
          agentRunId: null,
          workcellId: null,
          repo: 'acme/widgets',
          label: 'acme/widgets#13',
          program: 'jankurai audit',
          state: 'running',
          startedAt: null,
          updatedAt: null,
          ttyState: 'unknown',
          lastTtyLine: null,
        },
      ],
    };
    expect(rowNow(busy, Date.parse('2026-06-05T00:05:00Z')).text).toBe('auditing');
  });
});

function renderFleet(runners: RunnerFabricResponse): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(CONTROL_PLANE_RUNNERS_QUERY_KEY, runners);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FleetPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('runner kinds', () => {
  const labelled = (runnerId: string, labels: string[], kind?: string): RunnerNodeSummary => {
    const node = { ...slot(runnerId), labels, classes: [] };
    delete node.kind;
    return kind ? Object.assign(node, { kind }) : node;
  };

  it('believes the forge kind over the labels', () => {
    const state = runnerNetworkFromResponse(
      fabric([
        // A deploy timer whose labels look like a gate slot's.
        labelled('build-1/publish', ['build-1', 'slot 0', 'pr-gate'], 'deployer'),
        labelled('gate-a/slot0', ['pr-gate'], 'gate'),
        labelled('gate-a/review', ['pr-gate'], 'reviewer'),
        labelled('gate-a/jankurai-audit', ['gate-a', 'slot 0'], 'jankurai-audit'),
        labelled('node-a', ['rust'], 'workcell'),
      ])
    );
    expect(state.nodes.map((node) => node.runnerId)).toEqual(['gate-a/slot0', 'node-a']);
    expect(state.automation.map((node) => node.runnerId)).toEqual(['build-1/publish']);
    expect(state.reviewers.map((node) => node.runnerId)).toEqual(['gate-a/review']);
    expect(state.audits.map((node) => node.runnerId)).toEqual(['gate-a/jankurai-audit']);
  });

  it('falls back to the labels from an older forge or an unknown kind', () => {
    const state = runnerNetworkFromResponse(
      fabric([
        labelled('gate-a/slot0', ['pr-gate']),
        labelled('gate-a/jankurai-audit', ['jankurai-audit']),
        labelled('gate-b/auto-pin', ['automation'], 'something-new'),
      ])
    );
    expect(state.nodes.map((node) => node.runnerId)).toEqual(['gate-a/slot0']);
    expect(state.audits.map((node) => node.runnerId)).toEqual(['gate-a/jankurai-audit']);
    expect(state.automation.map((node) => node.runnerId)).toEqual(['gate-b/auto-pin']);
  });
});

describe('FleetPage evaluation tools', () => {
  it('says what each runner runs and what evaluates there, with the full list one click away', () => {
    renderFleet(
      fabric([
        slot('gate-a/slot0', gateTools(BUILD_A)),
        slot('gate-a/slot1', gateTools(BUILD_A, BUILD_B)),
      ])
    );
    expect(screen.getByTestId('fleet-node-code-gate-a_slot0')).toHaveTextContent(
      'runs a1b2c3d · main 2026-06-05'
    );
    const tools = screen.getByTestId('fleet-node-tools-gate-a_slot0');
    expect(tools.tagName).toBe('DETAILS');
    const summary = within(tools).getByText(/evaluates with/);
    expect(summary).toHaveTextContent(
      'evaluates with jankurai (governed) 1.6.11 (b05c03b) · +8 tools'
    );
    expect(screen.queryByTestId('fleet-node-tools-gate-a_slot0-path')).toBeNull();
    const list = within(tools).getByRole('list', { hidden: true, name: 'Evaluation tools' });
    expect(within(list).getAllByRole('listitem', { hidden: true })).toHaveLength(10);
    expect(list).toHaveTextContent('gitleaks 8.21.2 aa11bb2');
    fireEvent.click(summary);
    expect(tools).toHaveAttribute('open');

    expect(screen.getByTestId('fleet-node-tools-gate-a_slot1-path')).toHaveTextContent(
      'PATH copy 1.6.11 (9e6b885) differs'
    );
    const header = screen.getByTestId('fleet-scorer-summary');
    expect(header).toHaveTextContent('Gates evaluate with jankurai 1.6.11 (b05c03b)');
    expect(header.className).not.toContain('fleet__tone--warn');
  });

  it('marks the drifting gate and says the gates are mixed', () => {
    renderFleet(
      fabric([
        slot('gate-a/slot0', gateTools(BUILD_A)),
        slot('gate-a/slot1', gateTools(BUILD_A)),
        slot('gate-b/slot0', gateTools(BUILD_B)),
      ])
    );
    expect(screen.getByTestId('fleet-node-gate-b_slot0').className).toContain('is-tool-drift');
    expect(screen.getByTestId('fleet-node-tools-gate-b_slot0-differs')).toBeInTheDocument();
    expect(screen.getByTestId('fleet-node-gate-a_slot0').className).not.toContain('is-tool-drift');
    const header = screen.getByTestId('fleet-scorer-summary');
    expect(header).toHaveTextContent('Gates evaluate with 2 jankurai builds: b05c03b ×2, 9e6b885 ×1');
    expect(header.className).toContain('fleet__tone--warn');
  });

  it('lists audit runners under Quality audits, and nothing new from an older forge', () => {
    renderFleet(
      fabric([
        slot('gate-a/slot0', gateTools(BUILD_A)),
        auditRunner({
          repo: 'acme/widgets',
          pr: 12,
          sha: SCRIPTS,
          recipe: 'jankurai audit',
          conclusion: 'tool-failed',
          seconds: 42,
          finishedAt: '2026-06-05T00:04:00Z',
        }),
      ])
    );
    const section = screen.getByTestId('fleet-audits');
    expect(within(section).getByRole('heading', { name: 'Quality audits' })).toBeInTheDocument();
    const row = screen.getByTestId('fleet-audit-gate-a_jankurai-audit');
    expect(row).toHaveTextContent('gate-a · jankurai-audit');
    expect(screen.getByTestId('fleet-audit-last-gate-a_jankurai-audit')).toHaveTextContent(
      'acme/widgets#12 tool failed in 42s'
    );
    expect(screen.getByTestId('fleet-audit-tools-gate-a_jankurai-audit')).toHaveTextContent(
      'evaluates with jankurai 1.6.11 (b05c03b)'
    );
    expect(screen.queryByTestId('fleet-node-gate-a_jankurai-audit')).toBeNull();
  });

  it('looks as before when no runner reports tools or audits', () => {
    renderFleet(fabric([slot('gate-a/slot0'), slot('gate-b/slot0')]));
    expect(screen.queryByTestId('fleet-node-tools-gate-a_slot0')).toBeNull();
    expect(screen.queryByTestId('fleet-scorer-summary')).toBeNull();
    expect(screen.queryByTestId('fleet-audits')).toBeNull();
  });
});
