// LiveActivityDock.test.tsx — the dock shows the newest events to admins,
// remembers its collapsed state, and stays out of the way otherwise.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LiveActivityDock } from '../LiveActivityDock';
import { htmlShell, mockPipelineApi } from '../../pages/__tests__/pipelinePageHelpers';
import { renderAt } from '../../pages/__tests__/shiftPageHelpers';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role } }),
}));

describe('LiveActivityDock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    role = 'admin';
  });

  it('lists the newest events, flags the ones that need a human, and remembers collapse', async () => {
    const calls = mockPipelineApi();
    renderAt('/', '/', <LiveActivityDock />);
    expect(await screen.findByText('Merged jeryu/jeryu-web#35')).toBeInTheDocument();
    expect(calls.some((c) => c.pathname === '/api/v1/events' && c.search === '?limit=8')).toBe(true);
    expect(screen.getByText('2 need you')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All activity' })).toHaveAttribute('href', '/activity');

    fireEvent.click(screen.getByRole('button', { name: 'Live activity' }));
    expect(screen.queryByText('Merged jeryu/jeryu-web#35')).toBeNull();
    // Collapsed, the header still carries the newest event.
    expect(screen.getByText(/Staged prod-20260919T130210Z/)).toBeInTheDocument();
    expect(window.localStorage.getItem('jeryu.activityDock.collapsed.v1')).toBe('1');
  });

  it('starts collapsed when the preference says so', async () => {
    window.localStorage.setItem('jeryu.activityDock.collapsed.v1', '1');
    mockPipelineApi();
    renderAt('/', '/', <LiveActivityDock />);
    const toggle = await screen.findByRole('button', { name: 'Live activity' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders nothing for non-admins or on a server without the feed', async () => {
    role = 'user';
    const calls = mockPipelineApi();
    renderAt('/', '/', <LiveActivityDock />);
    expect(screen.queryByTestId('activity-dock')).toBeNull();
    expect(calls).toHaveLength(0);
    vi.restoreAllMocks();

    role = 'admin';
    const old = mockPipelineApi((req) => (req.pathname === '/api/v1/events' ? htmlShell() : undefined));
    renderAt('/', '/', <LiveActivityDock />);
    await waitFor(() => expect(old.length).toBeGreaterThan(0));
    expect(screen.queryByTestId('activity-dock')).toBeNull();
  });
});
