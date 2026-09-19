// ShiftAddPage.test.tsx — Work → Add: single and paste-many filing, optional
// fields, filed-id links, and the non-admin explanation.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShiftAddPage } from '../shift/ShiftAddPage';
import { errorResponse, json, mockShiftApi, renderAt } from './shiftPageHelpers';
import { todo } from './shiftTestData';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role } }),
}));

function renderAdd(): void {
  renderAt('/work/shift/new', '/work/shift/new', <ShiftAddPage />);
}

describe('ShiftAddPage', () => {
  beforeEach(() => {
    role = 'admin';
  });
  afterEach(() => vi.restoreAllMocks());

  it('files one todo and links it into the queue', async () => {
    const calls = mockShiftApi((req) =>
      req.method === 'POST' ? json(todo({ id: 'new-1' })) : undefined
    );
    renderAdd();
    const text = await screen.findByLabelText('Todo');
    fireEvent.change(text, { target: { value: 'Fix the flaky test\n\nIt fails on CI.' } });
    expect(screen.getByTestId('shift-add-count')).toHaveTextContent('1 todo will be filed as now.');
    fireEvent.click(screen.getByLabelText('Night'));
    fireEvent.click(screen.getByLabelText('jeryu-web'));
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Blocked by (todo ids)'), { target: { value: 'a, b' } });
    fireEvent.click(screen.getByRole('button', { name: 'File todo' }));
    const link = await screen.findByRole('link', { name: 'new-1' });
    expect(link).toHaveAttribute('href', '/work/shift?family=jeryu&todo=new-1');
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.pathname).toBe('/api/v1/shift/todos');
    expect(post?.body).toEqual({
      family: 'jeryu',
      text: 'Fix the flaky test\n\nIt fails on CI.',
      mode: 'night',
      repos: ['jeryu-web'],
      priority: 2,
      blocked_by: ['a', 'b'],
    });
  });

  it('files many todos, one per paragraph', async () => {
    const calls = mockShiftApi((req) =>
      req.method === 'POST' ? json({ todos: [todo({ id: 'n1' }), todo({ id: 'n2' })] }) : undefined
    );
    renderAdd();
    fireEvent.click(await screen.findByLabelText(/Paste many/));
    fireEvent.change(screen.getByLabelText('Todos'), { target: { value: 'one\n\ntwo\n\n' } });
    expect(screen.getByTestId('shift-add-count')).toHaveTextContent('2 todos will be filed as now.');
    fireEvent.click(screen.getByRole('button', { name: 'File 2 todos' }));
    expect(await screen.findByRole('link', { name: 'View in Queue' })).toHaveAttribute(
      'href',
      '/work/shift?family=jeryu&todo=n1%2Cn2'
    );
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      family: 'jeryu',
      texts: ['one', 'two'],
      mode: 'now',
    });
  });

  it('shows the server error', async () => {
    mockShiftApi((req) => (req.method === 'POST' ? errorResponse(409, 'queue moved') : undefined));
    renderAdd();
    fireEvent.change(await screen.findByLabelText('Todo'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'File todo' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('queue moved'));
  });

  it('explains to non-admins instead of showing the form', () => {
    role = 'user';
    const calls = mockShiftApi();
    renderAdd();
    expect(screen.getByText('Only admins can file shift todos.')).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });
});
