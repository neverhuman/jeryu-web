// ReleaseBoardPage.test.tsx — /releases defaults to the family release board.
// Every audit fixture renders; a stage opens its detail; the pins and notes
// views; the live overlay; freshness; and the three ways there is no board to
// show (403, nothing reported, non-admin), each of which keeps the
// per-repository view below the note. `?repo=` is still the per-repo view.

import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReleaseBoard } from '../../api/types/releaseBoard';
import { removeBrowserText } from '../../storage/browserStorage';
import {
  ALL_BOARDS,
  JERYU_BOARD,
  listResponse,
  VEOX_AI_BOARD,
} from '../../test/fixtures/releaseBoard';
import { BOARD_FAMILY_STORAGE_KEY } from '../releaseBoard/model';
import { ReleasesPage } from '../ReleasesPage';
import { mockPipelineApi } from './pipelinePageHelpers';
import { errorResponse, json, renderAt, type Override } from './shiftPageHelpers';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role }, isPending: false }),
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

function open(path: string): void {
  renderAt(path, '/releases', <ReleasesPage />);
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
      expect(screen.getByRole('button', { name: family })).toHaveAttribute('aria-pressed', 'true');
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
    expect(screen.getByRole('button', { name: 'jain' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'veox-ai' }));
    expect(await screen.findByText(VEOX_AI_BOARD.summary)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'veox-ai' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens a stage into its targets, what promoting ships, the rollback and the command', async () => {
    serveBoards();
    open('/releases?family=veox-ai');
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
    expect(within(detail).getByRole('rowheader', { name: 'xbabe1 · prod worker' })).toBeInTheDocument();
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
    open('/releases?family=jeryu');
    const idle = await screen.findByTestId('release-board-stage-forge-server-dev-canary-stable');
    expect(idle).toHaveClass('release-board__cell--never-deployed');
    fireEvent.click(idle);
    expect(screen.getByTestId('release-board-detail-forge-server')).toHaveTextContent(
      'Declared but never deployed to'
    );
    // jeryu production ships nothing: it already runs main.
    fireEvent.click(screen.getByTestId('release-board-stage-forge-server-production'));
    expect(screen.getByTestId('release-board-detail-forge-server')).toHaveTextContent(
      'Nothing to ship'
    );
  });

  it('shows how much work reached each point, with counts and percentages', async () => {
    serveBoards();
    open('/releases?family=veox-ai');
    const work = await screen.findByTestId('release-board-work');
    expect(within(work).getByRole('img')).toHaveAccessibleName(/^7 todos\. Live: 3/);
    expect(screen.getByTestId('release-board-work-live')).toHaveTextContent('Live 3 (43%)');
    expect(screen.getByTestId('release-board-work-blocked')).toHaveTextContent('Blocked 2 (29%)');
    expect(work).toHaveTextContent(VEOX_AI_BOARD.work?.method ?? 'x');
    expect(work).toHaveTextContent(VEOX_AI_BOARD.work?.unlinked ?? 'x');
  });

  it('switches to pinned vs released and release notes', async () => {
    serveBoards();
    open('/releases?family=jeryu');
    fireEvent.click(await screen.findByRole('tab', { name: 'Pinned vs released' }));
    const pins = screen.getByTestId('release-board-pins');
    expect(within(pins).getByRole('columnheader', { name: 'In prod' })).toBeInTheDocument();
    const releaseOps = screen.getByTestId('release-board-pin-jeryu-release-ops');
    expect(releaseOps).toHaveTextContent('42');
    expect(releaseOps).toHaveTextContent('the pin policy blocks the bump');
    expect(screen.getByRole('tab', { name: 'Pinned vs released' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Release notes' }));
    const notes = screen.getByTestId('release-board-notes');
    expect(notes).toHaveTextContent(JERYU_BOARD.notes?.title ?? 'x');
    expect(notes).toHaveTextContent('Nothing is waiting.');
  });

  it('overlays a deployment the forge reported after the snapshot', async () => {
    serveBoards(ALL_BOARDS, (req) => {
      if (req.pathname !== '/api/v3/repos/veox-ai/ai-veox-app/environments') return undefined;
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
          creator: { login: 'alton2' },
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
    open('/releases?family=veox-ai');
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
      ...VEOX_AI_BOARD,
      problems: [{ source: 'ssh xbabe3', message: 'connection timed out' }],
    };
    serveBoards([broken]);
    open('/releases?family=veox-ai');
    expect(await screen.findByTestId('release-board-stale')).toHaveTextContent('stale');
    expect(screen.getByTestId('release-board-observed')).toHaveTextContent(
      'observed 20 min ago · manual run on xbabe0'
    );
    const problems = screen.getByTestId('release-board-problems');
    expect(problems).toHaveTextContent('could not read 1 source');
    expect(problems).toHaveTextContent('ssh xbabe3: connection timed out');
  });

  it('does not flag a snapshot taken a few minutes ago', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T15:45:00Z'));
    serveBoards();
    open('/releases?family=veox-ai');
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
      'No family has reported a board yet — the collector on xbabe0 posts one every 5 minutes and after every release.'
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
    open('/releases?repo=veox-ai%2Fai-veox-app');
    expect(await screen.findByLabelText('Repository or family')).toHaveValue('repo:veox-ai/ai-veox-app');
    expect(screen.getByRole('link', { name: 'Per repository' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByTestId('release-board')).toBeNull();
    expect(calls.some((c) => c.pathname.startsWith('/api/v1/release-board'))).toBe(false);
  });
});
