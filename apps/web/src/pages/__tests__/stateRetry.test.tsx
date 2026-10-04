// stateRetry.test.tsx — every page that reads the forge shows the shared
// failure surface when its read is rejected: `role="alert"`, the typed error
// code with the request id, and a Retry that asks for the read again.
//
// One test per page and per failing read, each driven by a fetch double that
// answers the named path with a typed 503 and counts how often it was asked.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DependenciesPage } from '../DependenciesPage';
import { FleetPage } from '../FleetPage';
import { IntelligencePage } from '../IntelligencePage';
import { PullRoomPage } from '../PullRoomPage';
import { ReleasesPage } from '../ReleasesPage';
import { RepositoryAgentsPage } from '../RepositoryAgentsPage';
import { RepositoryPullRequestsPage } from '../RepositoryPullRequestsPage';
import { ALL_BOARDS, listResponse } from '../../test/fixtures/releaseBoard';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { login: 'operator', role: 'admin' },
    isPending: false,
  }),
}));

/** The request id the forge stamps on the failure, as a UUID. */
const REQUEST_ID = 'b7f3a1d0-0000-4000-8000-000000000001';
const CODE = 'upstream_unavailable';

/** A repository the pages can resolve `jeryu/acme/widgets` to. */
const REPO_ID = 'repo-acme-widgets';
const REPO_ROUTE = '/repos/jeryu/acme%2Fwidgets';

interface Served {
  /** Paths (without query) answered with the typed 503. */
  failing: string[];
  /** Paths (without query) answered with a body. */
  ok?: Record<string, unknown>;
}

/** How often each path was asked for, so a Retry can be proven. */
type Counts = Map<string, number>;

function serve({ failing, ok = {} }: Served): Counts {
  const counts: Counts = new Map();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const raw = input instanceof Request ? input.url : String(input);
    const { pathname } = new URL(raw, 'http://localhost');
    counts.set(pathname, (counts.get(pathname) ?? 0) + 1);
    if (failing.includes(pathname)) {
      return body(503, {
        error: { code: CODE, message: 'The forge did not answer.', request_id: REQUEST_ID },
      });
    }
    if (pathname in ok) return body(200, ok[pathname]);
    return body(404, { error: { code: 'not_found', message: pathname } });
  });
  return counts;
}

function body(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function repoList(): Record<string, unknown> {
  return {
    generated_at: '2026-10-01T00:00:00Z',
    total: 1,
    repositories: [
      {
        id: { id: REPO_ID, host: 'jeryu', owner: 'acme', name: 'widgets' },
        default_branch: 'main',
        visibility: 'internal',
        archived: false,
        description: null,
        updated_at: '2026-10-01T00:00:00Z',
        open_pull_requests: 0,
        failing_checks: 0,
        language: null,
        family: null,
      },
    ],
    facets: { hosts: ['jeryu'], owners: ['acme'], families: [], languages: [] },
  };
}

function open(path: string, route: string, element: ReactElement): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * The failure surface named by `testId`: it is an alert, it says the typed
 * code and the request id, and its Retry asks `path` for the read again.
 */
async function expectRetry(testId: string, path: string, counts: Counts): Promise<void> {
  const alert = await screen.findByTestId(testId);
  expect(alert).toHaveAttribute('role', 'alert');
  expect(alert).toHaveTextContent(`${CODE} · request b7f3a1d0`);
  expect(within(alert).getByText(`${CODE} · request b7f3a1d0`)).toHaveAttribute(
    'title',
    `${CODE} · request ${REQUEST_ID}`
  );
  const asked = counts.get(path) ?? 0;
  expect(asked).toBeGreaterThan(0);
  await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
  await waitFor(() => {
    expect(counts.get(path) ?? 0).toBeGreaterThan(asked);
  });
}

/** The agents surface and its terminal touch browser-only transport APIs. */
function stubBrowserTransports(): void {
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

describe('a rejected read shows the shared failure surface with a Retry', () => {
  beforeEach(stubBrowserTransports);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Dependencies', async () => {
    const path = '/api/v1/control-plane/repo-graph';
    const counts = serve({ failing: [path] });
    open('/intelligence/dependencies', '/intelligence/dependencies', <DependenciesPage />);
    await expectRetry('dependencies-unavailable', path, counts);
  });

  it('Intelligence', async () => {
    const path = '/api/v1/control-plane/status';
    const counts = serve({ failing: [path] });
    open('/intelligence', '/intelligence', <IntelligencePage />);
    await expectRetry('intelligence-error', path, counts);
  });

  it('In flight', async () => {
    const path = '/api/v1/control-plane/status';
    const counts = serve({ failing: [path] });
    open('/in-flight', '/in-flight', <PullRoomPage />);
    await expectRetry('pull-room-error', path, counts);
  });

  it('Releases environments', async () => {
    const path = '/api/v3/repos/acme/widgets/environments';
    const counts = serve({ failing: [path], ok: { '/api/v1/repos': repoList() } });
    open('/releases?repo=acme%2Fwidgets', '/releases', <ReleasesPage />);
    await expectRetry('releases-error', path, counts);
  });

  it('Runners', async () => {
    const path = '/api/v1/control-plane/runners';
    const counts = serve({ failing: [path] });
    open('/runners', '/runners', <FleetPage />);
    await expectRetry('fleet-runners-error', path, counts);
  });

  it('RepositoryAgents, resolving the repository', async () => {
    const path = '/api/v1/repos';
    const counts = serve({ failing: [path] });
    open(`${REPO_ROUTE}/agents`, '/repos/:provider/:fullName/agents/*', <RepositoryAgentsPage />);
    await expectRetry('repo-agents-error', path, counts);
  });

  it('RepositoryAgents, listing the runs', async () => {
    const path = `/api/v1/repos/${REPO_ID}/agent-runs`;
    const counts = serve({ failing: [path], ok: { '/api/v1/repos': repoList() } });
    open(`${REPO_ROUTE}/agents`, '/repos/:provider/:fullName/agents/*', <RepositoryAgentsPage />);
    await expectRetry('agents-runs-error', path, counts);
  });

  it('RepoPulls, resolving the repository', async () => {
    const path = '/api/v1/repos';
    const counts = serve({ failing: [path] });
    open(
      `${REPO_ROUTE}/pulls`,
      '/repos/:provider/:fullName/pulls',
      <RepositoryPullRequestsPage />
    );
    await expectRetry('repo-pulls-resolve-error', path, counts);
  });

  it('RepoPulls, listing the pull requests', async () => {
    const path = `/api/v1/repos/${REPO_ID}/pulls`;
    const counts = serve({ failing: [path], ok: { '/api/v1/repos': repoList() } });
    open(
      `${REPO_ROUTE}/pulls`,
      '/repos/:provider/:fullName/pulls',
      <RepositoryPullRequestsPage />
    );
    await expectRetry('repo-pulls-error', path, counts);
  });

  it('ReleaseBoardView, listing the boards', async () => {
    const path = '/api/v1/release-board';
    const counts = serve({ failing: [path] });
    open('/releases', '/releases', <ReleasesPage />);
    await expectRetry('release-board-error', path, counts);
  });

  it('ReleaseBoardView, reading one family board', async () => {
    const path = '/api/v1/release-board/acme';
    const counts = serve({
      failing: [path],
      ok: { '/api/v1/release-board': listResponse(ALL_BOARDS) },
    });
    open('/releases?family=acme', '/releases', <ReleasesPage />);
    await expectRetry('release-board-family-error', path, counts);
  });
});
