// ShiftWorkersPage.test.tsx — Work → Workers: live table, timeline range
// toggle, capacity chart, and empty / error states.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShiftWorkersPage } from '../shift/ShiftWorkersPage';
import { errorResponse, json, mockShiftApi, renderAt } from './shiftPageHelpers';

function renderWorkers(): void {
  renderAt('/work/shift/workers', '/work/shift/workers', <ShiftWorkersPage />);
}

describe('ShiftWorkersPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the live table, timeline and capacity chart', async () => {
    const calls = mockShiftApi();
    renderWorkers();
    const row = await screen.findByTestId('shift-worker-xbabe0-w1');
    expect(within(row).getByText('healthy')).toBeInTheDocument();
    expect(within(row).getByText('working · agent')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: '20260919-0900-q1q' })).toHaveAttribute(
      'href',
      '/work/shift?family=jeryu&todo=20260919-0900-q1q'
    );
    expect(within(screen.getByTestId('shift-worker-xbabe1-w2')).getByText('stale')).toBeInTheDocument();
    expect(screen.getByText('Live · 1 of 2 healthy')).toBeInTheDocument();

    const timeline = await screen.findByTestId('shift-timeline');
    expect(within(timeline).getByRole('img', { name: /Worker timeline: 1 slot/ })).toBeInTheDocument();
    expect(timeline.querySelectorAll('rect.shift-chart__seg')).toHaveLength(2);
    expect(within(timeline).getByText('alton@xbabe0/w1')).toBeInTheDocument();
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

  it('renders empty and error states', async () => {
    mockShiftApi((req) => {
      if (req.pathname === '/api/v1/shift/workers') return json({ generated_at: 'x', workers: [] });
      if (req.pathname === '/api/v1/shift/workers/history') return errorResponse(500, 'db down');
      return undefined;
    });
    renderWorkers();
    expect(await screen.findByText('No worker has sent a heartbeat.')).toBeInTheDocument();
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
