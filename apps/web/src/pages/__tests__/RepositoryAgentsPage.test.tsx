import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
      'GET /api/v1/shift/todos': { generated_at: NOW, todos: [] },
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
      'GET /api/v1/shift/todos': { generated_at: NOW, todos: [queueTodo()] },
    });

    renderPage();

    const row = await screen.findByTestId('agent-queue-row-20260921-002116');
    expect(row).toHaveTextContent('Feed the agents page');
    expect(row).toHaveTextContent('xbabe2 · w3');
    expect(screen.getByTestId('agent-queue-status-20260921-002116')).toHaveTextContent(
      'running'
    );
    expect(row).toHaveAttribute(
      'href',
      '/work?family=jeryu&todo=20260921-002116'
    );
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
    requested_by: 'alton',
    filed_at: NOW,
    claim_by: 'xbabe2/w3',
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
        by: 'alton',
        host: 'xbabe2',
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

function renderPage(): { pathname: () => string } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  let current = AGENTS_ROUTE;
  function LocationProbe(): null {
    current = useLocation().pathname;
    return null;
  }
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[AGENTS_ROUTE]}>
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
  return { pathname: () => current };
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

function listResponse(): Record<string, unknown> {
  return {
    generated_at: '2026-06-05T00:00:00Z',
    total: 1,
    repositories: [
      {
        id: { id: REPO_ID, host: 'jeryu', owner: 'alice', name: 'jeryu' },
        entity: { kind: 'repository', id: REPO_ID },
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
      },
    ],
    facets: { hosts: ['jeryu'], owners: ['alice'], families: [], languages: [] },
  };
}
