// WorkComposer.test.tsx — adding work from the top of the Work page: the one-row
// composer (Night by default), the full form it opens to, single and paste-many
// filing, the highlight of what was filed, and the non-admin explanation.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShiftQueuePage } from '../shift/ShiftQueuePage';
import { errorResponse, json, mockShiftApi, renderAt } from './shiftPageHelpers';
import { FAMILIES, todo } from './shiftTestData';

/** Two families, the page's filter second, so first-in-the-list is not the answer. */
const TWO_FAMILIES = {
  families: [
    { ...FAMILIES.families[0], name: 'jain', queue_repo: 'jeryu/jain-todo' },
    ...FAMILIES.families,
  ],
};

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
    expect(within(composer).getByRole('button', { name: 'More options' })).toHaveAttribute('aria-expanded', 'false');

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
    fireEvent.click(within(composer).getByRole('button', { name: 'More options' }));
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

  it('files into the family the page is filtered to, and keeps a pick under it', async () => {
    mockShiftApi((req) =>
      req.pathname === '/api/v1/shift/families' ? json(TWO_FAMILIES) : undefined
    );
    renderWork('/work?family=jeryu');
    const composer = await screen.findByRole('region', { name: 'Add work' });
    // The filtered family from the first paint, not the first of the list.
    expect(within(composer).getByLabelText('Family')).toHaveValue('jeryu');

    // The select still overrides the filter, and that pick stands.
    fireEvent.change(within(composer).getByLabelText('Family'), { target: { value: 'jain' } });
    expect(within(composer).getByLabelText('Family')).toHaveValue('jain');
    fireEvent.click(within(composer).getByRole('button', { name: 'More options' }));
    fireEvent.change(within(composer).getByLabelText('Todo'), { target: { value: 'x' } });
    expect(within(composer).getByTestId('shift-add-count')).toHaveTextContent('for jain.');

    // Dropping the filter drops the pick with it; filtering again follows.
    const strip = screen.getByRole('group', { name: 'Filter by family' });
    fireEvent.click(within(strip).getByRole('button', { name: /^jeryu/ }));
    await waitFor(() =>
      expect(within(strip).getByRole('button', { name: /^All/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    );
    expect(within(composer).getByLabelText('Family')).toHaveValue('jain');
    fireEvent.click(within(strip).getByRole('button', { name: /^jeryu/ }));
    await waitFor(() => expect(within(composer).getByLabelText('Family')).toHaveValue('jeryu'));
  });

  it('retries a failed filing under the same key, and a changed one under a new key', async () => {
    let fail = true;
    const calls = mockShiftApi((req) => {
      if (req.method !== 'POST') return undefined;
      if (fail) return errorResponse(503, 'queue is busy');
      return json(todo({ id: 'new-1' }));
    });
    renderWork();
    const composer = await screen.findByRole('region', { name: 'Add work' });
    const line = within(composer).getByLabelText('What should be done?');
    fireEvent.change(line, { target: { value: 'Fix the flaky test' } });
    fireEvent.click(within(composer).getByRole('button', { name: 'File todo' }));
    await waitFor(() => expect(within(composer).getByRole('alert')).toBeInTheDocument());

    // The same filing again: the same key, so the server collapses the two
    // into the one todo whichever attempt actually reached the queue.
    fail = false;
    fireEvent.click(within(composer).getByRole('button', { name: 'File todo' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2));
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts[0].headers['idempotency-key']).toBeTruthy();
    expect(posts[1].headers['idempotency-key']).toBe(posts[0].headers['idempotency-key']);

    // Different work is a different filing, so it earns its own key.
    fireEvent.change(within(composer).getByLabelText('What should be done?'), {
      target: { value: 'Cut the tag' },
    });
    fireEvent.click(within(composer).getByRole('button', { name: 'File todo' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(3));
    const third = calls.filter((c) => c.method === 'POST')[2];
    expect(third.headers['idempotency-key']).not.toBe(posts[0].headers['idempotency-key']);
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
