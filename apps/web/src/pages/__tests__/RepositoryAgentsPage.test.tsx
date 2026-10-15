import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SHIFT_TODO_PAGE_LIMIT } from '../../api/shiftTodoLists';
import { RepositoryAgentsPage } from '../RepositoryAgentsPage';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { login: 'ada', role: 'admin' } }) }));

const REPO_ID = 'repo-1';
const AGENTS_ROUTE = '/repos/jeryu/alice%2Fjeryu/agents';
const NOW = '2026-09-21T00:21:16Z';

describe('RepositoryAgentsPage — New Session', () => {
  beforeEach(stubBrowserTransports);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs a session then navigates to the run terminal and mounts it', async () => {
    const fetchSpy = mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse(),
      'GET /api/v1/repos/repo-1/agent-runs': { items: [] },
      'GET /api/v1/repos/repo-1/bots': { bots: [] },
      'POST /api/v1/repos/repo-1/sessions': createdResponse('run-new'),
    });

    const probe = renderPage();

    const button = await screen.findByTestId('new-session-button');
    await userEvent.click(button);

    // The session create request fired against the per-repo sessions endpoint.
    await waitFor(() => {
      expect(postedTo(fetchSpy)).toContain('/api/v1/repos/repo-1/sessions');
    });

    // The terminal mounts on the freshly created run…
    const terminal = await screen.findByTestId('agent-terminal');
    expect(terminal).toHaveAttribute('data-run-id', 'run-new');
    // …and the URL deep-links to that run.
    await waitFor(() => {
      expect(probe.pathname()).toContain('/agents/run-new');
    });
  });

  it('starts the chosen provider with its model, from the providers a node runs', async () => {
    const fetchSpy = mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse(),
      'GET /api/v1/repos/repo-1/agent-runs': { items: [] },
      'GET /api/v1/repos/repo-1/bots': { bots: [] },
      'POST /api/v1/repos/repo-1/sessions': {
        ...createdResponse('run-grok'),
        branch: '',
        session_id: 'vm-run-grok',
      },
    });

    renderPage();

    const select = await screen.findByTestId('new-session-agent');
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Codex',
      'Claude',
      'Grok',
    ]);
    await userEvent.selectOptions(select, 'grok');
    await userEvent.type(screen.getByTestId('new-session-model'), 'grok-4');
    await userEvent.click(screen.getByTestId('new-session-button'));

    await waitFor(() => {
      expect(postedBodies(fetchSpy)).toEqual([{ provider: 'grok', model: 'grok-4' }]);
    });
    // A VM session has no branch of its own: its pane is named by session.
    expect(await screen.findByText('grok · vm-run-grok')).toBeInTheDocument();
    expect(screen.getByTestId('agents-all-sessions')).toHaveAttribute('href', '/sessions');
  });

  it('starts the agent on the prompt typed, trimmed, and describes the field by its hint', async () => {
    const fetchSpy = mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse(),
      'GET /api/v1/repos/repo-1/agent-runs': { items: [] },
      'GET /api/v1/repos/repo-1/bots': { bots: [] },
      'POST /api/v1/repos/repo-1/sessions': createdResponse('run-prompt'),
    });

    renderPage();

    const field = await screen.findByLabelText('Prompt');
    expect(field).toBe(screen.getByTestId('new-session-task'));
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveAccessibleDescription(
      'Optional. The agent starts on this prompt; leave it empty to start an interactive session. 8000 bytes left'
    );

    await userEvent.type(field, '  Fix the flaky parser test.{Enter}Then run the suite.  ');
    expect(screen.getByTestId('new-session-task-count')).toHaveTextContent('7954 bytes left');
    await userEvent.click(screen.getByTestId('new-session-button'));

    await waitFor(() => {
      expect(postedBodies(fetchSpy)).toEqual([
        { provider: 'codex', task: 'Fix the flaky parser test.\nThen run the suite.' },
      ]);
    });
    expect(await screen.findByTestId('agent-terminal')).toHaveAttribute('data-run-id', 'run-prompt');
  });

  it('holds New Session while the prompt is over 8000 bytes, and says by how much', async () => {
    const fetchSpy = mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse(),
      'GET /api/v1/repos/repo-1/agent-runs': { items: [] },
      'GET /api/v1/repos/repo-1/bots': { bots: [] },
      'POST /api/v1/repos/repo-1/sessions': createdResponse('run-long'),
    });
    const twoByte = '\u00e9'; // é: one character, two bytes of UTF-8

    renderPage();

    const field = await screen.findByTestId('new-session-task');
    const button = screen.getByTestId('new-session-button');
    const count = screen.getByTestId('new-session-task-count');

    // 4000 two-byte characters are 8000 bytes: exactly the limit, allowed.
    await userEvent.click(field);
    await userEvent.paste(twoByte.repeat(4000));
    expect(count).toHaveTextContent('0 bytes left');
    expect(button).toBeEnabled();
    expect(field).not.toHaveAttribute('aria-invalid');

    // One more is 8002 bytes: New Session is held, and the field says why.
    await userEvent.paste(twoByte);
    expect(button).toBeDisabled();
    expect(count).toBeVisible();
    expect(count).toHaveTextContent(
      '2 bytes over the limit of 8000: shorten the prompt to start a session.'
    );
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(/2 bytes over the limit of 8000/);
    await userEvent.click(button);
    expect(postedTo(fetchSpy)).toEqual([]);

    // Back at the limit, it starts, with every byte of the prompt.
    await userEvent.type(field, '{Backspace}');
    expect(button).toBeEnabled();
    await userEvent.click(button);
    await waitFor(() => {
      expect(postedBodies(fetchSpy)).toEqual([{ provider: 'codex', task: twoByte.repeat(4000) }]);
    });
  });

  it('names a listed VM session by its session id and says who started it', async () => {
    mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse(),
      'GET /api/v1/repos/repo-1/agent-runs': {
        items: [
          {
            run_id: 'ar-7',
            branch: '',
            runner: 'node-a',
            status: 'running',
            tty_live: true,
            shell_run_id: 'ar-8',
            agent: 'claude',
            session_id: 'vm-ar-7',
            owner: 'alice',
            started_by: 'bot/atlas',
            dispatch_state: 'running',
          },
        ],
      },
      'GET /api/v1/repos/repo-1/bots': { bots: [] },
    });
    renderPage();
    const row = await screen.findByTestId('agent-row-ar-7');
    const session = within(row).getByText('vm-ar-7');
    expect(session.closest('span')).toHaveAttribute('title', 'started by bot/atlas');
  });

  it('shows an error state when the session create fails', async () => {
    mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse(),
      'GET /api/v1/repos/repo-1/agent-runs': { items: [] },
      'GET /api/v1/repos/repo-1/bots': { bots: [] },
      'POST /api/v1/repos/repo-1/sessions': {
        status: 503,
        body: {
          error: { code: 'capacity_exhausted', message: 'No runner slots free.' },
        },
      },
    });

    renderPage();

    const button = await screen.findByTestId('new-session-button');
    await userEvent.click(button);

    const alert = await screen.findByTestId('new-session-error');
    expect(alert).toHaveTextContent('No runner slots free.');
    // No terminal mounted on failure.
    expect(screen.queryByTestId('agent-terminal')).not.toBeInTheDocument();
  });
});

describe('RepositoryAgentsPage — empty repository', () => {
  beforeEach(stubBrowserTransports);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows one empty state, not the terminal prompt under it', async () => {
    mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse(),
      'GET /api/v1/repos/repo-1/agent-runs': { items: [] },
      'GET /api/v1/repos/repo-1/bots': { bots: [] },
      [`GET /api/v1/shift/todos?limit=${SHIFT_TODO_PAGE_LIMIT}&page=1`]: { generated_at: NOW, todos: [] },
    });

    renderPage();

    expect(await screen.findByTestId('agents-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('agents-no-selection')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agents-queue')).not.toBeInTheDocument();
  });

  it('lists the queue runs on this repository', async () => {
    mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse(),
      'GET /api/v1/repos/repo-1/agent-runs': { items: [] },
      'GET /api/v1/repos/repo-1/bots': { bots: [] },
      [`GET /api/v1/shift/todos?limit=${SHIFT_TODO_PAGE_LIMIT}&page=1`]: { generated_at: NOW, todos: [queueTodo()] },
    });

    renderPage();

    const row = await screen.findByTestId('agent-queue-row-20260921-002116');
    expect(row).toHaveTextContent('Feed the agents page');
    expect(row).toHaveTextContent('node-2 · w3');
    expect(screen.getByTestId('agent-queue-status-20260921-002116')).toHaveTextContent(
      'running'
    );
    expect(row).toHaveAttribute(
      'href',
      '/work/20260921-002116'
    );
  });
});

const OTHER_ROUTE = '/repos/jeryu/bob%2Fother/agents';

describe('RepositoryAgentsPage — enrolled agent roster', () => {
  beforeEach(stubBrowserTransports);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows a Grokbot and a Musebot, with general, repository, and task reach', async () => {
    mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse(),
      'GET /api/v1/repos/repo-1/agent-runs': { items: [] },
      'GET /api/v1/repos/repo-1/bots': {
        bots: [
          botSummary({ id: 'g-general', display_name: 'Northwind', kind: 'grok' }),
          botSummary({
            id: 'm-repo',
            display_name: 'Southwind',
            kind: 'muse',
            slug: 'south',
            reach: { mode: 'repositories', repos: [{ owner: 'alice', name: 'jeryu' }] },
            last_outcome: null,
          }),
          botSummary({
            id: 'g-issue',
            display_name: 'Issuebound',
            kind: 'grok',
            slug: 'issue',
            reach: {
              mode: 'task',
              repo: { owner: 'alice', name: 'jeryu' },
              task_kind: 'issue',
              task_id: '17',
            },
            last_outcome: 'failed',
          }),
          botSummary({
            id: 'm-branch',
            display_name: 'Branchbound',
            kind: 'muse',
            slug: 'branch',
            reach: {
              mode: 'task',
              repo: { owner: 'alice', name: 'jeryu' },
              task_kind: 'branch',
              task_id: 'feature/login',
            },
            last_outcome: 'ok',
          }),
        ],
      },
    });

    renderPage();

    const rows = await screen.findAllByTestId('bot-row');
    expect(rows).toHaveLength(4);

    expect(within(rows[0]).getByTestId('bot-kind')).toHaveTextContent('Grokbot');
    expect(rows[0]).toHaveTextContent('Northwind');
    expect(rows[0]).not.toHaveTextContent('Musebot');
    expect(rows[0]).toHaveTextContent('General');
    expect(rows[0]).toHaveTextContent('shipped');
    expect(within(rows[0]).getByTitle(/Last successful access/)).toBeInTheDocument();

    expect(within(rows[1]).getByTestId('bot-kind')).toHaveTextContent('Musebot');
    expect(rows[1]).toHaveTextContent('Southwind');
    expect(rows[1]).toHaveTextContent('This repo');

    expect(rows[2]).toHaveTextContent('Task #17');
    expect(rows[3]).toHaveTextContent('feature/login');
    expect(rows[3]).not.toHaveTextContent('Task #');

    const href = screen.getByTestId('add-bot').getAttribute('href') ?? '';
    expect(new URL(href, 'http://localhost').searchParams.get('repo')).toBe('alice/jeryu');
  });

  it('does not show another repository roster', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const fetchSpy = mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse([
        { id: REPO_ID, owner: 'alice', name: 'jeryu' },
        { id: 'repo-2', owner: 'bob', name: 'other' },
      ]),
      'GET /api/v1/repos/repo-1/agent-runs': { items: [] },
      'GET /api/v1/repos/repo-2/agent-runs': { items: [] },
      'GET /api/v1/repos/repo-1/bots': {
        bots: [botSummary({ display_name: 'Northwind' })],
      },
      'GET /api/v1/repos/repo-2/bots': { bots: [] },
    });

    const first = renderPage(AGENTS_ROUTE, client);
    expect(await screen.findByText('Northwind')).toBeInTheDocument();
    first.unmount();

    renderPage(OTHER_ROUTE, client);
    expect(screen.queryByText('Northwind')).not.toBeInTheDocument();
    const empty = await screen.findByTestId('bot-empty');
    expect(empty.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'No enrolled agent on this repo yet'
    );
    const urls = (fetchSpy.mock.calls as Array<[unknown]>).map(([url]) => String(url));
    expect(urls.some((url: string) => url.includes('/api/v1/repos/repo-2/bots'))).toBe(true);
    expect(screen.queryByText('Northwind')).not.toBeInTheDocument();
  });

  it('shows the exact empty sentence', async () => {
    mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse(),
      'GET /api/v1/repos/repo-1/agent-runs': { items: [] },
      'GET /api/v1/repos/repo-1/bots': { bots: [] },
    });

    renderPage();

    const empty = await screen.findByTestId('bot-empty');
    expect(empty.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'No enrolled agent on this repo yet'
    );
    expect(screen.getByTestId('agents-empty')).toBeInTheDocument();
    expect(screen.getByTestId('new-session-button')).toBeInTheDocument();
  });
});

describe('RepositoryAgentsPage — agent presence', () => {
  beforeEach(stubBrowserTransports);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const RUN = {
    run_id: 'run-1',
    branch: 'fix/parser',
    runner: 'node-a',
    status: 'running',
    tty_live: true,
    agent: 'editor',
    shell_run_id: 'shell-1',
    updated_at: NOW,
  };
  // Not live, so no terminal opens by itself.
  const ENDED_RUN = { ...RUN, status: 'exited', tty_live: false };

  it('lists everyone at work in one list, live first, with family, collision and links', async () => {
    mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse(),
      'GET /api/v1/repos/repo-1/agent-runs': { items: [RUN] },
      'GET /api/v1/repos/repo-1/bots': { bots: [] },
      'GET /api/v1/repos/repo-1/agent-presence': {
        items: [
          presenceItem({ id: 'external:ended', state: 'ended', agent: 'codex' }),
          presenceItem({
            id: 'external:cli:one',
            collides_with: ['external:cli:two'],
            links: { pr: 'alice/jeryu#12', todo: 'acme:20261012-1200-abc123' },
            host: 'node-a',
          }),
          presenceItem({
            id: 'external:cli:two',
            agent: 'claude-code',
            operator: 'grace',
            via: 'family',
            family: 'acme',
            collides_with: ['external:cli:one'],
          }),
          presenceItem({
            id: 'agent_run:run-1',
            source: 'agent_run',
            agent: 'editor',
            branch: 'fix/parser',
            title: null,
            operator: null,
            links: { agent_run: 'run-1' },
          }),
        ],
        total: 4,
      },
    });

    renderPage();

    const list = await screen.findByTestId('agents-presence-list');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    // Ended sorts last; the jeryu run is one row, not two.
    expect(rows[3]).toHaveAttribute('data-testid', 'presence-row-external:ended');
    expect(screen.getAllByTestId('agent-row-run-1')).toHaveLength(1);
    expect(screen.queryByTestId('agents-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('agents-presence-live')).toHaveTextContent('3 live');

    expect(screen.getByTestId('presence-via-family-external:cli:two')).toHaveTextContent(
      'via family acme'
    );
    expect(screen.queryByTestId('presence-via-family-external:cli:one')).not.toBeInTheDocument();
    expect(screen.getByTestId('presence-collision-external:cli:one')).toHaveTextContent(
      'claude-code (grace)'
    );
    expect(screen.getByTestId('presence-host-external:cli:one')).toHaveTextContent('node-a');
    expect(screen.queryByTestId('presence-host-external:cli:two')).not.toBeInTheDocument();
    expect(screen.getByTestId('presence-pr-external:cli:one')).toHaveAttribute(
      'href',
      '/repos/jeryu/alice/jeryu/pulls/12'
    );
    expect(screen.getByTestId('presence-pr-external:cli:one')).toHaveTextContent('pull request #12');
    expect(screen.getByTestId('presence-todo-external:cli:one')).toHaveAttribute(
      'href',
      '/work/20261012-1200-abc123?family=acme'
    );
    expect(screen.getByTestId('presence-source-external:cli:one')).toHaveTextContent('external');
    expect(screen.getByTestId('presence-cost-external:cli:one')).toHaveTextContent('$1.23 so far');

    // The live run opened itself, and its row still opens the terminal.
    const terminals = await screen.findAllByTestId('agent-terminal');
    expect(terminals[0]).toHaveAttribute('data-run-id', 'run-1');
    await userEvent.click(screen.getByTestId('agent-row-run-1'));
    expect(screen.getByTestId('agent-row-run-1')).toHaveAttribute('aria-pressed', 'true');
  });

  it('says plainly when no agent is active', async () => {
    mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse(),
      'GET /api/v1/repos/repo-1/agent-runs': { items: [] },
      'GET /api/v1/repos/repo-1/bots': { bots: [] },
      'GET /api/v1/repos/repo-1/agent-presence': { items: [], total: 0 },
    });

    renderPage();

    const empty = await screen.findByTestId('agents-empty');
    expect(empty).toHaveTextContent('No agents are active on this repository.');
    expect(screen.queryByTestId('agents-no-selection')).not.toBeInTheDocument();
  });

  it('falls back to the runs list, with no banner, when the server answers with HTML', async () => {
    mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse(),
      'GET /api/v1/repos/repo-1/agent-runs': { items: [ENDED_RUN] },
      'GET /api/v1/repos/repo-1/bots': { bots: [] },
      'GET /api/v1/repos/repo-1/agent-presence': () =>
        new Response('<!doctype html><title>app</title>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    });

    renderPage();

    expect(await screen.findByTestId('agents-list')).toBeInTheDocument();
    expect(screen.getByTestId('agent-row-run-1')).toHaveTextContent('fix/parser');
    expect(screen.queryByTestId('agents-presence')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agents-presence-error')).not.toBeInTheDocument();
  });

  it('keeps the runs list and says so quietly when presence fails for real', async () => {
    mockFetch({
      'GET /api/v1/repos?host=jeryu': listResponse(),
      'GET /api/v1/repos/repo-1/agent-runs': { items: [ENDED_RUN] },
      'GET /api/v1/repos/repo-1/bots': { bots: [] },
      'GET /api/v1/repos/repo-1/agent-presence': {
        status: 500,
        body: { error: { code: 'internal', message: 'boom' } },
      },
    });

    renderPage();

    expect(await screen.findByTestId('agents-presence-error', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByTestId('agents-list')).toBeInTheDocument();
  });
});

function presenceItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'external:cli:one',
    source: 'external',
    session_id: 'cli:one',
    agent: 'codex',
    model: 'model-x',
    operator: 'ada',
    lane: 'agent-presence',
    branch: 'ada/agent-presence',
    title: 'Wire presence into the tab',
    state: 'active',
    via: 'repo',
    started_at: Date.parse(NOW) - 3_600_000,
    last_active_at: Date.parse(NOW),
    expires_at: Date.parse(NOW) + 300_000,
    cost_usd: 1.23,
    links: {},
    collides_with: [],
    ...overrides,
  };
}

function queueTodo(): Record<string, unknown> {
  return {
    id: '20260921-002116',
    family: 'jeryu',
    title: 'Feed the agents page',
    body: '',
    repos: ['jeryu'],
    mode: 'night',
    priority: 0,
    blocked_by: [],
    status: 'claimed',
    attempts: 1,
    requested_by: 'operator',
    filed_at: NOW,
    claim_by: 'node-2/w3',
    lease_until: null,
    lease_live: true,
    shift: null,
    change_set: null,
    commits: {},
    merged: false,
    note: '',
    triaged: true,
    worked_by: [
      {
        by: 'operator',
        host: 'node-2',
        slot: 'w3',
        model: 'opus',
        session: null,
        started: NOW,
        ended: null,
        outcome: '',
        cost_usd: null,
        note: '',
        shift: null,
      },
    ],
  };
}

/** The agents surface and its terminal touch browser-only transport APIs. */
function stubBrowserTransports(): void {
    // The agents surface + mounted terminal touch browser-only transport APIs.
    // Minimal doubles keep this page-level render focused on navigation.
    vi.stubGlobal(
      'WebSocket',
      class {
        static OPEN = 1;
        readyState = 1;
        addEventListener(): void {}
        removeEventListener(): void {}
        send(): void {}
        close(): void {}
      }
    );
    vi.stubGlobal(
      'EventSource',
      class {
        onopen: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        constructor(public url: string) {}
        close(): void {}
      }
    );
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    );
}

// ── harness ────────────────────────────────────────────────────────────────

interface RouteResult {
  status?: number;
  body: unknown;
}

function renderPage(
  route = AGENTS_ROUTE,
  client?: QueryClient
): { pathname: () => string; unmount: () => void } {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  let current = route;
  function LocationProbe(): null {
    current = useLocation().pathname;
    return null;
  }
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <LocationProbe />
        <Routes>
          <Route
            path="/repos/:provider/:fullName/agents/*"
            element={<RepositoryAgentsPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { pathname: () => current, unmount: () => view.unmount() };
}

function botSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'bot-1',
    owner: 'alice',
    slug: 'north',
    display_name: 'Northwind',
    kind: 'grok',
    status: 'active',
    reach: { mode: 'general' },
    credential_generation: 1,
    last_successful_access: NOW,
    last_auth: null,
    last_mutation: null,
    last_heartbeat: null,
    last_action: null,
    last_outcome: 'shipped',
    last_repo: null,
    created_at: NOW,
    ...overrides,
  };
}

function mockFetch(
  routes: Record<string, unknown>
): ReturnType<typeof vi.spyOn> {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const rawUrl = input instanceof Request ? input.url : String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const parsed = new URL(rawUrl, 'http://localhost');
      const key = `${method} ${parsed.pathname}${parsed.search}`;
      const match = routes[key];
      if (match === undefined) {
        return jsonResponse(404, {
          error: { code: 'not_found', message: key },
        });
      }
      if (typeof match === 'function') {
        return match();
      }
      if (isRouteResult(match)) {
        return jsonResponse(match.status ?? 200, match.body);
      }
      return jsonResponse(200, match);
    });
}

function isRouteResult(value: unknown): value is RouteResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'body' in value &&
    'status' in value
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function postedTo(spy: ReturnType<typeof vi.spyOn>): string[] {
  const calls = spy.mock.calls as Array<[unknown, RequestInit | undefined]>;
  return calls
    .filter(([, init]) => (init?.method ?? 'GET').toUpperCase() === 'POST')
    .map(([url]) => String(url));
}

function postedBodies(spy: ReturnType<typeof vi.spyOn>): unknown[] {
  const calls = spy.mock.calls as Array<[unknown, RequestInit | undefined]>;
  return calls
    .filter(([, init]) => (init?.method ?? 'GET').toUpperCase() === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)));
}

function createdResponse(runId: string): Record<string, unknown> {
  return {
    run_id: runId,
    branch: `agent/${runId}`,
    base_oid: 'b'.repeat(40),
    ws_scope: `agent_run.${runId}`,
    tty_topic: `agent_run.${runId}.tty`,
    control_url: `/api/v1/agent-runs/${runId}/control`,
    status_url: `/api/v1/agent-runs/${runId}/status`,
  };
}

function listResponse(
  repos: Array<{ id: string; owner: string; name: string }> = [
    { id: REPO_ID, owner: 'alice', name: 'jeryu' },
  ]
): Record<string, unknown> {
  return {
    generated_at: '2026-06-05T00:00:00Z',
    total: repos.length,
    repositories: repos.map((repo) => ({
      id: { id: repo.id, host: 'jeryu', owner: repo.owner, name: repo.name },
      entity: { kind: 'repository', id: repo.id },
      description: null,
      visibility: 'private',
      default_branch: 'main',
      family: null,
      repo_role: null,
      topics: [],
      language: null,
      health: 'healthy',
      open_pull_requests: 0,
      failing_checks: 0,
      running_jobs: 0,
      active_agents: 0,
      blocked_agents: 0,
      updated_at: '2026-06-05T00:00:00Z',
      clone_http_url: null,
      clone_ssh_url: null,
      available_actions: [],
    })),
    facets: { hosts: ['jeryu'], owners: repos.map((repo) => repo.owner), families: [], languages: [] },
  };
}
