// ShiftQueuePage.test.tsx — the Work page's queue: every family with family
// pills, the shifts panel, filters, row expansion, admin-only row actions and
// "Open review PR", and the UX states.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShiftQueuePage } from '../shift/ShiftQueuePage';
import { errorResponse, json, mockShiftApi, renderAt } from './shiftPageHelpers';
import { TODOS, attempt, todo } from './shiftTestData';

let role: 'admin' | 'user' = 'admin';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { login: 'alton', role } }),
}));

function renderQueue(path = '/work'): void {
  renderAt(path, '/work', <ShiftQueuePage />);
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
    const bullet = screen.getByTestId('shift-branch-dayshift/2026-09-17');
    expect(within(bullet).getByRole('link', { name: 'PR #12 (open)' })).toHaveAttribute(
      'href',
      'https://git.example/jeryu/jeryu-web/pulls/12'
    );
    const done = await screen.findByTestId('shift-todo-20260918-2201-a9z');
    expect(within(done).getByRole('link', { name: 'jeryu-deploy@abcdef12' })).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-deploy'
    );
    // Live todos stand in one table per state (queued is not in progress), finished fold away.
    expect(screen.getByRole('heading', { name: /^In progress · \d+$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Queued · \d+$/ })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader', { name: 'Cost' }).length).toBeGreaterThan(2);
    // Only the table that holds landed commits has a Commits column.
    expect(screen.getAllByRole('columnheader', { name: 'Commits' })).toHaveLength(1);
    expect(screen.getByTestId('shift-finished-todos')).toContainElement(done);
    expect(screen.queryByRole('columnheader', { name: 'Requested by' })).toBeNull();
    expect(within(done).getByText('$1.25')).toBeInTheDocument();
    expect(within(screen.getByTestId('shift-todo-20260918-1832-k3f')).getByText('—', { selector: '.shift__cost' })).toBeInTheDocument();
    // One request for every family's todos; shift branches carry no family, so one per family.
    expect(calls.some((c) => c.pathname === '/api/v1/shift/todos' && c.search === '')).toBe(true);
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
    renderQueue('/work?family=jeryu&todo=20260918-1832-k3f');
    expect(await screen.findByTestId('shift-todo-detail-20260918-1832-k3f')).toBeInTheDocument();
    expect(screen.queryByTestId('shift-todo-20260918-2201-a9z')).toBeNull();
  });

  it('filters to one repository from ?repo=, as the Pull requests counts link it', async () => {
    mockShiftApi();
    renderQueue('/work?repo=jeryu-deploy');
    expect(await screen.findByTestId('shift-todo-20260918-2201-a9z')).toBeInTheDocument();
    expect(screen.queryByTestId('shift-todo-20260918-1832-k3f')).toBeNull();
    expect(screen.getByLabelText('Repo')).toHaveValue('jeryu-deploy');
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
    expect(screen.queryByRole('button', { name: 'Open review PR for dayshift/2026-09-17' })).toBeNull();
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

    // The chip counts the rows Needs you shows (3 urgent attention items), not
    // the queue's own idea of which todos wait, and it links to that page.
    const chip = await waitFor(() => {
      const found = screen.getByTestId('shift-needs-human');
      expect(found).toHaveTextContent('3 need a human');
      return found;
    });
    expect(chip).toHaveAttribute('href', '/needs-you');
  });

  it('scopes the needs-a-human chip to the picked family', async () => {
    mockShiftApi();
    renderQueue('/work?family=jeryu');
    // Only jeryu's row of the attention list counts; jain's does not.
    const chip = await waitFor(() => {
      const found = screen.getByTestId('shift-needs-human');
      expect(found).toHaveTextContent('1 needs a human');
      return found;
    });
    expect(chip).toHaveAttribute('href', '/needs-you?family=jeryu');
  });

  it('falls back to the queue count while the Needs you list is unavailable', async () => {
    mockShiftApi((req) => {
      if (req.pathname === '/api/v1/attention') return errorResponse(503, 'down');
      return req.pathname === '/api/v1/shift/todos'
        ? json({
            generated_at: '2026-09-19T09:00:00Z',
            todos: [TODOS[0], todo({ id: 'blk-2', title: 'Cut the core tag', status: 'blocked' })],
          })
        : undefined;
    });
    renderQueue();
    const chip = await screen.findByTestId('shift-needs-human');
    // The queue knows of one blocked todo, so the chip still tells the truth.
    expect(chip).toHaveTextContent('1 needs a human');
    expect(chip).toHaveAttribute('href', '/needs-you');
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
    renderQueue('/work?family=jain');
    const live = await screen.findByTestId('shift-branch-nightshift/2026-09-18');
    // Work landed after the PR merged: a review PR would carry it.
    expect(
      within(live).getByText(/1 todo needs a review PR to reach the base branch/)
    ).toBeInTheDocument();
    expect(within(live).getByRole('button', { name: 'Open review PR for nightshift/2026-09-18' })).toBeInTheDocument();
    expect(within(live).getByRole('link', { name: 'jain-deploy' })).toHaveAttribute(
      'href',
      '/repos/jeryu/veox/jain-deploy'
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

  it('shows every family, wears the family on each row, and filters from a pill', async () => {
    const families = {
      families: [
        { name: 'jeryu', queue_repo: 'jeryu/jeryu-todo', repos: [{ name: 'jeryu-web', order: 1 }], shift_tz: 'America/Los_Angeles', landing: 'shifts' },
        { name: 'jain', queue_repo: 'jain-split/jain-todo', repos: [{ name: 'jain-deploy', order: 1, owner: 'veox' }], shift_tz: 'America/Los_Angeles', landing: 'shifts' },
      ],
    };
    const todos = [
      todo({ id: 'j-1', family: 'jeryu', title: 'Jeryu open one', status: 'open' }),
      todo({ id: 'j-2', family: 'jeryu', title: 'Jeryu open two', status: 'open' }),
      todo({ id: 'n-1', family: 'jain', title: 'Jain blocked one', status: 'blocked', note: 'needs a tag' }),
    ];
    const calls = mockShiftApi((req) => {
      if (req.pathname === '/api/v1/shift/families') return json(families);
      if (req.pathname === '/api/v1/shift/todos') {
        return json({ generated_at: '2026-09-19T09:00:00Z', todos });
      }
      if (req.pathname === '/api/v1/shift/shifts') {
        const family = new URLSearchParams(req.search).get('family') ?? '';
        return json({
          shifts: [
            {
              branch: 'nightshift/2026-09-18',
              kind: 'nightshift',
              date: '2026-09-18',
              repos: [{ repo: `${family}-repo`, head: 'abc1234', ahead: 1, behind: 0, unmerged_todos: ['x'] }],
              todo_ids: ['x'],
            },
          ],
        });
      }
      return undefined;
    });
    renderQueue();

    // All families by default: three live rows, each led by its family pill.
    const jain = await screen.findByTestId('shift-todo-n-1');
    expect(screen.getByTestId('shift-todo-j-1')).toBeInTheDocument();
    // Two open todos are queued, not in progress; the blocked one waits on a human.
    expect(screen.getByRole('heading', { name: 'Queued · 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Waiting on a human · 1' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^In progress/ })).toBeNull();
    const strip = screen.getByRole('group', { name: 'Filter by family' });
    expect(within(strip).getByRole('button', { name: /^All 3$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(strip).getByRole('button', { name: /^jeryu 2$/ })).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: /^jain 1$/ })).toBeInTheDocument();
    // The same branch name under two families is two cards, each wearing its family.
    await waitFor(() =>
      expect(screen.getAllByTestId('shift-branch-nightshift/2026-09-18')).toHaveLength(2)
    );
    expect(calls.some((c) => c.pathname === '/api/v1/shift/shifts' && c.search === '?family=jain')).toBe(true);

    // The pill at the far left of a row filters the whole page to that family.
    fireEvent.click(within(jain).getByRole('button', { name: 'Show only jain' }));
    expect(screen.queryByTestId('shift-todo-j-1')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Waiting on a human · 1' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Queued/ })).toBeNull();
    expect(within(strip).getByRole('button', { name: /^jain 1$/ })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(screen.getAllByTestId('shift-branch-nightshift/2026-09-18')).toHaveLength(1)
    );
    // The composer follows the filter.
    expect(within(screen.getByRole('region', { name: 'Add work' })).getByLabelText('Family')).toHaveValue('jain');

    // Pressing the pill again shows every family.
    fireEvent.click(within(screen.getByTestId('shift-todo-n-1')).getByRole('button', { name: /^Showing only jain/ }));
    expect(screen.getByTestId('shift-todo-j-1')).toBeInTheDocument();
  });
});

