// PullPipelineEvents.test.tsx — the PR page's pipeline panel: events for one
// repo + PR with their log tails, and silence when the feed is not readable.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PullPipelineEvents } from '../activity/PullPipelineEvents';
import { htmlShell, mockPipelineApi } from './pipelinePageHelpers';
import { EVENTS } from './pipelineTestData';
import { json, renderAt } from './shiftPageHelpers';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role } }),
}));

function renderPanel(): void {
  renderAt('/', '/', <PullPipelineEvents repo="jeryu/jeryu-web" pr="35" />);
}

describe('PullPipelineEvents', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    role = 'admin';
  });

  it('lists the events of this repo and PR, with the gate log tail one click away', async () => {
    const calls = mockPipelineApi((req) =>
      req.pathname === '/api/v1/events'
        ? json({ events: EVENTS.filter((e) => e.pr === 35), latest_seq: 12 })
        : undefined
    );
    renderPanel();
    const panel = await screen.findByTestId('pull-pipeline-events');
    expect(calls[0].search).toBe('?repo=jeryu%2Fjeryu-web&pr=35&limit=30');
    expect(within(panel).getByText('Pull request merged')).toBeInTheDocument();
    expect(within(panel).getByTestId('activity-event-11')).toHaveTextContent('Merged jeryu/jeryu-web#35');
    fireEvent.click(within(panel).getByRole('button', { name: 'Log for event 10' }));
    expect(within(panel).getByLabelText('Log tail of event 10')).toHaveTextContent('gate: FAILED');
    expect(within(panel).getByRole('link', { name: 'All activity' })).toHaveAttribute(
      'href',
      '/activity?repo=jeryu%2Fjeryu-web&pr=35'
    );
  });

  it('says so when nothing was recorded for the PR', async () => {
    mockPipelineApi((req) => (req.pathname === '/api/v1/events' ? json({ events: [], latest_seq: 0 }) : undefined));
    renderPanel();
    expect(await screen.findByText(/No gate, review or queue events recorded/)).toBeInTheDocument();
  });

  it('is not shown to non-admins or on a server without the feed', async () => {
    role = 'user';
    const calls = mockPipelineApi();
    renderPanel();
    expect(screen.queryByTestId('pull-pipeline-events')).toBeNull();
    expect(calls).toHaveLength(0);
    vi.restoreAllMocks();

    role = 'admin';
    const old = mockPipelineApi((req) => (req.pathname === '/api/v1/events' ? htmlShell() : undefined));
    renderPanel();
    await waitFor(() => expect(old.length).toBeGreaterThan(0));
    expect(screen.queryByTestId('pull-pipeline-events')).toBeNull();
  });
});
