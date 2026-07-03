import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RepoRouter } from '../RepoRouter';
import { WorkDetailPage } from '../WorkDetailPage';
import { WorkPage } from '../WorkPage';

describe('WorkPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders split-wide work items with provider-shaped issue and PR links', async () => {
    mockFetch([
      [
        '/api/v1/work',
        {
          total: 1,
          items: [
            workItem({
              title: 'Fix cache key',
              labels: ['cache'],
              issue: {
                owner: 'alice',
                repo: 'jeryu',
                number: 42,
                url: '/repos/jeryu/alice/jeryu/issues#42',
              },
              pull_requests: [
                {
                  owner: 'alice',
                  repo: 'jeryu',
                  number: 7,
                  url: '/repos/jeryu/alice/jeryu/pulls/7',
                },
              ],
            }),
          ],
        },
      ],
    ]);

    renderRoute('/work', <Route path="/work" element={<WorkPage />} />);

    expect(await screen.findByText('Fix cache key')).toBeInTheDocument();
    expect(screen.getByText('JRY-1')).toBeInTheDocument();
    expect(screen.getAllByText('cache').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: '#42' })).toHaveAttribute(
      'href',
      '/repos/jeryu/alice/jeryu/issues#42'
    );
    expect(screen.getByRole('link', { name: 'PR 7' })).toHaveAttribute(
      'href',
      '/repos/jeryu/alice/jeryu/pulls/7'
    );
  });

  it('submits split-wide create payloads without BigInt serialization', async () => {
    const requests = mockFetch([
      ['/api/v1/work', { total: 0, items: [] }],
      {
        method: 'POST',
        path: '/api/v1/work',
        response: workItem({
          title: 'Investigate runner retry',
          kind: 'bug',
          priority: 'p1',
          status: 'blocked',
        }),
      },
    ]);
    const user = userEvent.setup();

    renderRoute('/work', <Route path="/work" element={<WorkPage />} />);

    const createRegion = await screen.findByRole('region', {
      name: 'Create work item',
    });
    await user.type(
      within(createRegion).getByLabelText('Title'),
      'Investigate runner retry'
    );
    await user.selectOptions(within(createRegion).getByLabelText('Kind'), 'bug');
    await user.selectOptions(
      within(createRegion).getByLabelText('Priority'),
      'p1'
    );
    await user.selectOptions(
      within(createRegion).getByLabelText('Status'),
      'blocked'
    );
    await user.type(
      within(createRegion).getByLabelText('Body'),
      'Breaks on retry'
    );
    await user.type(
      within(createRegion).getByLabelText('Labels'),
      'ci, runner'
    );
    await user.type(
      within(createRegion).getByLabelText('Assignees'),
      'alice, agent:runner'
    );
    await user.click(within(createRegion).getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(requests.some((request) => request.method === 'POST')).toBe(true);
    });
    expect(requests.find((request) => request.method === 'POST')?.body).toEqual({
      repo: null,
      title: 'Investigate runner retry',
      body: 'Breaks on retry',
      status: 'blocked',
      kind: 'bug',
      priority: 'p1',
      labels: ['ci', 'runner'],
      assignees: [
        { kind: 'human', id: 'alice', display_name: null },
        { kind: 'agent', id: 'runner', display_name: null },
      ],
    });
  });

  it('submits repo-scoped create payloads to the repo Work endpoint', async () => {
    const requests = mockFetch([
      [
        '/api/v1/repos?host=jeryu',
        {
          generated_at: '2026-07-02T00:00:00Z',
          total: 1,
          repositories: [repoSummary()],
          facets: { hosts: ['jeryu'], owners: ['alice'], families: [], languages: [] },
        },
      ],
      ['/api/v1/repos/repo-1/work', { total: 0, items: [] }],
      {
        method: 'POST',
        path: '/api/v1/repos/repo-1/work',
        response: workItem({ title: 'Repo local task' }),
      },
    ]);
    const user = userEvent.setup();

    renderRoute(
      '/repos/jeryu/alice/jeryu/work',
      <Route
        path="/repos/:provider/:owner/:name/work"
        element={<WorkPage provider="jeryu" fullName="alice/jeryu" />}
      />
    );

    const createRegion = await screen.findByRole('region', {
      name: 'Create work item',
    });
    expect(screen.queryByLabelText('Repo')).not.toBeInTheDocument();
    await user.type(within(createRegion).getByLabelText('Title'), 'Repo local task');
    await user.click(within(createRegion).getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.method === 'POST' &&
            request.path === '/api/v1/repos/repo-1/work'
        )
      ).toBe(true);
    });
    expect(requests.find((request) => request.method === 'POST')?.body).toMatchObject({
      repo: null,
      title: 'Repo local task',
      status: 'ready',
      kind: 'task',
      priority: 'p2',
    });
  });

  it('routes repo /issues through the Work issue-compatible alias', async () => {
    mockFetch([
      [
        '/api/v1/repos?host=jeryu',
        {
          generated_at: '2026-07-02T00:00:00Z',
          total: 1,
          repositories: [repoSummary()],
          facets: { hosts: ['jeryu'], owners: ['alice'], families: [], languages: [] },
        },
      ],
      [
        '/api/v1/repos/repo-1/work',
        {
          total: 1,
          items: [
            workItem({
              title: 'Triage linked issue',
              issue: {
                owner: 'alice',
                repo: 'jeryu',
                number: 42,
                url: '/repos/jeryu/alice/jeryu/issues#42',
              },
            }),
          ],
        },
      ],
    ]);

    renderRoute(
      '/repos/jeryu/alice/jeryu/issues',
      <Route path="/repos/:provider/*" element={<RepoRouter />} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('work-page')).toBeInTheDocument();
      expect(screen.getByText('Triage linked issue')).toBeInTheDocument();
    });
    expect(screen.getByText('alice/jeryu issue-compatible work items.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#42' })).toHaveAttribute(
      'href',
      '/repos/jeryu/alice/jeryu/issues#42'
    );
  });

  it('navigates from repo-scoped Work cards to the Work detail route', async () => {
    const user = userEvent.setup();
    mockFetch([
      [
        '/api/v1/repos?host=jeryu',
        {
          generated_at: '2026-07-02T00:00:00Z',
          total: 1,
          repositories: [repoSummary()],
          facets: { hosts: ['jeryu'], owners: ['alice'], families: [], languages: [] },
        },
      ],
      [
        '/api/v1/repos/repo-1/work',
        {
          total: 1,
          items: [workItem({ title: 'Repo work detail' })],
        },
      ],
      [
        '/api/v1/work/JRY-1',
        {
          item: workItem({ title: 'Linked from repo board' }),
          comments: [],
        },
      ],
    ]);

    renderRoute(
      '/repos/jeryu/alice/jeryu/work',
      <>
        <Route path="/repos/:provider/*" element={<RepoRouter />} />
        <Route path="/work/:key" element={<WorkDetailPage />} />
      </>
    );

    await user.click(await screen.findByRole('link', { name: 'Repo work detail' }));

    expect(await screen.findByTestId('work-detail-page')).toBeInTheDocument();
    expect(screen.getByText('Linked from repo board')).toBeInTheDocument();
  });
});

describe('WorkDetailPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders detail state and submits updates, comments, and PR links', async () => {
    const requests = mockFetch([
      [
        '/api/v1/work/JRY-1',
        {
          item: workItem({
            title: 'Detail item',
            body: 'Initial body',
            issue: {
              owner: 'alice',
              repo: 'jeryu',
              number: 42,
              url: '/repos/jeryu/alice/jeryu/issues#42',
            },
            pull_requests: [
              {
                owner: 'alice',
                repo: 'jeryu',
                number: 7,
                url: '/repos/jeryu/alice/jeryu/pulls/7',
              },
            ],
          }),
          comments: [
            {
              id: 'comment-1',
              work_key: 'JRY-1',
              author: { kind: 'human', id: 'alice', display_name: null },
              body: 'Existing note',
              created_at: '2026-07-02T00:30:00Z',
            },
          ],
        },
      ],
      {
        method: 'PATCH',
        path: '/api/v1/work/JRY-1',
        response: workItem({ title: 'Detail item updated' }),
      },
      {
        method: 'POST',
        path: '/api/v1/work/JRY-1/comments',
        response: {
          id: 'comment-2',
          work_key: 'JRY-1',
          author: { kind: 'human', id: 'alice', display_name: null },
          body: 'Looks ready',
          created_at: '2026-07-02T01:00:00Z',
        },
      },
      {
        method: 'POST',
        path: '/api/v1/work/JRY-1/links',
        response: workItem({
          title: 'Detail item',
          pull_requests: [
            {
              owner: 'alice',
              repo: 'jeryu',
              number: 18,
              url: '/repos/jeryu/alice/jeryu/pulls/18',
            },
          ],
        }),
      },
    ]);
    const user = userEvent.setup();

    renderRoute('/work/JRY-1', <Route path="/work/:key" element={<WorkDetailPage />} />);

    expect(await screen.findByText('Detail item')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#42' })).toHaveAttribute(
      'href',
      '/repos/jeryu/alice/jeryu/issues#42'
    );
    expect(screen.getByRole('link', { name: 'alice/jeryu#7' })).toHaveAttribute(
      'href',
      '/repos/jeryu/alice/jeryu/pulls/7'
    );
    expect(screen.getByText('Existing note')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Detail item updated');
    await user.selectOptions(screen.getByLabelText('Status'), 'blocked');
    await user.selectOptions(screen.getByLabelText('Kind'), 'bug');
    await user.selectOptions(screen.getByLabelText('Priority'), 'p0');
    await user.clear(screen.getByLabelText('Labels'));
    await user.type(screen.getByLabelText('Labels'), 'release, urgent');
    await user.clear(screen.getByLabelText('Assignees'));
    await user.type(screen.getByLabelText('Assignees'), 'alice, agent:runner');
    await user.clear(screen.getByLabelText('Body'));
    await user.type(screen.getByLabelText('Body'), 'New body');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(
        requests.some((request) => request.method === 'PATCH')
      ).toBe(true);
    });
    expect(requests.find((request) => request.method === 'PATCH')?.body).toEqual({
      title: 'Detail item updated',
      body: 'New body',
      status: 'blocked',
      kind: 'bug',
      priority: 'p0',
      labels: ['release', 'urgent'],
      assignees: [
        { kind: 'human', id: 'alice', display_name: null },
        { kind: 'agent', id: 'runner', display_name: null },
      ],
    });

    await user.type(screen.getByLabelText('Comment body'), 'Looks ready');
    await user.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.method === 'POST' &&
            request.path === '/api/v1/work/JRY-1/comments'
        )
      ).toBe(true);
    });
    expect(
      requests.find((request) => request.path === '/api/v1/work/JRY-1/comments')
        ?.body
    ).toEqual({ body: 'Looks ready', author: null });

    await user.type(screen.getByLabelText('Pull request owner'), 'alice');
    await user.type(screen.getByLabelText('Pull request repo'), 'jeryu');
    await user.type(screen.getByLabelText('Pull request number'), '18');
    await user.click(screen.getByRole('button', { name: 'Link' }));

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.method === 'POST' &&
            request.path === '/api/v1/work/JRY-1/links'
        )
      ).toBe(true);
    });
    const linkBody = requests.find(
      (request) => request.path === '/api/v1/work/JRY-1/links'
    )?.body as Record<string, Record<string, unknown> | null> | undefined;
    expect(linkBody).toEqual({
      issue: null,
      pull_request: {
        owner: 'alice',
        repo: 'jeryu',
        number: 18,
        url: '/repos/jeryu/alice/jeryu/pulls/18',
      },
    });
    expect(typeof linkBody?.pull_request?.number).toBe('number');
  });
});

function renderRoute(route: string, child: JSX.Element): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>{child}</Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

interface CapturedRequest {
  method: string;
  path: string;
  body: unknown;
}

interface MockRoute {
  method?: string;
  path: string;
  response: unknown | ((request: CapturedRequest) => unknown);
  status?: number;
}

function mockFetch(
  routes: Array<[string, unknown] | MockRoute>
): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  const byPath = new Map<string, {
    response: MockRoute['response'];
    status: number;
  }>(
    routes.map((route) => {
      if (Array.isArray(route)) {
        return [`GET ${route[0]}`, { response: route[1], status: 200 }];
      }
      return [
        `${route.method ?? 'GET'} ${route.path}`,
        { response: route.response, status: route.status ?? 200 },
      ];
    })
  );
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const parsed = new URL(rawUrl, 'http://localhost');
    const path = parsed.pathname + parsed.search;
    const method =
      input instanceof Request
        ? init?.method ?? input.method
        : init?.method ?? 'GET';
    const body = parseRequestBody(init?.body);
    const request = { method, path, body };
    requests.push(request);
    const route = byPath.get(`${method} ${path}`);
    if (route === undefined) {
      return new Response(JSON.stringify({ error: { code: 'not_found', message: path } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    const response =
      typeof route.response === 'function' ? route.response(request) : route.response;
    return new Response(JSON.stringify(response), {
      status: route.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return requests;
}

function parseRequestBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string') return null;
  const parsed: unknown = JSON.parse(body);
  return parsed;
}

function repoSummary(): Record<string, unknown> {
  return {
    id: { id: 'repo-1', host: 'jeryu', owner: 'alice', name: 'jeryu' },
    entity: { kind: 'repository', id: 'repo-1' },
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
    updated_at: '2026-07-02T00:00:00Z',
    clone_http_url: null,
    clone_ssh_url: null,
    available_actions: [],
  };
}

function workItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '7a733f01-5f6f-41b5-9f1c-b535a4b3d681',
    key: 'JRY-1',
    number: 1,
    repo: { id: 'repo-1', host: 'jeryu', owner: 'alice', name: 'jeryu' },
    title: 'Work item',
    body: null,
    status: 'ready',
    kind: 'task',
    priority: 'p2',
    labels: [],
    assignees: [],
    issue: null,
    pull_requests: [],
    created_at: '2026-07-02T00:00:00Z',
    updated_at: '2026-07-02T00:00:00Z',
    ...overrides,
  };
}
