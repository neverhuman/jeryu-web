// ShiftQueuePage.test.tsx — Work → Queue: shifts panel, filters, row expansion,
// admin-only row actions and "Open review PR", and the UX states.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShiftQueuePage } from '../shift/ShiftQueuePage';
import { errorResponse, json, mockShiftApi, renderAt } from './shiftPageHelpers';
import { TODOS } from './shiftTestData';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role } }),
}));

function renderQueue(path = '/work/shift'): void {
  renderAt(path, '/work/shift', <ShiftQueuePage />);
}

describe('ShiftQueuePage', () => {
  beforeEach(() => {
    role = 'admin';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-19T16:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lists shifts with last night highlighted and todos with commits', async () => {
    const calls = mockShiftApi();
    renderQueue();
    const night = await screen.findByTestId('shift-branch-nightshift/2026-09-18');
    expect(night).toHaveClass('is-last-night');
    expect(within(night).getByText('last night')).toBeInTheDocument();
    const bullet = screen.getByTestId('shift-branch-bulletshift/2026-09-17');
    expect(within(bullet).getByRole('link', { name: 'PR #12 (open)' })).toHaveAttribute(
      'href',
      'https://git.example/jeryu/jeryu-web/pulls/12'
    );
    const done = await screen.findByTestId('shift-todo-20260918-2201-a9z');
    expect(within(done).getByRole('link', { name: 'jeryu-deploy@abcdef12' })).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-deploy/code'
    );
    expect(screen.getByRole('columnheader', { name: 'Cost' })).toBeInTheDocument();
    expect(within(done).getByText('$1.25')).toBeInTheDocument();
    expect(within(screen.getByTestId('shift-todo-20260918-1832-k3f')).getByText('—', { selector: '.shift__cost' })).toBeInTheDocument();
    expect(calls.some((c) => c.pathname === '/api/v1/shift/todos' && c.search === '?family=jeryu')).toBe(true);
    expect(calls.some((c) => c.pathname === '/api/v1/shift/shifts' && c.search === '?family=jeryu')).toBe(true);
  });

  it('filters and expands a row to its body, note and attempts', async () => {
    mockShiftApi();
    renderQueue();
    await screen.findByTestId('shift-todo-20260918-2201-a9z');
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'night' } });
    expect(screen.queryByTestId('shift-todo-20260918-1832-k3f')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add shift heartbeat' }));
    const detail = screen.getByTestId('shift-todo-detail-20260918-2201-a9z');
    expect(within(detail).getByText('POST heartbeats every 30 s.')).toBeInTheDocument();
    expect(within(detail).getByText('green on first try')).toBeInTheDocument();
    expect(within(detail).getByText('alton@xbabe0/w1')).toBeInTheDocument();
    expect(within(detail).getByText('$1.25')).toBeInTheDocument();
  });

  it('focuses filed todos from ?todo=', async () => {
    mockShiftApi();
    renderQueue('/work/shift?family=jeryu&todo=20260918-1832-k3f');
    expect(await screen.findByTestId('shift-todo-detail-20260918-1832-k3f')).toBeInTheDocument();
    expect(screen.queryByTestId('shift-todo-20260918-2201-a9z')).toBeNull();
  });

  it('posts admin row actions and opens a review PR', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('waiting on design');
    const calls = mockShiftApi((req) => {
      if (req.method !== 'POST') return undefined;
      if (req.pathname.endsWith('/pr')) {
        return json({ prs: [{ repo: 'jeryu-deploy', number: 7, url: 'https://git.example/pr/7', created: true }] });
      }
      return json(TODOS[0]);
    });
    renderQueue();
    await screen.findByTestId('shift-todo-20260918-1832-k3f');
    fireEvent.click(screen.getByRole('button', { name: 'Block 20260918-1832-k3f' }));
    fireEvent.change(screen.getByLabelText('Priority for 20260918-1832-k3f'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move 20260918-1832-k3f to night' }));
    fireEvent.click(screen.getByRole('button', { name: 'Release 20260919-0900-q1q' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(4));
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts[0].pathname).toBe('/api/v1/shift/todos/jeryu/20260918-1832-k3f/action');
    expect(posts.map((p) => p.body)).toEqual([
      { action: 'block', note: 'waiting on design' },
      { action: 'priority', value: 1 },
      { action: 'mode', value: 'night' },
      { action: 'release' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Open review PR for nightshift/2026-09-18' }));
    expect(await screen.findByRole('link', { name: 'jeryu-deploy#7' })).toBeInTheDocument();
    const pr = calls.find((c) => c.pathname === '/api/v1/shift/shifts/jeryu/pr');
    expect(pr?.body).toEqual({ branch: 'nightshift/2026-09-18' });
    // A shift whose repos all have PRs offers no button.
    expect(screen.queryByRole('button', { name: 'Open review PR for bulletshift/2026-09-17' })).toBeNull();
  });

  it('hides admin actions from non-admins', async () => {
    role = 'user';
    mockShiftApi();
    renderQueue();
    await screen.findByTestId('shift-todo-20260918-1832-k3f');
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Open review PR/ })).toBeNull();
  });

  it('renders empty, error and permission states', async () => {
    mockShiftApi((req) =>
      req.pathname === '/api/v1/shift/todos' ? json({ generated_at: 'x', todos: [] }) : undefined
    );
    renderQueue();
    expect(await screen.findByText('The queue is empty.')).toBeInTheDocument();
    vi.restoreAllMocks();

    mockShiftApi((req) => (req.pathname === '/api/v1/shift/families' ? json({ families: [] }) : undefined));
    renderQueue();
    expect(await screen.findByText('No shift queues yet.')).toBeInTheDocument();
    vi.restoreAllMocks();

    mockShiftApi((req) =>
      req.pathname === '/api/v1/shift/families' ? errorResponse(500, 'boom') : undefined
    );
    renderQueue();
    expect(await screen.findByText('Could not load shift families.')).toBeInTheDocument();
    vi.restoreAllMocks();

    mockShiftApi((req) =>
      req.pathname === '/api/v1/shift/families' ? errorResponse(403, 'nope') : undefined
    );
    renderQueue();
    expect(await screen.findByText("You don't have access to the shift queue.")).toBeInTheDocument();
  });
});
