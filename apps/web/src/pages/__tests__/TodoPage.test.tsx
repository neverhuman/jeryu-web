// TodoPage.test.tsx — one todo's own page (`/work/<id>`): the opened-up queue
// row, why it is stuck, links to its blockers, admin actions, and the states
// for an unknown id and an id two families share.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TodoPage } from '../shift/TodoPage';
import {
  errorResponse,
  json,
  mockShiftApi,
  renderAt,
  type Override,
  type Recorded,
} from './shiftPageHelpers';
import { FAMILIES, TODOS, attempt, todo } from './shiftTestData';

let role: 'admin' | 'user' = 'user';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'operator', role } }),
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
    expect(screen.getByText('operator@node-0/w1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'jeryu-deploy@abcdef12' })).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-deploy/commit/abcdef1234567890'
    );
    // The work trace is a rail of twelve stages with exactly one of them current.
    const rail = screen.getByRole('list', { name: /^Work trace of 20260918-2201-a9z/ });
    expect(rail).toHaveAccessibleName(/stage 6 of 12: Committed/);
    expect(within(rail).getAllByRole('listitem')).toHaveLength(12);
    expect(
      within(rail)
        .getAllByRole('listitem')
        .filter((item) => item.getAttribute('data-state') === 'current')
    ).toHaveLength(1);
    // The trail names Work and this family's queue, but Work is admin-only:
    // a non-admin is not linked into a page that would refuse them.
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(trail).toHaveTextContent('Work');
    expect(trail).toHaveTextContent('jeryu');
    expect(within(trail).queryByRole('link', { name: 'Work' })).toBeNull();
    expect(within(trail).queryByRole('link', { name: 'jeryu' })).toBeNull();
    // Non-admins get no row actions.
    expect(screen.queryByRole('button', { name: /Block|Release/ })).toBeNull();
  });

  it('ends the attempts table with the attempt a worker is running now', async () => {
    serveTodos([
      todo({
        id: '20260919-0900-q1q',
        title: 'Claimed thing',
        status: 'claimed',
        claim_by: 'operator@node-0/w1',
        lease_until: '2026-09-19T10:00:00Z',
        lease_live: true,
        claimed_at: '2026-09-19T08:40:00Z',
        claim_model: 'claude-opus-5[1m]',
        worked_by: [attempt({ outcome: 'retry', note: 'gate failed in api' })],
      }),
    ]);
    renderTodo('/work/20260919-0900-q1q');
    const live = await screen.findByTestId('shift-attempt-live-20260919-0900-q1q');
    const rows = within(screen.getByRole('table', { name: /^Attempts for / })).getAllByRole('row');
    expect(rows[rows.length - 1]).toBe(live);
    expect(live).toHaveTextContent('operator@node-0/w1');
    expect(live).toHaveTextContent('claude-opus-5[1m]');
    expect(live).toHaveTextContent('2026-09-19T08:40:00Z');
    // The stage is the slot's own heartbeat (WORKERS: node-0/w1 is in `agent`).
    expect(await within(live).findByText('working · agent')).toBeInTheDocument();
    expect(live).toHaveTextContent('lease until 2026-09-19T10:00:00Z');
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

  it('lets any signed-in person claim a blocked todo, and hand it to a person', async () => {
    const blocked = todo({
      id: '20260919-1300-own',
      title: 'Restart the display manager',
      status: 'blocked',
      block_kind: 'owner_task',
      note: 'needs root on the forge host',
    });
    const calls = mockShiftApi((req) => {
      if (req.pathname === '/api/v1/shift/todos') {
        return json({ generated_at: '2026-09-19T09:00:00Z', todos: [blocked] });
      }
      if (req.pathname === '/api/v1/shift/todos/jeryu/20260919-1300-own/people') {
        return json([
          { login: 'operator', display_name: 'operator' },
          { login: 'bea', display_name: 'Bea' },
        ]);
      }
      if (req.pathname.endsWith('/action')) return json({ ...blocked, assignee: 'operator' });
      return undefined;
    });
    renderTodo('/work/20260919-1300-own');
    expect(await screen.findByTestId('todo-assignee-line')).toHaveTextContent('Nobody has this yet');
    // A non-admin still gets no admin actions, only the ones to take it on.
    expect(screen.queryByRole('button', { name: /^Release/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Claim 20260919-1300-own' }));
    await waitFor(() =>
      expect(calls.find((call) => call.pathname.endsWith('/action'))?.body).toEqual({
        action: 'claim',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Assign 20260919-1300-own to someone' }));
    const picker = await screen.findByLabelText('Person to assign 20260919-1300-own to');
    // The picker lists the people this todo's own route returns, never the viewer
    // themself on a free todo ("I'll take it" is that act).
    expect(within(picker).queryByRole('option', { name: 'operator' })).toBeNull();
    expect(within(picker).getByRole('option', { name: 'Bea (bea)' })).toBeInTheDocument();
    fireEvent.change(picker, { target: { value: 'bea' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() =>
      expect(
        calls.filter((call) => call.pathname.endsWith('/action')).map((call) => call.body)
      ).toContainEqual({ action: 'assign', value: 'bea' })
    );
  });

  it('shows who has a todo and lets only them finish or give it back', async () => {
    serveTodos([
      todo({ id: '20260919-1400-mine', status: 'blocked', assignee: 'operator' }),
      todo({ id: '20260919-1401-hers', status: 'blocked', assignee: 'bea' }),
    ]);
    renderTodo('/work/20260919-1400-mine');
    expect(await screen.findByTestId('todo-assignee-line')).toHaveTextContent('You have this');
    // Finishing asks first: done cannot be undone.
    fireEvent.click(screen.getByRole('button', { name: 'Mark 20260919-1400-mine done' }));
    expect(screen.getByText('Mark 20260919-1400-mine done? This cannot be undone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unassign 20260919-1400-mine' })).toHaveTextContent(
      'Give it back'
    );
  });

  it('offers nothing to take on when the server predates assignees', async () => {
    const old = todo({ id: '20260919-1500-old', status: 'blocked' });
    delete (old as { assignee?: string | null }).assignee;
    serveTodos([old]);
    renderTodo('/work/20260919-1500-old');
    expect(await screen.findByRole('heading', { name: old.title })).toBeInTheDocument();
    expect(screen.queryByTestId('todo-assignee')).toBeNull();
  });

  it("offers another user's todo to nobody but its holder", async () => {
    serveTodos([todo({ id: '20260919-1401-hers', status: 'blocked', assignee: 'bea' })]);
    renderTodo('/work/20260919-1401-hers');
    expect(await screen.findByTestId('todo-assignee-line')).toHaveTextContent('bea has this');
    expect(screen.queryByRole('button', { name: /Claim|Assign|Unassign|Mark .* done/ })).toBeNull();
  });

  it('shows landing results for every row kind and keeps the full note collapsed', async () => {
    serveTodos([todo({ id: '20261013-123954-a9904a', status: 'blocked', note: 'full gate explanation', landing: [
      { repo: 'acme-api', status: 'landed', sha: '1234567890abcdef', pr: 14 },
      { repo: 'acme-web', status: 'gate_failed', target: 'main', rescue_branch: 'rescue/work', rescue_sha: 'abcdef123456', commits_not_on_main: 2, tests: ['test one', 'test two', 'test three', 'test four'], check: 'required' },
      { repo: 'globex/acme-api', status: 'conflict' },
      { repo: 'acme-web', status: 'push_race' },
      { repo: 'acme-web', status: 'kept' },
      { repo: 'acme-api', status: 'pending' },
    ] })]);
    renderTodo('/work/20261013-123954-a9904a');
    const landing = await screen.findByRole('region', { name: 'Landing' });
    expect(within(landing).getByRole('link', { name: '12345678' })).toHaveAttribute('href', '/repos/jeryu/jeryu/acme-api/commit/1234567890abcdef');
    expect(within(landing).getByRole('link', { name: 'PR #14' })).toBeInTheDocument();
    expect(landing).toHaveTextContent('gate failed after rebasing onto main');
    expect(within(landing).getByRole('link', { name: '2 commits not on main' })).toHaveAttribute('href', '/repos/jeryu/jeryu/acme-web/commits/rescue%2Fwork');
    expect(landing).toHaveTextContent('test one, test two, test three +1 more');
    expect(landing).toHaveTextContent('could not land because of a conflict');
    expect(landing).toHaveTextContent('push raced with another update');
    expect(landing).toHaveTextContent('work was kept for later');
    expect(landing).toHaveTextContent('not landed yet');
    expect(screen.getByText('Why this todo is stuck')).toBeInTheDocument();
    expect(screen.getByText('full gate explanation').closest('details')).not.toHaveAttribute('open');
  });

  it('treats an empty landing list as no landing and keeps the stuck note in place', async () => {
    serveTodos([todo({ id: '20261013-empty-land', status: 'blocked', note: 'still stuck', landing: [] })]);
    renderTodo('/work/20261013-empty-land');
    expect(await screen.findByText('still stuck')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Landing' })).toBeNull();
    expect(screen.queryByText('Why this todo is stuck')).toBeNull();
    expect(screen.getByText('still stuck').closest('details')).toBeNull();
  });

  it('does not label an unhosted landing pull with a number that opens a different pull', async () => {
    mockShiftApi((req) => {
      if (req.pathname === '/api/v1/shift/families') {
        return json({
          families: [{ ...FAMILIES.families[0], queue_repo: '', repos: [{ name: 'orphan', order: 1, owner: null }] }],
        });
      }
      if (req.pathname === '/api/v1/shift/todos') {
        return json({
          generated_at: '2026-09-19T09:00:00Z',
          todos: [todo({
            id: '20261013-unhosted-pr',
            status: 'open',
            pr: { repo: 'orphan', number: 12, state: 'open', url: '/repos/jeryu/jeryu/jeryu-web/pulls/12' },
            landing: [{ repo: 'orphan', status: 'landed', sha: 'abcdef1234567890', pr: 99 }],
          })],
        });
      }
      return undefined;
    });
    renderTodo('/work/20261013-unhosted-pr');
    expect(await screen.findByRole('region', { name: 'Landing' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'PR #99' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'PR #12' })).toBeNull();
  });

  it('gives admins the row actions', async () => {
    role = 'admin';
    mockShiftApi();
    renderTodo('/work/20260919-0900-q1q');
    expect(await screen.findByRole('button', { name: 'Release 20260919-0900-q1q' })).toBeInTheDocument();
    expect(screen.getByLabelText('Priority for 20260919-0900-q1q')).toBeInTheDocument();
    // An admin's trail leads back to Work and to the family's queue.
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByRole('link', { name: 'Work' })).toHaveAttribute('href', '/work');
    expect(within(trail).getAllByRole('link')).toHaveLength(2);
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

  it('walks the pages of the queue list: a claimed todo past the first page opens', async () => {
    // The server pages the list (100 rows unless asked). The todo an Activity
    // row links to is wherever priority and id put it, not on page one.
    const claimed = todo({
      id: '20261006-201244-b2487c',
      title: 'Being worked right now',
      status: 'claimed',
      claim_by: 'operator@node-0/w2',
    });
    mockShiftApi((req) => {
      if (req.pathname !== '/api/v1/shift/todos') return undefined;
      const page = new URLSearchParams(req.search).get('page');
      return json(
        page === '1'
          ? {
              generated_at: '2026-10-06T20:00:00Z',
              todos: TODOS,
              page: { limit: TODOS.length, page: 1, total: TODOS.length + 1, has_more: true },
            }
          : {
              generated_at: '2026-10-06T20:00:00Z',
              todos: [claimed],
              page: { limit: TODOS.length, page: 2, total: TODOS.length + 1, has_more: false },
            }
      );
    });
    renderTodo('/work/20261006-201244-b2487c?family=jeryu');
    expect(
      await screen.findByRole('heading', { name: 'Being worked right now' })
    ).toBeInTheDocument();
  });

  it('opens a todo the scoped family does not hold rather than calling it missing', async () => {
    serveTodos([todo({ id: '20261006-201244-b2487c', family: 'jain', title: 'Jain side' })]);
    renderTodo('/work/20261006-201244-b2487c?family=jeryu');
    expect(await screen.findByRole('heading', { name: 'Jain side' })).toBeInTheDocument();
  });

  it('names a rework only from the same family when two families share an id', async () => {
    serveTodos([
      todo({ id: '20260919-1100-dup', family: 'jeryu', title: 'Jeryu side' }),
      todo({ id: '20260919-1100-same', family: 'jeryu', title: 'Jeryu rework', reworks: ['20260919-1100-dup'] }),
      todo({ id: '20260919-1100-other', family: 'jain', title: 'Jain rework', reworks: ['20260919-1100-dup'] }),
    ]);
    renderTodo('/work/20260919-1100-dup?family=jeryu');
    expect(await screen.findByRole('heading', { name: 'Jeryu side' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '20260919-1100-same' })).toHaveAttribute(
      'href',
      '/work/20260919-1100-same?family=jeryu'
    );
    expect(screen.queryByRole('link', { name: '20260919-1100-other' })).toBeNull();
  });

  it('opens the one family a ?family= names', async () => {
    serveTodos([
      todo({ id: '20260919-1100-dup', family: 'jeryu', title: 'Jeryu side' }),
      todo({ id: '20260919-1100-dup', family: 'jain', title: 'Jain side' }),
    ]);
    renderTodo('/work/20260919-1100-dup?family=jain');
    expect(await screen.findByRole('heading', { name: 'Jain side' })).toBeInTheDocument();
  });
  describe('the comment thread', () => {
    const THREAD = {
      family: 'jeryu',
      todo_id: '20260919-0900-q1q',
      total: 2,
      comments: [
        { author: 'operator', at: '2026-09-19T12:00:00Z', body: '## First outage\n\nGDM crash loop.' },
        { author: 'alton', at: '2026-09-19T15:45:00Z', body: 'Measured **40s** of downtime.' },
      ],
    };
    const serveThread = (override?: Override): Recorded[] =>
      mockShiftApi((req) => {
        if (req.pathname.endsWith('/comments') && req.method === 'GET') return json(THREAD);
        return override?.(req);
      });

    it('renders the thread under the body, newest last, as markdown', async () => {
      serveThread();
      renderTodo('/work/20260919-0900-q1q');
      expect(await screen.findByRole('heading', { name: 'First outage' })).toBeInTheDocument();
      const thread = screen.getByTestId('todo-comments-20260919-0900-q1q');
      expect(within(thread).getByText('40s').tagName).toBe('STRONG');
      const items = within(thread).getAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(items[1]).toHaveTextContent('alton');
      expect(items[1]).toHaveTextContent('Measured 40s of downtime.');
      // A reader who cannot act on todos reads the thread and adds nothing.
      expect(within(thread).queryByLabelText(/^Comment on/)).toBeNull();
    });

    it('says so when a todo has no comments yet', async () => {
      mockShiftApi();
      renderTodo('/work/20260919-0900-q1q');
      const thread = await screen.findByTestId('todo-comments-20260919-0900-q1q');
      await waitFor(() => expect(thread).toHaveTextContent('No comments yet.'));
    });

    it('posts what an admin writes and clears the box', async () => {
      role = 'admin';
      const calls = serveThread((req) =>
        req.method === 'POST' && req.pathname.endsWith('/comments')
          ? json({ author: 'operator', at: '2026-09-19T16:00:00Z', body: 'Second outage today.' }, 201)
          : undefined
      );
      renderTodo('/work/20260919-0900-q1q');
      const box = await screen.findByLabelText('Comment on 20260919-0900-q1q');
      const add = screen.getByRole('button', { name: 'Add comment' });
      // Nothing written is nothing to post.
      expect(add).toBeDisabled();
      fireEvent.change(box, { target: { value: '  Second outage today.  ' } });
      fireEvent.click(add);
      await waitFor(() =>
        expect(calls.filter((c) => c.method === 'POST' && c.pathname.endsWith('/comments'))).toHaveLength(1)
      );
      const post = calls.find((c) => c.method === 'POST');
      expect(post?.pathname).toBe('/api/v1/shift/todos/jeryu/20260919-0900-q1q/comments');
      expect(post?.body).toEqual({ body: 'Second outage today.' });
      await waitFor(() => expect(screen.getByLabelText('Comment on 20260919-0900-q1q')).toHaveValue(''));
      // The thread is the only thing a comment writes: no action is posted.
      expect(calls.filter((c) => c.pathname.endsWith('/action'))).toHaveLength(0);
    });

    it("shows the server's refusal of a comment beside the box", async () => {
      role = 'admin';
      serveThread((req) =>
        req.method === 'POST' ? errorResponse(422, 'body must not be empty') : undefined
      );
      renderTodo('/work/20260919-0900-q1q');
      const box = await screen.findByLabelText('Comment on 20260919-0900-q1q');
      fireEvent.change(box, { target: { value: 'x' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('body must not be empty');
    });
  });
});
