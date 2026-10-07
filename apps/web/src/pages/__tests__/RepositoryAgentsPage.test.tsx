import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SHIFT_TODO_PAGE_LIMIT } from '../../api/shiftTodoLists';
import { RepositoryAgentsPage } from '../RepositoryAgentsPage';

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

describe('RepositoryAgentsPage — Grokbot and Musebot roster', () => {
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
      'No Grokbot or Musebot on this repo yet'
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
      'No Grokbot or Musebot on this repo yet'
    );
    expect(screen.getByTestId('agents-empty')).toBeInTheDocument();
    expect(screen.getByTestId('new-session-button')).toBeInTheDocument();
  });
});

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
