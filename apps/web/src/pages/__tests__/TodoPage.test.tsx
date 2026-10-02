// TodoPage.test.tsx — one todo's own page (`/work/<id>`): the opened-up queue
// row, why it is stuck, links to its blockers, admin actions, and the states
// for an unknown id and an id two families share.

import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TodoPage } from '../shift/TodoPage';
import { json, mockShiftApi, renderAt } from './shiftPageHelpers';
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
