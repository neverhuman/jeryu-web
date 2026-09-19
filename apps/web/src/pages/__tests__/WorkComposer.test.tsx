// WorkComposer.test.tsx — adding work from the top of the Work page: the one-row
// composer (Night by default), the full form it opens to, single and paste-many
// filing, the highlight of what was filed, and the non-admin explanation.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShiftQueuePage } from '../shift/ShiftQueuePage';
import { errorResponse, json, mockShiftApi, renderAt } from './shiftPageHelpers';
import { todo } from './shiftTestData';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role } }),
}));

function renderWork(path = '/work'): void {
  renderAt(path, '/work', <ShiftQueuePage />);
}

describe('WorkComposer', () => {
  beforeEach(() => {
    role = 'admin';
  });
  afterEach(() => vi.restoreAllMocks());

  it('is one row that files for the night by default, and opens to the full form', async () => {
    const calls = mockShiftApi((req) =>
      req.method === 'POST' ? json(todo({ id: 'new-1' })) : undefined
    );
    renderWork();
    const composer = await screen.findByRole('region', { name: 'Add work' });
    expect(within(composer).getByLabelText('Night')).toBeChecked();
    expect(within(composer).getByLabelText('Family')).toHaveValue('jeryu');
    const file = within(composer).getByRole('button', { name: 'File todo' });
    expect(file).toBeDisabled();
    // Collapsed: no textarea, no optional fields.
    expect(within(composer).queryByLabelText('Todo')).toBeNull();
    expect(within(composer).getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false');

    // Focusing the line opens the full form in place and keeps what was typed.
    const line = within(composer).getByLabelText('What should be done?');
    fireEvent.change(line, { target: { value: 'Fix the flaky test' } });
    fireEvent.focus(line);
    const text = await within(composer).findByLabelText('Todo');
    expect(text).toHaveValue('Fix the flaky test');
    fireEvent.change(text, { target: { value: 'Fix the flaky test\n\nIt fails on CI.' } });
    expect(within(composer).getByTestId('shift-add-count')).toHaveTextContent(
      '1 todo will be filed as night for jeryu.'
    );
    fireEvent.click(within(composer).getByLabelText('jeryu-web'));
    fireEvent.change(within(composer).getByLabelText('Priority'), { target: { value: '2' } });
    fireEvent.change(within(composer).getByLabelText('Blocked by (todo ids)'), {
      target: { value: 'a, b' },
    });
    fireEvent.click(within(composer).getByRole('button', { name: 'File todo' }));

    // The queue below is pointed at what was filed; the composer clears and closes.
    expect(await screen.findByText(/Showing 1 filed todo/)).toBeInTheDocument();
    await waitFor(() => expect(within(composer).queryByLabelText('Todo')).toBeNull());
    expect(within(composer).getByLabelText('What should be done?')).toHaveValue('');
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

  it('files many todos, one per paragraph, for now when asked', async () => {
    const calls = mockShiftApi((req) =>
      req.method === 'POST' ? json({ todos: [todo({ id: 'n1' }), todo({ id: 'n2' })] }) : undefined
    );
    renderWork();
    const composer = await screen.findByRole('region', { name: 'Add work' });
    fireEvent.click(within(composer).getByRole('button', { name: 'More' }));
    fireEvent.click(within(composer).getByLabelText('Now'));
    fireEvent.click(within(composer).getByLabelText(/Paste many/));
    fireEvent.change(within(composer).getByLabelText('Todos'), { target: { value: 'one\n\ntwo\n\n' } });
    expect(within(composer).getByTestId('shift-add-count')).toHaveTextContent(
      '2 todos will be filed as now for jeryu.'
    );
    fireEvent.click(within(composer).getByRole('button', { name: 'File 2 todos' }));
    expect(await screen.findByText(/Showing 2 filed todos/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      family: 'jeryu',
      texts: ['one', 'two'],
      mode: 'now',
    });
  });

  it('shows the server error and keeps the text', async () => {
    mockShiftApi((req) => (req.method === 'POST' ? errorResponse(409, 'queue moved') : undefined));
    renderWork();
    const composer = await screen.findByRole('region', { name: 'Add work' });
    fireEvent.change(within(composer).getByLabelText('What should be done?'), {
      target: { value: 'x' },
    });
    fireEvent.click(within(composer).getByRole('button', { name: 'File todo' }));
    await waitFor(() => expect(within(composer).getByRole('alert')).toHaveTextContent('queue moved'));
    expect(within(composer).getByLabelText('What should be done?')).toHaveValue('x');
  });

  it('explains to non-admins instead of showing the form', async () => {
    role = 'user';
    const calls = mockShiftApi();
    renderWork();
    expect(await screen.findByTestId('work-composer-readonly')).toHaveTextContent(
      'Only admins can file todos'
    );
    expect(screen.queryByRole('form', { name: 'File shift todos' })).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });
});
