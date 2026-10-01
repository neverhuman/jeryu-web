// ReleaseBoardPage.test.tsx — /releases defaults to the family release board.
// Every audit fixture renders; a stage opens its detail; the pins and notes
// views; the live overlay; freshness; and the three ways there is no board to
// show (403, nothing reported, non-admin), each of which keeps the
// per-repository view below the note. `?repo=` is still the per-repo view.
// The board's address is `/releases/family/<family>`; its lanes are
// `#lane-<id>` anchors, and a target that names runners links to /runners.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReleaseBoard } from '../../api/types/releaseBoard';
import { removeBrowserText } from '../../storage/browserStorage';
import {
  ACME_BOARD,
  ALL_BOARDS,
  GLOBEX_BOARD,
  listResponse,
} from '../../test/fixtures/releaseBoard';
import { BOARD_FAMILY_STORAGE_KEY } from '../releaseBoard/model';
import { LANE_TARGET_CLASS } from '../releaseBoard/ReleaseBoardView';
import { ReleasesPage } from '../ReleasesPage';
import { mockPipelineApi } from './pipelinePageHelpers';
import { errorResponse, json, type Override } from './shiftPageHelpers';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'operator', role }, isPending: false }),
}));

function serveBoards(boards: ReleaseBoard[] = ALL_BOARDS, extra?: Override) {
  return mockPipelineApi((req) => {
    const custom = extra?.(req);
    if (custom) return custom;
    if (req.pathname === '/api/v1/release-board') return json(listResponse(boards));
    const family = req.pathname.match(/^\/api\/v1\/release-board\/([^/]+)$/)?.[1];
    if (family) {
      const found = boards.find((b) => b.family === decodeURIComponent(family));
      return found
        ? json({ ...found, accepted_at: found.observed_at })
        : errorResponse(404, 'no board');
    }
    return undefined;
  });
}

/** Where the router is now, for the tests that follow a link. */
function LocationProbe(): JSX.Element {
  const location = useLocation();
  return (
    <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>
  );
}

/** Both of the page's routes: `/releases[?…]` and the board's own path. */
function open(path: string): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/releases" element={<ReleasesPage />} />
          <Route path="/releases/family/:family" element={<ReleasesPage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function pill(family: string): HTMLElement {
  return screen.getByRole('link', { name: family });
}

describe('ReleasesPage — family release board', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    removeBrowserText('durable', BOARD_FAMILY_STORAGE_KEY);
    role = 'admin';
  });

  it.each(ALL_BOARDS)(
    'renders the $family fixture: every lane, every stage, and the views it has',
    async (board) => {
      const { family } = board;
      serveBoards();
      open(`/releases?family=${family}`);
      expect(await screen.findByTestId('release-board-summary')).toHaveTextContent(board.summary);
      expect(pill(family)).toHaveAttribute('aria-current', 'page');
      expect(pill(family)).toHaveAttribute('href', `/releases/family/${family}`);
      for (const lane of board.lanes) {
        const section = screen.getByTestId(`release-board-lane-${lane.id}`);
        expect(within(section).getByRole('heading', { level: 3, name: lane.name })).toBeInTheDocument();
        for (const stage of lane.stages) {
          const cell = within(section).getByTestId(`release-board-stage-${lane.id}-${stage.id}`);
          expect(cell).toHaveAttribute('aria-expanded', 'false');
          expect(cell).toHaveTextContent(stage.status);
        }
      }
      const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
      expect(tabs).toEqual(
        board.pins
          ? ['Deliverables', 'Pinned vs released', 'Release notes']
          : ['Deliverables', 'Release notes']
      );
      expect(screen.getByTestId('release-board-observed')).toHaveTextContent(
        `on ${board.collector.host}`
      );
      expect(screen.queryByTestId('release-board-problems')).toBeNull();
      // The per-repository view is one link away, not on the board.
      expect(screen.getByRole('link', { name: 'Per repository' })).toHaveAttribute(
        'href',
        '/releases?repo=jeryu%2Fjeryu-deploy'
      );
      expect(screen.queryByTestId('releases-scope')).toBeNull();
    }
  );

  it('defaults to the first reported family and remembers a pick', async () => {
    serveBoards();
    open('/releases');
    expect(await screen.findByTestId('release-board-summary')).toHaveTextContent(
      ALL_BOARDS[0]?.summary ?? ''
    );
    expect(pill('acme')).toHaveAttribute('aria-current', 'page');
    fireEvent.click(pill('globex'));
    expect(await screen.findByText(GLOBEX_BOARD.summary)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/releases/family/globex');
    expect(pill('globex')).toHaveAttribute('aria-current', 'page');
  });

  it('opens a stage into its targets, what promoting ships, the rollback and the command', async () => {
    serveBoards();
    open('/releases?family=acme');
    const prod = await screen.findByTestId('release-board-stage-cloud-app-prod');
    expect(prod).toHaveTextContent('v0.8.12 · 96d8374');
    expect(prod).toHaveTextContent('known by reported');
    const detail = screen.getByTestId('release-board-detail-cloud-app');
    expect(prod).toHaveAttribute('aria-controls', detail.id);

    fireEvent.click(prod);
    expect(prod).toHaveAttribute('aria-expanded', 'true');
    expect(within(detail).getByRole('heading', { name: 'Cloud app · prod' })).toBeInTheDocument();
    const rows = within(detail).getAllByRole('row');
    expect(rows).toHaveLength(6); // header + five targets
    expect(within(detail).getByRole('rowheader', { name: 'node-b · prod worker' })).toBeInTheDocument();
    expect(within(detail).getAllByText('behind')).toHaveLength(4);
    expect(within(detail).getByText('Promoting ships')).toBeInTheDocument();
    expect(within(detail).getByText(/a275def · deploy: report each deploy/)).toBeInTheDocument();
    expect(within(detail).getByText('a new, higher v* tag on the old commit')).toBeInTheDocument();
    expect(within(detail).getByText(/^A person runs this/)).toBeInTheDocument();
    expect(
      within(detail).getByRole('button', { name: 'Copy promote command for Cloud app prod' })
    ).toBeInTheDocument();

    // Another stage in the lane replaces it; pressing it again closes the detail.
    const stage = screen.getByTestId('release-board-stage-cloud-app-stage');
    fireEvent.click(stage);
    expect(prod).toHaveAttribute('aria-expanded', 'false');
    expect(within(detail).getByRole('heading', { name: 'Cloud app · stage' })).toBeInTheDocument();
    fireEvent.click(stage);
    expect(detail).toBeEmptyDOMElement();
  });

  it('draws a never-deployed stage the way the design does', async () => {
    serveBoards();
    open('/releases?family=globex');
    const idle = await screen.findByTestId('release-board-stage-forge-server-dev');
    expect(idle).toHaveClass('release-board__cell--never-deployed');
    fireEvent.click(idle);
    expect(screen.getByTestId('release-board-detail-forge-server')).toHaveTextContent(
      'Declared but never deployed to'
    );
    // globex production ships nothing: it already runs main.
    fireEvent.click(screen.getByTestId('release-board-stage-forge-server-production'));
    expect(screen.getByTestId('release-board-detail-forge-server')).toHaveTextContent(
      'Nothing to ship'
    );
  });

  it('lays every lane on the declared columns, with skipped columns and tool rows shown', async () => {
    serveBoards();
    open('/releases?family=globex');
    const head = await screen.findByTestId('release-board-columns');
    expect(head).toHaveTextContent('maindevstageprod');
    // A column the lane skips says so rather than vanishing.
    expect(screen.getByTestId('release-board-slot-web-ui-dev')).toHaveTextContent('not used');
    expect(screen.getByTestId('release-board-slot-web-ui-stage')).toHaveTextContent('pinned');
    // Shift work sits with main; a stage in no column follows the grid.
    const main = screen.getByTestId('release-board-slot-forge-server-main');
    expect(within(main).getByTestId('release-board-stage-forge-server-shift')).toBeInTheDocument();
    expect(within(main).getByTestId('release-board-stage-forge-server-main')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Forge server by stage' })).not.toContainElement(
      screen.getByTestId('release-board-stage-forge-server-canary-stable')
    );
    // Each tool is its own row under one Tools heading.
    const tools = screen.getByRole('group', { name: 'Tools' });
    for (const id of ['gate-runner', 'reviewer', 'scorer']) {
      expect(within(tools).getByTestId(`release-board-lane-${id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`release-board-slot-${id}-stage`)).toHaveTextContent('not used');
    }
    expect(screen.getByTestId('release-board-slot-reviewer-prod')).toHaveTextContent('local fork');
  });

  it('keeps the free stage track for a board that declares no columns', async () => {
    serveBoards();
    open('/releases?family=acme');
    await screen.findByTestId('release-board-lane-cloud-app');
    expect(screen.queryByTestId('release-board-columns')).toBeNull();
    expect(screen.getByRole('list', { name: 'Cloud app stages, in order' })).toBeInTheDocument();
  });

  it('marks a lane shared from another family as read-only and names its owner', async () => {
    serveBoards();
    open('/releases?family=initech');
    expect(await screen.findByTestId('release-board-read-only-cloud-appliance')).toHaveTextContent(
      'read-only here · owned by acme'
    );
    expect(screen.queryByTestId('release-board-read-only-free-download')).toBeNull();
  });

  it('shows how much work reached each point, with counts and percentages', async () => {
    serveBoards();
    open('/releases?family=acme');
    const work = await screen.findByTestId('release-board-work');
    expect(within(work).getByRole('img')).toHaveAccessibleName(/^7 todos\. Live: 3/);
    expect(screen.getByTestId('release-board-work-live')).toHaveTextContent('Live 3 (43%)');
    expect(screen.getByTestId('release-board-work-blocked')).toHaveTextContent('Blocked 2 (29%)');
    expect(work).toHaveTextContent(ACME_BOARD.work?.method ?? 'x');
    expect(work).toHaveTextContent(ACME_BOARD.work?.unlinked ?? 'x');
  });

  it('switches to pinned vs released and release notes', async () => {
    serveBoards();
    open('/releases?family=globex');
    fireEvent.click(await screen.findByRole('tab', { name: 'Pinned vs released' }));
    const pins = screen.getByTestId('release-board-pins');
    expect(within(pins).getByRole('columnheader', { name: 'In prod' })).toBeInTheDocument();
    const releaseOps = screen.getByTestId('release-board-pin-release-ops');
    expect(releaseOps).toHaveTextContent('42');
    expect(releaseOps).toHaveTextContent('the pin policy blocks the bump');
    expect(screen.getByRole('tab', { name: 'Pinned vs released' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Release notes' }));
    const notes = screen.getByTestId('release-board-notes');
    expect(notes).toHaveTextContent(GLOBEX_BOARD.notes?.title ?? 'x');
    expect(notes).toHaveTextContent('Nothing is waiting.');
  });

  it('overlays a deployment the forge reported after the snapshot', async () => {
    serveBoards(ALL_BOARDS, (req) => {
      if (req.pathname !== '/api/v3/repos/acme/app/environments') return undefined;
      const sha = '1a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d';
      const current = {
        deployment: {
          id: 40,
          sha,
          ref: 'v0.8.13',
          task: 'deploy',
          environment: 'production',
          description: null,
          payload: {},
          creator: { login: 'deployer' },
          created_at: '2026-09-28T15:55:00Z',
          production_environment: true,
          transient_environment: false,
        },
        status: null,
        succeeded: true,
      };
      return json({
        total_count: 1,
        environments: [{ name: 'production', latest: current, current, previous: null }],
      });
    });
    open('/releases?family=acme');
    const prod = await screen.findByTestId('release-board-stage-cloud-app-prod');
    expect(await within(prod).findByTestId('release-board-overlay')).toHaveTextContent(
      'reported after this snapshot'
    );
    expect(prod).toHaveTextContent('v0.8.13 · 1a2b3c4');
    // The dev and stage environments reported nothing newer: snapshot stands.
    expect(screen.getByTestId('release-board-stage-cloud-app-dev')).toHaveTextContent('a275def');
    fireEvent.click(prod);
    expect(screen.getByTestId('release-board-detail-cloud-app')).toHaveTextContent(
      'The snapshot showed v0.8.12 · 96d8374'
    );
  });

  it('flags a snapshot older than 15 minutes and lists what the collector could not read', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T16:00:00Z'));
    const broken: ReleaseBoard = {
      ...ACME_BOARD,
      problems: [{ source: 'ssh node-c', message: 'connection timed out' }],
    };
    serveBoards([broken]);
    open('/releases?family=acme');
    expect(await screen.findByTestId('release-board-stale')).toHaveTextContent('stale');
    expect(screen.getByTestId('release-board-observed')).toHaveTextContent(
      'observed 20 min ago · manual run on collector-1'
    );
    const problems = screen.getByTestId('release-board-problems');
    expect(problems).toHaveTextContent('could not read 1 source');
    expect(problems).toHaveTextContent('ssh node-c: connection timed out');
  });

  it('does not flag a snapshot taken a few minutes ago', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T15:45:00Z'));
    serveBoards();
    open('/releases?family=acme');
    expect(await screen.findByTestId('release-board-observed')).toHaveTextContent('observed 5 min ago');
    expect(screen.queryByTestId('release-board-stale')).toBeNull();
  });

  it('says the board needs an admin session on a 403, and keeps the per-repository view', async () => {
    serveBoards(ALL_BOARDS, (req) =>
      req.pathname === '/api/v1/release-board' ? errorResponse(403, 'admin only') : undefined
    );
    open('/releases');
    expect(await screen.findByTestId('release-board-needs-admin')).toHaveTextContent(
      'The release board needs an admin session.'
    );
    expect(screen.getByLabelText('Repository or family')).toHaveValue('repo:jeryu/jeryu-deploy');
  });

  it('says no family has reported yet when the list is empty, and keeps the per-repository view', async () => {
    serveBoards([]);
    open('/releases');
    expect(await screen.findByTestId('release-board-none')).toHaveTextContent(
      'No family has reported a board yet — the collector posts one every 5 minutes and after every release.'
    );
    expect(screen.getByLabelText('Repository or family')).toBeInTheDocument();
  });

  it('never asks a non-admin session for the board', async () => {
    role = 'user';
    const calls = serveBoards();
    open('/releases');
    expect(await screen.findByTestId('release-board-needs-admin')).toBeInTheDocument();
    expect(screen.getByLabelText('Repository or family')).toBeInTheDocument();
    expect(calls.some((c) => c.pathname.startsWith('/api/v1/release-board'))).toBe(false);
  });

  it('keeps ?repo= as the per-repository view, without reading the board', async () => {
    const calls = serveBoards();
    open('/releases?repo=acme%2Fapp');
    expect(await screen.findByLabelText('Repository or family')).toHaveValue('repo:acme/app');
    expect(screen.getByRole('link', { name: 'Per repository' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByTestId('release-board')).toBeNull();
    expect(calls.some((c) => c.pathname.startsWith('/api/v1/release-board'))).toBe(false);
  });
  it('reads the family from the board path', async () => {
    serveBoards();
    open('/releases/family/initech');
    expect(await screen.findByTestId('release-board-summary')).toHaveTextContent(
      ALL_BOARDS[2]?.summary ?? 'x'
    );
    expect(pill('initech')).toHaveAttribute('aria-current', 'page');
  });

  it('gives every lane an anchor, and scrolls to and rings the lane the hash names', async () => {
    const scrolled: string[] = [];
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: Element) {
        scrolled.push(this.id);
      },
    });
    try {
      serveBoards();
      open('/releases/family/globex#lane-gate-runner');
      const lane = await screen.findByTestId('release-board-lane-gate-runner');
      expect(lane).toHaveAttribute('id', 'lane-gate-runner');
      expect(screen.getByTestId('release-board-lane-forge-server')).toHaveAttribute(
        'id',
        'lane-forge-server'
      );
      await vi.waitFor(() => expect(scrolled).toEqual(['lane-gate-runner']));
      expect(lane).toHaveClass(LANE_TARGET_CLASS);
      expect(screen.getByTestId('release-board-lane-reviewer')).not.toHaveClass(LANE_TARGET_CLASS);
    } finally {
      if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original);
      else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });

  it('ignores a hash that names no lane of the board', async () => {
    serveBoards();
    open('/releases/family/globex#lane-nowhere');
    await screen.findByTestId('release-board-lane-gate-runner');
    expect(document.querySelector(`.${LANE_TARGET_CLASS}`)).toBeNull();
  });

  it('links a target that names its runners to them on /runners', async () => {
    serveBoards();
    open('/releases/family/globex');
    fireEvent.click(await screen.findByTestId('release-board-stage-gate-runner-installed'));
    const link = within(screen.getByTestId('release-board-detail-gate-runner')).getByRole('link', {
      name: '2 runners',
    });
    expect(link).toHaveAttribute('href', '/runners?runners=build-1%2Fslot0%2Cbuild-1%2Fslot1');
    expect(link).toHaveAttribute('title', 'build-1/slot0, build-1/slot1');

    fireEvent.click(screen.getByTestId('release-board-stage-reviewer-installed'));
    expect(
      within(screen.getByTestId('release-board-detail-reviewer')).getByRole('link', { name: '1 runner' })
    ).toHaveAttribute('href', '/runners?runners=node-a%2Freviewer');
  });

  it('shows no runner link for a target without runners (an older collector)', async () => {
    serveBoards();
    open('/releases/family/acme');
    fireEvent.click(await screen.findByTestId('release-board-stage-cloud-app-prod'));
    expect(screen.queryByTestId('release-board-target-runners')).toBeNull();
  });
});
