// runnerCode.test.tsx — what code each runner, and the forge itself, runs on
// /runners: the model's parsing and words, and the rendered row and header
// line, with the fields present and absent (an older forge sends neither).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FleetPage } from '../FleetPage';
// The page's "Waiting on you" strip is Needs you's own list, with its own query
// and tests (needsYouAreas); these runner tests leave it out.
vi.mock('../needsYou/NeedsYouHere', () => ({ NeedsYouHere: () => null }));

import { CONTROL_PLANE_RUNNERS_QUERY_KEY } from '../../hooks/useControlPlaneRunners';
import {
  codeLabel,
  codeOutliers,
  codeTitle,
  forgeBuildLine,
  runnerNetworkFromResponse,
  sameCommit,
  type RunnerNetworkNode,
} from '../runnerNetworkModel';
import type {
  ForgeBuild,
  RunnerCode,
  RunnerFabricResponse,
  RunnerNodeSummary,
} from '../../api/types';

const COMMIT_A = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const COMMIT_B = 'b2c3d4e5f60718293a4b5c6d7e8f901234567890';
const WEB_PINNED = 'c3d4e5f60718293a4b5c6d7e8f90123456789012';
const WEB_OTHER = 'd4e5f60718293a4b5c6d7e8f9012345678901234';

function slot(runnerId: string, code?: RunnerCode): RunnerNodeSummary {
  return {
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
    ...(code ? { code } : {}),
  };
}

function fabric(
  nodeDetails: RunnerNodeSummary[],
  forge?: ForgeBuild
): RunnerFabricResponse {
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
    ...(forge ? { forge } : {}),
  };
}

const scripts = (commit: string, extra: Partial<RunnerCode> = {}): RunnerCode => ({
  repo: 'acme/gate-scripts',
  commit,
  ...extra,
});

function nodesOf(response: RunnerFabricResponse): RunnerNetworkNode[] {
  return runnerNetworkFromResponse(response).nodes;
}

describe('runner code model', () => {
  it('keeps a runner code and the forge build when the forge sends them', () => {
    const state = runnerNetworkFromResponse(
      fabric(
        [slot('gate-a/slot0', scripts(COMMIT_A, { version: '1.4.0', installedAt: '2026-06-05T00:00:00Z' }))],
        { version: '5.0.0', commit: COMMIT_B, webCommit: WEB_PINNED }
      )
    );
    expect(state.nodes[0].code).toEqual({
      repo: 'acme/gate-scripts',
      commit: COMMIT_A,
      version: '1.4.0',
      installedAt: '2026-06-05T00:00:00Z',
    });
    expect(state.forge).toEqual({ version: '5.0.0', commit: COMMIT_B, webCommit: WEB_PINNED });
  });

  it('has neither from an older forge, and drops malformed ones', () => {
    const older = runnerNetworkFromResponse(fabric([slot('gate-a/slot0')]));
    expect(older.nodes[0].code).toBeNull();
    expect(older.forge).toBeNull();

    // A code without a commit and a forge without a version, as a buggy
    // server might send them.
    const broken = Object.assign(fabric([slot('gate-a/slot0')]), {
      forge: { commit: COMMIT_B },
    });
    Object.assign(broken.local.nodeDetails[0], { code: { repo: 'acme/gate-scripts' } });
    const malformed = runnerNetworkFromResponse(broken);
    expect(malformed.nodes[0].code).toBeNull();
    expect(malformed.forge).toBeNull();
  });

  it('says the code in a few characters and the whole of it in the title', () => {
    expect(codeLabel(scripts(COMMIT_A))).toBe('a1b2c3d');
    expect(codeLabel(scripts(COMMIT_A, { version: '1.4.0' }))).toBe('a1b2c3d · 1.4.0');
    expect(
      codeTitle(scripts(COMMIT_A, { version: '1.4.0', installedAt: '2026-06-05T00:00:00Z' }))
    ).toBe(`acme/gate-scripts@${COMMIT_A} 1.4.0, installed 2026-06-05T00:00:00Z`);
    expect(codeTitle(scripts(COMMIT_A))).toBe(`acme/gate-scripts@${COMMIT_A}`);
  });

  it('marks a runner whose commit differs from most of its peers on the same repo', () => {
    const nodes = nodesOf(
      fabric([
        slot('gate-a/slot0', scripts(COMMIT_A)),
        slot('gate-a/slot1', scripts(COMMIT_A)),
        slot('gate-b/slot0', scripts(COMMIT_B)),
        slot('gate-b/slot1'),
        slot('gate-c/slot0', { repo: 'acme/other-runner', commit: COMMIT_B }),
      ])
    );
    expect([...codeOutliers(nodes)]).toEqual(['gate-b/slot0']);
  });

  it('marks nobody when no commit has a clear majority', () => {
    const nodes = nodesOf(
      fabric([slot('gate-a/slot0', scripts(COMMIT_A)), slot('gate-b/slot0', scripts(COMMIT_B))])
    );
    expect(codeOutliers(nodes).size).toBe(0);
  });

  it('matches an abbreviated commit against the full one', () => {
    expect(sameCommit(COMMIT_A, 'A1B2C3D')).toBe(true);
    expect(sameCommit(COMMIT_A, COMMIT_B)).toBe(false);
    expect(sameCommit(COMMIT_A, 'a1b')).toBe(false);
  });
});

describe('forge build line', () => {
  const forge: ForgeBuild = { version: '5.0.0', commit: COMMIT_B, webCommit: WEB_PINNED };

  it('names the release, server and pinned web commit when this page is that bundle', () => {
    expect(forgeBuildLine(forge, WEB_PINNED)).toEqual({
      text: 'Forge 5.0.0 · server b2c3d4e · web c3d4e5f',
      title: `server ${COMMIT_B}\npinned web ${WEB_PINNED}`,
      webMismatch: false,
    });
  });

  it('shows both web commits when this page is not the pinned bundle', () => {
    const line = forgeBuildLine(forge, WEB_OTHER);
    expect(line?.text).toBe('Forge 5.0.0 · server b2c3d4e · web c3d4e5f · this page d4e5f60');
    expect(line?.webMismatch).toBe(true);
  });

  it('leaves out commits nobody recorded', () => {
    expect(forgeBuildLine({ version: '5.0.0', commit: null, webCommit: null }, null)?.text).toBe(
      'Forge 5.0.0'
    );
    expect(forgeBuildLine({ version: '5.0.0', commit: null, webCommit: null }, WEB_OTHER)).toEqual({
      text: 'Forge 5.0.0 · this page d4e5f60',
      title: `this page ${WEB_OTHER}`,
      webMismatch: false,
    });
  });

  it('says only the page commit from an older forge, and nothing when that is unknown too', () => {
    expect(forgeBuildLine(null, WEB_OTHER)?.text).toBe('this page d4e5f60');
    expect(forgeBuildLine(null, null)).toBeNull();
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

describe('FleetPage runner code', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows each runner code under its name and what the forge runs under the title', () => {
    vi.stubGlobal('__JERYU_WEB_COMMIT__', WEB_PINNED);
    renderFleet(
      fabric(
        [
          slot('gate-a/slot0', scripts(COMMIT_A, { version: '1.4.0', installedAt: '2026-06-05T00:00:00Z' })),
          slot('gate-a/slot1', scripts(COMMIT_A, { version: '1.4.0' })),
          slot('gate-b/slot0', scripts(COMMIT_B)),
        ],
        { version: '5.0.0', commit: COMMIT_B, webCommit: WEB_PINNED }
      )
    );
    const code = screen.getByTestId('fleet-node-code-gate-a_slot0');
    expect(code).toHaveTextContent('runs a1b2c3d · 1.4.0');
    expect(code).toHaveAttribute(
      'title',
      `acme/gate-scripts@${COMMIT_A} 1.4.0, installed 2026-06-05T00:00:00Z`
    );
    expect(screen.queryByTestId('fleet-node-code-differs-gate-a_slot0')).toBeNull();
    expect(screen.getByTestId('fleet-node-code-gate-b_slot0')).toHaveTextContent('b2c3d4e · differs');
    const build = screen.getByTestId('fleet-forge-build');
    expect(build).toHaveTextContent('Forge 5.0.0 · server b2c3d4e · web c3d4e5f');
    expect(build.className).not.toContain('fleet__tone--warn');
  });

  it('warns when the served page is not the web bundle the forge pins', () => {
    vi.stubGlobal('__JERYU_WEB_COMMIT__', WEB_OTHER);
    renderFleet(
      fabric([slot('gate-a/slot0')], { version: '5.0.0', commit: COMMIT_B, webCommit: WEB_PINNED })
    );
    const build = screen.getByTestId('fleet-forge-build');
    expect(build).toHaveTextContent('web c3d4e5f · this page d4e5f60');
    expect(build.className).toContain('fleet__tone--warn');
  });

  it('looks as before when an older forge sends no code and the page knows no commit', () => {
    renderFleet(fabric([slot('gate-a/slot0'), slot('gate-b/slot0')]));
    expect(screen.getByTestId('fleet-node-gate-a_slot0')).toBeInTheDocument();
    expect(screen.queryByTestId('fleet-node-code-gate-a_slot0')).toBeNull();
    expect(screen.queryByTestId('fleet-node-code-gate-b_slot0')).toBeNull();
    expect(screen.queryByTestId('fleet-forge-build')).toBeNull();
  });
});
