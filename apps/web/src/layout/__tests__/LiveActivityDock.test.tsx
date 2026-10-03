// LiveActivityDock.test.tsx — the dock shows the newest events to admins,
// remembers its collapsed state, and stays out of the way otherwise.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveActivityDock } from '../LiveActivityDock';
import { htmlShell, mockPipelineApi } from '../../pages/__tests__/pipelinePageHelpers';
import { renderAt } from '../../pages/__tests__/shiftPageHelpers';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role } }),
}));

// The gate's Node defines a global localStorage that is undefined without a
// backing file, and it shadows jsdom's. The dock goes through the storage
// adapter, so the test installs its own Storage, as the adapter's test does.
function makeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('LiveActivityDock', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: makeStorage(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    role = 'admin';
  });

  it('is one quiet line until opened, then lists the newest events in plain words, and remembers', async () => {
    const calls = mockPipelineApi();
    renderAt('/needs-you', '/needs-you', <LiveActivityDock />);
    const toggle = await screen.findByRole('button', { name: 'Live activity' });
    // Collapsed by default: the newest event on the header line, nothing listed.
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/Release staged · Staged prod-20260919T130210Z/)).toBeInTheDocument();
    expect(screen.queryByText('Merged jeryu/jeryu-web#35')).toBeNull();
    expect(calls.some((c) => c.pathname === '/api/v1/events' && c.search === '?limit=16')).toBe(true);
    // The count is the Needs you list (3 urgent rows), not how many of the
    // last few events were flagged, and it opens that list.
    expect(screen.getByText('3 need you')).toBeInTheDocument();
    expect(screen.getByTestId('activity-dock-needs-you')).toHaveAttribute('href', '/needs-you');
    expect(screen.getByRole('link', { name: 'All activity' })).toHaveAttribute('href', '/activity');

    fireEvent.click(toggle);
    expect(screen.getByText('Merged jeryu/jeryu-web#35')).toBeInTheDocument();
    // Plain words, not wire kinds.
    expect(screen.getByText('Gate failed')).toBeInTheDocument();
    expect(screen.queryByText('gate.log')).toBeNull();
    expect(window.localStorage.getItem('jeryu.activityDock.expanded.v1')).toBe('1');
  });

  it('starts open when the reader left it open', async () => {
    window.localStorage.setItem('jeryu.activityDock.expanded.v1', '1');
    mockPipelineApi();
    renderAt('/needs-you', '/needs-you', <LiveActivityDock />);
    const toggle = await screen.findByRole('button', { name: 'Live activity' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('stays off the Activity page, which is the same feed at full size', async () => {
    const calls = mockPipelineApi();
    renderAt('/activity', '/activity', <LiveActivityDock />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(screen.queryByTestId('activity-dock')).toBeNull();
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
