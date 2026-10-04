// TodoPage.test.tsx — one todo's own page (`/work/<id>`): the opened-up queue
// row, why it is stuck, links to its blockers, admin actions, and the states
// for an unknown id and an id two families share.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TodoPage } from '../shift/TodoPage';
import { errorResponse, json, mockShiftApi, renderAt } from './shiftPageHelpers';
import { TODOS, todo } from './shiftTestData';

let role: 'admin' | 'user' = 'user';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role } }),
}));

function renderTodo(path: string): void {
  renderAt(path, '/work/:key', <TodoPage />);
}

function serveTodos(todos: typeof TODOS): void {
  mockShiftApi((req) =>
    req.pathname === '/api/v1/shift/todos'
      ? json({ generated_at: '2026-09-19T09:00:00Z', todos })
      : undefined
  );
}

describe('TodoPage', () => {
  beforeEach(() => {
    role = 'user';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-19T16:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the todo opened up: status, trace, body, note, attempts and commits', async () => {
    mockShiftApi();
    renderTodo('/work/20260918-2201-a9z');
    expect(await screen.findByRole('heading', { name: 'Add shift heartbeat' })).toBeInTheDocument();
    expect(screen.getByTestId('todo-page-status')).toHaveTextContent('done');
    expect(screen.getByText('POST heartbeats every 30 s.')).toBeInTheDocument();
    expect(screen.getByText('green on first try')).toBeInTheDocument();
    expect(screen.getByText('alton@xbabe0/w1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'jeryu-deploy@abcdef12' })).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-deploy'
    );
    expect(screen.getByRole('list', { name: /^Lifecycle of 20260918-2201-a9z/ })).toBeInTheDocument();
    // The trail leads back to Work and to this family's queue.
    expect(screen.getByRole('link', { name: 'Work' })).toHaveAttribute('href', '/work');
    expect(screen.getByRole('link', { name: 'jeryu' })).toHaveAttribute('href', '/work?family=jeryu');
    // Non-admins get no row actions.
    expect(screen.queryByRole('button', { name: /Block|Release/ })).toBeNull();
  });

  it('says why a blocked todo is stuck once, and links its blockers to their pages', async () => {
    serveTodos([
      todo({
        id: '20260919-1000-blk',
        title: 'Wait on the cache fix',
        status: 'blocked',
        note: 'needs the cache key fix first',
        blocked_by: ['20260918-1832-k3f'],
      }),
    ]);
    renderTodo('/work/20260919-1000-blk');
    expect(await screen.findByTestId('shift-why-20260919-1000-blk')).toHaveTextContent(
      'needs the cache key fix first'
    );
    expect(screen.getAllByText(/needs the cache key fix first/)).toHaveLength(1);
    expect(screen.getByRole('link', { name: '20260918-1832-k3f' })).toHaveAttribute(
      'href',
      '/work/20260918-1832-k3f'
    );
  });

  it('gives admins the row actions', async () => {
    role = 'admin';
    mockShiftApi();
    renderTodo('/work/20260919-0900-q1q');
    expect(await screen.findByRole('button', { name: 'Release 20260919-0900-q1q' })).toBeInTheDocument();
    expect(screen.getByLabelText('Priority for 20260919-0900-q1q')).toBeInTheDocument();
  });

  it("leads an owner's own task with Mark done, and never offers to release it", async () => {
    role = 'admin';
    serveTodos([
      todo({ id: '20260919-1200-own', title: 'Decide the tag', block_kind: 'owner_task' }),
    ]);
    renderTodo('/work/20260919-1200-own');
    const done = await screen.findByRole('button', { name: 'Mark done 20260919-1200-own' });
    expect(done.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: /^Release/ })).toBeNull();
    // Marking done says what it will do before it does it.
    fireEvent.click(done);
    expect(screen.getByText('Mark 20260919-1200-own done?')).toBeInTheDocument();
  });

  it('parks a todo until an instant it sends as RFC 3339', async () => {
    role = 'admin';
    const calls = mockShiftApi((req) =>
      req.method === 'POST' ? json(TODOS[0]) : undefined
    );
    renderTodo('/work/20260919-0900-q1q');
    fireEvent.click(await screen.findByRole('button', { name: 'Park until… 20260919-0900-q1q' }));
    fireEvent.change(screen.getByLabelText('Park 20260919-0900-q1q until'), {
      target: { value: '2026-10-05T09:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm park' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1));
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.pathname).toBe('/api/v1/shift/todos/jeryu/20260919-0900-q1q/action');
    expect(post?.body).toEqual({
      action: 'park',
      until: `${new Date('2026-10-05T09:30').toISOString().slice(0, 19)}Z`,
    });
  });

  it('shows the server\'s refusal of an edit beside the form, and keeps the text', async () => {
    role = 'admin';
    mockShiftApi((req) =>
      req.method === 'POST' ? errorResponse(422, 'title is already used by 20260918-1832-k3f') : undefined
    );
    renderTodo('/work/20260919-0900-q1q');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit 20260919-0900-q1q' }));
    const title = screen.getByLabelText('Title of 20260919-0900-q1q');
    expect(title).toHaveValue('Claimed thing');
    fireEvent.change(title, { target: { value: 'Fix the cache key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'title is already used by 20260918-1832-k3f'
    );
    // The form stays open with what was typed: the edit is still there to fix.
    expect(screen.getByLabelText('Title of 20260919-0900-q1q')).toHaveValue('Fix the cache key');
  });

  it('says so when no todo has the id', async () => {
    mockShiftApi();
    renderTodo('/work/20200101-0000-nope');
    expect(await screen.findByText('No todo 20200101-0000-nope.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Work' })).toHaveAttribute('href', '/work');
  });

  it('asks which family when two share an id, and ?family= settles it', async () => {
    const shared = [
      todo({ id: '20260919-1100-dup', family: 'jeryu', title: 'Jeryu side' }),
      todo({ id: '20260919-1100-dup', family: 'jain', title: 'Jain side' }),
    ];
    serveTodos(shared);
    renderTodo('/work/20260919-1100-dup');
    const pick = await screen.findByTestId('todo-page-ambiguous');
    expect(within(pick).getByRole('link', { name: 'jain: Jain side' })).toHaveAttribute(
      'href',
      '/work/20260919-1100-dup?family=jain'
    );
  });

  it('opens the one family a ?family= names', async () => {
    serveTodos([
      todo({ id: '20260919-1100-dup', family: 'jeryu', title: 'Jeryu side' }),
      todo({ id: '20260919-1100-dup', family: 'jain', title: 'Jain side' }),
    ]);
    renderTodo('/work/20260919-1100-dup?family=jain');
    expect(await screen.findByRole('heading', { name: 'Jain side' })).toBeInTheDocument();
  });
});
