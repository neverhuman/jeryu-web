// runnerReleaseLinks.test.tsx — /runners and /releases point at each other.
// The pure parts: board addresses and the `?family=` redirect, the index
// runnerId -> board lane, the forge's own lane, row anchors and `?runners=`.
// Then the reads (every board once; an unreadable one is left out, an
// unreadable list fails quietly) and the rendered rows on /runners.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RunnerFabricResponse, RunnerNodeSummary } from '../../api/types';
import type { ReleaseBoard } from '../../api/types/releaseBoard';
import { CONTROL_PLANE_RUNNERS_QUERY_KEY } from '../../hooks/useControlPlaneRunners';
import {
  fetchAllReleaseBoards,
  RUNNER_BOARDS_REFRESH_MS,
  RUNNER_RELEASE_BOARDS_KEY,
  useRunnerReleaseBoards,
} from '../../hooks/useRunnerReleaseBoards';
import { ACME_BOARD, ALL_BOARDS, GLOBEX_BOARD, listResponse } from '../../test/fixtures/releaseBoard';
import { FleetPage } from '../FleetPage';
// The page's "Waiting on you" strip is Needs you's own list, with its own query
// and tests (needsYouAreas); these runner tests leave it out.
vi.mock('../needsYou/NeedsYouHere', () => ({ NeedsYouHere: () => null }));

import { REVIEWER_LABEL } from '../runnerNetworkModel';
import {
  forgeReleaseLane,
  parseRunnersParam,
  runnerAnchorId,
  runnerReleaseIndex,
  runnerReleaseText,
} from '../fleet/releaseIndex';
import {
  canonicalBoardRedirect,
  laneFromHash,
  releaseFamilyPath,
  releaseLaneHref,
  runnerCountLabel,
  runnersHref,
} from '../releaseBoard/links';
import { errorResponse, json } from './shiftPageHelpers';

const FORGE_COMMIT = 'be19083a1b2c3d4e5f60718293a4b5c6d7e8f901';

describe('release board links', () => {
  it('spells the board, a lane and a set of runners as URLs', () => {
    expect(releaseFamilyPath('acme')).toBe('/releases/family/acme');
    expect(releaseFamilyPath('a b')).toBe('/releases/family/a%20b');
    expect(releaseLaneHref('globex', 'gate-runner')).toBe('/releases/family/globex#lane-gate-runner');
    expect(runnersHref(['build-1/slot0', 'build-1/slot1'])).toBe(
      '/runners?runners=build-1%2Fslot0%2Cbuild-1%2Fslot1'
    );
    expect(runnerCountLabel(1)).toBe('1 runner');
    expect(runnerCountLabel(3)).toBe('3 runners');
  });

  it('reads the lane a hash names', () => {
    expect(laneFromHash('#lane-gate-runner')).toBe('gate-runner');
    expect(laneFromHash('#lane-')).toBeNull();
    expect(laneFromHash('#workers')).toBeNull();
    expect(laneFromHash('')).toBeNull();
  });

  it('redirects the board ?family= to its path, keeping other parameters and the hash', () => {
    expect(canonicalBoardRedirect('?family=acme', '')).toEqual({
      pathname: '/releases/family/acme',
      search: '',
      hash: '',
    });
    expect(canonicalBoardRedirect('?family=acme&tab=x', '#lane-cloud-app')).toEqual({
      pathname: '/releases/family/acme',
      search: '?tab=x',
      hash: '#lane-cloud-app',
    });
  });

  it('leaves the per-repository view and a plain /releases alone', () => {
    expect(canonicalBoardRedirect('?view=repositories&family=acme', '')).toBeNull();
    expect(canonicalBoardRedirect('?repo=acme%2Fapp&family=acme', '')).toBeNull();
    expect(canonicalBoardRedirect('?repo=acme%2Fapp', '')).toBeNull();
    expect(canonicalBoardRedirect('', '')).toBeNull();
    expect(canonicalBoardRedirect('?family=', '')).toBeNull();
  });
});

describe('runner -> release index', () => {
  it('maps every runner a target names to its family, lane and stage', () => {
    const index = runnerReleaseIndex(ALL_BOARDS);
    expect(index.get('build-1/slot0')).toEqual({
      family: 'globex',
      laneId: 'gate-runner',
      laneName: 'Gate runner',
      stageName: 'installed',
      stageVersion: 'aab6147',
    });
    expect(index.get('build-1/slot1')?.laneId).toBe('gate-runner');
    expect(index.get('node-a/reviewer')?.laneId).toBe('reviewer');
    expect(index.size).toBe(3);
  });

  it('is empty for boards whose targets name no runners (an older collector)', () => {
    expect(runnerReleaseIndex([ACME_BOARD]).size).toBe(0);
    expect(runnerReleaseIndex([]).size).toBe(0);
  });

  it('prefers the family that owns a lane over one showing it read-only', () => {
    const lane = GLOBEX_BOARD.lanes.find((entry) => entry.id === 'gate-runner');
    if (!lane) throw new Error('fixture lost its gate-runner lane');
    const borrowed: ReleaseBoard = {
      ...ACME_BOARD,
      family: 'aaa-borrower',
      lanes: [{ ...lane, read_only: true, owner_family: 'globex' }],
    };
    expect(runnerReleaseIndex([borrowed, GLOBEX_BOARD]).get('build-1/slot0')?.family).toBe('globex');
    // Shown only read-only somewhere: still better than nothing.
    expect(runnerReleaseIndex([borrowed]).get('build-1/slot0')?.family).toBe('aaa-borrower');
  });

  it('says where in a few words, leaving out a version the code line already says', () => {
    const release = runnerReleaseIndex([GLOBEX_BOARD]).get('build-1/slot0');
    if (!release) throw new Error('no release for build-1/slot0');
    expect(runnerReleaseText(release)).toBe('globex · Gate runner · installed aab6147');
    expect(runnerReleaseText(release, '1.4.0')).toBe('globex · Gate runner · installed');
    expect(runnerReleaseText({ ...release, stageVersion: null })).toBe('globex · Gate runner · installed');
  });

  it('finds the lane whose production stage runs the forge commit', () => {
    expect(
      forgeReleaseLane(ALL_BOARDS, { version: '5.0.0', commit: FORGE_COMMIT, webCommit: null })
    ).toEqual({
      family: 'globex',
      laneId: 'forge-server',
      laneName: 'Forge server',
      href: '/releases/family/globex#lane-forge-server',
    });
    expect(
      forgeReleaseLane(ALL_BOARDS, { version: '5.0.0', commit: 'ffffffff00', webCommit: null })
    ).toBeNull();
    expect(forgeReleaseLane(ALL_BOARDS, { version: '5.0.0', commit: null, webCommit: null })).toBeNull();
    expect(forgeReleaseLane(ALL_BOARDS, null)).toBeNull();
    expect(forgeReleaseLane([], { version: '5.0.0', commit: FORGE_COMMIT, webCommit: null })).toBeNull();
  });

  it('gives each runner row a stable anchor and reads ?runners=', () => {
    expect(runnerAnchorId('build-1/slot0')).toBe('runner-build-1-slot0');
    expect(runnerAnchorId('Gate A:slot 1')).toBe('runner-gate-a-slot-1');
    expect(runnerAnchorId('///')).toBe('runner-unnamed');
    expect(parseRunnersParam('build-1/slot0, build-1/slot1,,build-1/slot0')).toEqual([
      'build-1/slot0',
      'build-1/slot1',
    ]);
    expect(parseRunnersParam(null)).toEqual([]);
  });
});

/** Serve the board reads; `status` overrides a path's answer. */
function serveBoards(status: Record<string, number> = {}): string[] {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const raw = input instanceof Request ? input.url : String(input);
    const { pathname } = new URL(raw, 'http://localhost');
    calls.push(pathname);
    const forced = status[pathname];
    if (forced) return errorResponse(forced, 'refused');
    if (pathname === '/api/v1/release-board') return json(listResponse());
    const family = /^\/api\/v1\/release-board\/([^/]+)$/.exec(pathname)?.[1];
    const board = ALL_BOARDS.find((entry) => entry.family === family);
    return board ? json(board) : errorResponse(404, 'no board');
  });
  return calls;
}

describe('reading every board for /runners', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the list, then each family once', async () => {
    const calls = serveBoards();
    const boards = await fetchAllReleaseBoards();
    expect(boards.map((board) => board.family)).toEqual(['acme', 'globex', 'initech']);
    expect(calls).toEqual([
      '/api/v1/release-board',
      '/api/v1/release-board/acme',
      '/api/v1/release-board/globex',
      '/api/v1/release-board/initech',
    ]);
  });

  it('leaves out a family whose board cannot be read', async () => {
    serveBoards({ '/api/v1/release-board/acme': 404, '/api/v1/release-board/initech': 403 });
    const boards = await fetchAllReleaseBoards();
    expect(boards.map((board) => board.family)).toEqual(['globex']);
  });

  it('fails when the list itself is refused, which the page treats as no links', async () => {
    serveBoards({ '/api/v1/release-board': 403 });
    await expect(fetchAllReleaseBoards()).rejects.toMatchObject({ status: 403 });
  });

  it('rereads at most every 5 minutes', () => {
    expect(RUNNER_BOARDS_REFRESH_MS).toBe(300_000);
    expect(typeof useRunnerReleaseBoards).toBe('function');
  });
});

function slot(runnerId: string, extra: Partial<RunnerNodeSummary> = {}): RunnerNodeSummary {
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
    ...extra,
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
      activeSlots: 0,
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
    forge: { version: '5.0.0', commit: FORGE_COMMIT, webCommit: null },
  };
}

const RUNNERS = fabric([
  slot('build-1/slot0'),
  slot('build-1/slot1', {
    code: { repo: 'globex/gate-scripts', commit: 'aab6147aab6147aab6147', version: '1.4.0' },
  }),
  slot('build-2/slot0'),
  slot('node-a/reviewer', {
    source: 'reviewer',
    labels: [REVIEWER_LABEL],
    classes: [],
    lastActivity: {
      repo: 'globex/server',
      pr: 12,
      sha: 'c0ffee0c0ffee0c0ffee0',
      recipe: 'review',
      conclusion: 'approve',
      seconds: 40,
      finishedAt: '2026-06-05T00:04:00Z',
    },
  }),
]);

function renderFleet(path: string, boards: ReleaseBoard[] | null): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(CONTROL_PLANE_RUNNERS_QUERY_KEY, RUNNERS);
  if (boards) client.setQueryData(RUNNER_RELEASE_BOARDS_KEY, boards);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <FleetPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('FleetPage release links', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('links each runner a board names to its lane, and the forge line to its lane', () => {
    serveBoards();
    renderFleet('/runners', ALL_BOARDS);
    const link = screen.getByTestId('fleet-node-release-build-1_slot0');
    expect(link).toHaveTextContent('globex · Gate runner · installed aab6147');
    expect(link).toHaveAttribute('href', '/releases/family/globex#lane-gate-runner');
    // The runner says its own version on the code line; the link does not repeat it.
    expect(screen.getByTestId('fleet-node-release-build-1_slot1')).toHaveTextContent(
      /^globex · Gate runner · installed$/
    );
    expect(screen.queryByTestId('fleet-node-release-build-2_slot0')).toBeNull();
    expect(screen.getByTestId('fleet-reviewer-release-node-a_reviewer')).toHaveAttribute(
      'href',
      '/releases/family/globex#lane-reviewer'
    );
    expect(screen.getByTestId('fleet-forge-release')).toHaveAttribute(
      'href',
      '/releases/family/globex#lane-forge-server'
    );
    expect(screen.getByTestId('fleet-node-build-1_slot0')).toHaveAttribute('id', 'runner-build-1-slot0');
  });

  it('draws no links when the boards cannot be read', async () => {
    const calls = serveBoards({ '/api/v1/release-board': 403 });
    renderFleet('/runners', null);
    await waitFor(() => expect(calls).toContain('/api/v1/release-board'));
    expect(screen.getByTestId('fleet-node-build-1_slot0')).toBeInTheDocument();
    expect(screen.queryByTestId('fleet-node-release-build-1_slot0')).toBeNull();
    expect(screen.queryByTestId('fleet-forge-release')).toBeNull();
    expect(screen.getByTestId('fleet-forge-build')).toHaveTextContent('Forge 5.0.0');
  });

  it('highlights the rows ?runners= names and says which are not reporting', () => {
    serveBoards();
    renderFleet('/runners?runners=build-1%2Fslot1%2Cnode-a%2Freviewer%2Cgone%2Fslot9', ALL_BOARDS);
    const picked = screen.getByTestId('fleet-node-build-1_slot1');
    expect(picked).toHaveClass('is-highlighted');
    expect(picked).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('fleet-reviewer-node-a_reviewer')).toHaveClass('is-highlighted');
    expect(screen.getByTestId('fleet-node-build-1_slot0')).not.toHaveClass('is-highlighted');
    const note = screen.getByTestId('fleet-picked');
    expect(note).toHaveTextContent('2 runners linked from a release board are highlighted.');
    expect(note).toHaveTextContent('Not reporting: gone/slot9.');
    expect(within(note).getByRole('link', { name: 'Clear' })).toHaveAttribute('href', '/runners');
  });
});
