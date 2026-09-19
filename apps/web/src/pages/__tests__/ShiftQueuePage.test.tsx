// ShiftQueuePage.test.tsx — Work → Queue: shifts panel, filters, row expansion,
// admin-only row actions and "Open review PR", and the UX states.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShiftQueuePage } from '../shift/ShiftQueuePage';
import { errorResponse, json, mockShiftApi, renderAt } from './shiftPageHelpers';
import { TODOS, attempt, todo } from './shiftTestData';

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
    // One table for what is live, one folded away for what is finished.
    expect(screen.getAllByRole('columnheader', { name: 'Cost' })).toHaveLength(2);
    expect(screen.getByTestId('shift-finished-todos')).toContainElement(done);
    expect(screen.queryByRole('columnheader', { name: 'Requested by' })).toBeNull();
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
    const prompt = vi.spyOn(window, 'prompt');
    const calls = mockShiftApi((req) => {
      if (req.method !== 'POST') return undefined;
      if (req.pathname.endsWith('/pr')) {
        return json({ prs: [{ repo: 'jeryu-deploy', number: 7, url: 'https://git.example/pr/7', created: true }] });
      }
      return json(TODOS[0]);
    });
    renderQueue();
    await screen.findByTestId('shift-todo-20260918-1832-k3f');
    // Block asks for its reason inline, never through a browser prompt.
    fireEvent.click(screen.getByRole('button', { name: 'Block 20260918-1832-k3f' }));
    fireEvent.change(screen.getByLabelText('Reason for blocking 20260918-1832-k3f'), {
      target: { value: ' waiting on design ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm block' }));
    expect(prompt).not.toHaveBeenCalled();
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1));
    // Priority and now/night are adjustments: they live in the opened row.
    expect(screen.queryByLabelText('Priority for 20260918-1832-k3f')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fix the cache key' }));
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
    expect(screen.queryByRole('columnheader', { name: 'Action' })).toBeNull();
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
  it('shows the needs-a-human count, the lifecycle trace, the PR link and failed attempts on the row', async () => {
    const pr = { repo: 'jeryu-deploy', number: 48, state: 'merged', url: '/repos/jeryu/jeryu/jeryu-deploy/pulls/48' };
    mockShiftApi((req) =>
      req.pathname === '/api/v1/shift/todos'
        ? json({
            generated_at: '2026-09-19T09:00:00Z',
            todos: [
              { ...TODOS[1], pr, merged: true, released: false, cost_usd: 2.5 },
              todo({
                id: 'blk-1',
                title: 'Cut the core tag',
                status: 'blocked',
                attempts: 2,
                note: 'tag split.7 does not exist',
                worked_by: [attempt({ outcome: 'retry' }), attempt({ outcome: 'blocked' })],
              }),
              TODOS[2],
            ],
          })
        : undefined
    );
    renderQueue();
    const blocked = await screen.findByTestId('shift-todo-blk-1');
    // Blocked sorts above live work.
    const ids = screen.getAllByTestId(/^shift-todo-(?!detail)/).map((el) => el.getAttribute('data-testid'));
    expect(ids[0]).toBe('shift-todo-blk-1');
    expect(within(blocked).getByText('2 attempts · last: blocked')).toHaveClass('is-failing');
    // Why it is stuck is on the row, and the row offers the one thing to do.
    expect(within(blocked).getByTestId('shift-why-blk-1')).toHaveTextContent('tag split.7 does not exist');
    // Outlined: the page's one filled action stays "Open review PR".
    const release = within(blocked).getByRole('button', { name: 'Release blk-1' });
    expect(release.className).not.toContain('action-button--primary');
    // A short note needs no disclosure.
    expect(within(blocked).queryByRole('button', { name: 'Show full note' })).toBeNull();
    expect(within(blocked).queryByRole('button', { name: 'Block blk-1' })).toBeNull();
    expect(within(blocked).getByRole('list', { name: /blocked — needs a human/ })).toBeInTheDocument();

    const done = screen.getByTestId('shift-todo-20260918-2201-a9z');
    expect(within(done).getByRole('link', { name: 'PR #48' })).toHaveAttribute('href', pr.url);
    expect(within(done).getByRole('link', { name: 'jeryu-deploy@abcdef12' })).toHaveAttribute('href', pr.url);
    expect(within(done).getByRole('list', { name: /PR #48, Merged, Released not yet/ })).toBeInTheDocument();
    expect(within(done).getByText('$2.50')).toBeInTheDocument();

    const toggle = screen.getByTestId('shift-needs-human');
    expect(toggle).toHaveTextContent('1 needs a human');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('shift-todo-20260918-2201-a9z')).toBeNull();
    expect(screen.getByTestId('shift-todo-blk-1')).toBeInTheDocument();
  });

  it('shows shifts still in review, folds finished ones, and links repos under their hosting owner', async () => {
    const families = {
      families: [
        {
          name: 'jain',
          queue_repo: 'jain-split/jain-todo',
          repos: [
            { name: 'jain-deploy', order: 1, owner: 'veox' },
            { name: 'jain-gone', order: 2, owner: null },
          ],
          shift_tz: 'America/Los_Angeles',
          landing: 'shifts',
        },
      ],
    };
    const shifts = {
      shifts: [
        {
          branch: 'nightshift/2026-09-18',
          kind: 'nightshift',
          date: '2026-09-18',
          todo_ids: ['t1'],
          repos: [{ repo: 'jain-deploy', head: 'e661f55', ahead: 1, behind: 3, unmerged_todos: ['t1'], pr: { number: 70, state: 'merged', url: '/repos/jeryu/veox/jain-deploy/pulls/70' } }],
        },
        {
          branch: 'bulletshift/2026-09-19.3',
          kind: 'bulletshift',
          date: '2026-09-19.3',
          todo_ids: [],
          repos: [{ repo: 'jain-gone', head: 'abc1234', ahead: 0, behind: 7, unmerged_todos: [] }],
        },
      ],
    };
    mockShiftApi((req) =>
      req.pathname === '/api/v1/shift/families'
        ? json(families)
        : req.pathname === '/api/v1/shift/shifts'
          ? json(shifts)
          : req.pathname === '/api/v1/shift/todos'
            ? json({ generated_at: '2026-09-19T09:00:00Z', todos: [] })
            : undefined
    );
    renderQueue('/work/shift?family=jain');
    const live = await screen.findByTestId('shift-branch-nightshift/2026-09-18');
    // Work landed after the PR merged: a review PR would carry it.
    expect(within(live).getByText(/1 todo not on the base branch/)).toBeInTheDocument();
    expect(within(live).getByRole('button', { name: 'Open review PR for nightshift/2026-09-18' })).toBeInTheDocument();
    expect(within(live).getByRole('link', { name: 'jain-deploy' })).toHaveAttribute(
      'href',
      '/repos/jeryu/veox/jain-deploy/code'
    );
    expect(within(live).getByRole('link', { name: 'PR #70 (merged)' })).toHaveAttribute(
      'href',
      '/repos/jeryu/veox/jain-deploy/pulls/70'
    );
    // Level with its base and nothing to review: folded, no button, and a repo
    // this forge does not host is a name, not a dead link.
    const folded = screen.getByTestId('shift-finished-shifts');
    expect(folded).toHaveTextContent('1 finished shift');
    const done = within(folded).getByTestId('shift-branch-bulletshift/2026-09-19.3');
    expect(within(done).queryByRole('button', { name: /Open review PR/ })).toBeNull();
    expect(within(done).queryByRole('link', { name: 'jain-gone' })).toBeNull();
    expect(within(done).getByText('jain-gone')).toBeInTheDocument();
  });
});
