// WorkersPanel.test.tsx — the opened workers strip: live table, timeline range
// toggle, capacity chart, and empty / error states.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkersPanel } from '../shift/WorkersPanel';
import { errorResponse, json, mockShiftApi, renderAt } from './shiftPageHelpers';
import { HISTORY, POOL_WORKERS, WORKERS } from './shiftTestData';

function renderWorkers(): void {
  renderAt('/work', '/work', <WorkersPanel />);
}

describe('WorkersPanel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the live table, timeline and capacity chart', async () => {
    const calls = mockShiftApi();
    renderWorkers();
    const row = await screen.findByTestId('shift-worker-node-0-w1');
    expect(within(row).getByText('healthy')).toBeInTheDocument();
    expect(within(row).getByText('working · agent')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: '20260919-0900-q1q' })).toHaveAttribute(
      'href',
      '/work/20260919-0900-q1q'
    );
    // node-1/w2 was last seen long ago: a ghost, hidden until asked for.
    expect(screen.queryByTestId('shift-worker-node-1-w2')).toBeNull();
    expect(screen.getByText('Live · 1 of 1 healthy')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show 1 stale slot/ }));
    const stale = within(screen.getByTestId('shift-worker-node-1-w2')).getByText('stale');
    expect(stale).toHaveClass('page__pill--warning');
    expect(screen.getByText('Live · 1 of 2 healthy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hide 1 stale slot/ })).toHaveAttribute('aria-pressed', 'true');

    const timeline = await screen.findByTestId('shift-timeline');
    expect(within(timeline).getByRole('img', { name: /Worker timeline: 1 slot/ })).toBeInTheDocument();
    expect(timeline.querySelectorAll('rect.shift-chart__seg')).toHaveLength(2);
    // Lanes are named by family and slot: the operator is the same on every line.
    expect(within(timeline).getByText('jeryu · w1')).toBeInTheDocument();
    const capacity = screen.getByTestId('shift-capacity');
    expect(within(capacity).getByRole('img', { name: /peak 2 busy of 6 planned/ })).toBeInTheDocument();
    expect(capacity.querySelector('path.shift-chart__planned')).not.toBeNull();
    expect(capacity.querySelector('polyline.shift-chart__queue')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '7d' }));
    await waitFor(() =>
      expect(calls.some((c) => c.pathname === '/api/v1/shift/workers/history' && c.search === '?hours=168')).toBe(true)
    );
    expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('folds supervisor slots out of the table and the timeline until asked for', async () => {
    const supervisor = { ...WORKERS.workers[0], slot: 'supervisor', state: 'idle', stage: null, todo_id: null };
    mockShiftApi((req) => {
      if (req.pathname === '/api/v1/shift/workers') {
        return json({ ...WORKERS, workers: [WORKERS.workers[0], supervisor] });
      }
      if (req.pathname === '/api/v1/shift/workers/history') {
        return json({ ...HISTORY, slots: [...HISTORY.slots, { ...HISTORY.slots[0], slot: 'supervisor' }] });
      }
      return undefined;
    });
    renderWorkers();
    await screen.findByTestId('shift-worker-node-0-w1');
    expect(screen.queryByTestId('shift-worker-node-0-supervisor')).toBeNull();
    expect(screen.getByText('Live · 1 of 1 healthy')).toBeInTheDocument();
    const timeline = await screen.findByTestId('shift-timeline');
    expect(within(timeline).getByRole('img', { name: /Worker timeline: 1 slot/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show 1 supervisor' }));
    expect(screen.getByTestId('shift-worker-node-0-supervisor')).toBeInTheDocument();
    expect(within(timeline).getByRole('img', { name: /Worker timeline: 2 slots/ })).toBeInTheDocument();
    expect(within(timeline).getByText('jeryu · supervisor')).toBeInTheDocument();
  });

  it('groups an external pool under its family, with state, reason and load', async () => {
    mockShiftApi((req) =>
      req.pathname === '/api/v1/shift/workers' ? json(POOL_WORKERS) : undefined
    );
    renderWorkers();
    const group = await screen.findByTestId('shift-pool-globex');
    expect(within(group).getByText('globex pool: 3 of 4 available, 2 busy (5 active)')).toHaveAttribute(
      'title',
      'member-4: paused \u2014 sign-in needed'
    );
    const paused = within(group).getByTestId('shift-pool-slot-node-b-member-4');
    expect(within(paused).getByText('paused')).toBeInTheDocument();
    expect(within(paused).getByText('sign-in needed')).toBeInTheDocument();
    expect(within(paused).getByText('0 of 4')).toBeInTheDocument();
    expect(
      within(within(group).getByTestId('shift-pool-slot-node-b-member-1')).getByText('3 of 4')
    ).toBeInTheDocument();
    // A pool member is not a queue slot: the live table keeps its own count.
    expect(screen.getByText('Live \u00b7 1 of 1 healthy')).toBeInTheDocument();
    expect(screen.queryByTestId('shift-worker-node-b-member-1')).toBeNull();
  });

  it('renders the pool of a family whose queue has no slots at all', async () => {
    const pools = POOL_WORKERS.workers.filter((w) => w.kind === 'pool');
    mockShiftApi((req) =>
      req.pathname === '/api/v1/shift/workers'
        ? json({ ...POOL_WORKERS, workers: pools })
        : undefined
    );
    renderWorkers();
    expect(await screen.findByTestId('shift-pool-globex')).toBeInTheDocument();
    expect(screen.getByText('No queue slot has sent a heartbeat.')).toBeInTheDocument();
  });

  it('renders empty and error states', async () => {
    mockShiftApi((req) => {
      if (req.pathname === '/api/v1/shift/workers') return json({ generated_at: 'x', workers: [] });
      if (req.pathname === '/api/v1/shift/workers/history') return errorResponse(500, 'db down');
      return undefined;
    });
    renderWorkers();
    expect(await screen.findByText('No queue slot has sent a heartbeat.')).toBeInTheDocument();
    expect(await screen.findByText('Could not load worker history.')).toBeInTheDocument();
  });

  it('renders empty history', async () => {
    mockShiftApi((req) =>
      req.pathname === '/api/v1/shift/workers/history'
        ? json({ from: 'a', to: 'b', slots: [], capacity: [] })
        : undefined
    );
    renderWorkers();
    expect(await screen.findByText('No worker activity in this window.')).toBeInTheDocument();
    expect(screen.getByText('No capacity samples in this window.')).toBeInTheDocument();
  });
});
