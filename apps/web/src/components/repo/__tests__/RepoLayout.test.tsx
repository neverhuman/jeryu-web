import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RepoLayout } from '../RepoLayout';
import type { RepoTabKey } from '../../../pages/repoShellModel';

const FULL_NAME = 'acme/widget-api';
const BASE = '/repos/acme/acme/widget-api';

let authUser: { role: string } | null = { role: 'admin' };
let permissions: string[] = ['repo.admin'];
let warnings: string[] = [];

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ isPending: false, user: authUser }),
}));

describe('RepoLayout (the repository shell)', () => {
  beforeEach(() => {
    authUser = { role: 'admin' };
    permissions = ['repo.admin'];
    warnings = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      switch (url.pathname) {
        case '/api/v1/repos':
          return json({
            generated_at: '2026-10-01T00:00:00Z',
            total: 1,
            repositories: [summary()],
            facets: { hosts: ['acme'], owners: ['acme'], families: ['acme'], languages: [] },
          });
        case '/api/v1/bootstrap':
          return json({
            generated_at: '2026-10-01T00:00:00Z',
            schema_version: '0.1.0',
            viewer: {
              id: 'usr_1',
              login: '@dana',
              display_name: 'Dana',
              avatar_url: null,
              global_permissions: permissions,
            },
          });
        case '/api/v1/repos/repo-1/automation':
          return json({
            repo: FULL_NAME,
            defaultBranch: 'main',
            checks: [],
            requiredContexts: [],
            actors: [],
            mirrors: [],
            grants: [],
            grantsVisible: false,
            warnings,
          });
        default:
          return json({ code: 'not_found', message: url.pathname }, 404);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws one header and one tab bar, and marks the tab the page is', async () => {
    renderAt('agents');
    expect(await screen.findByRole('heading', { level: 1, name: 'widget-api' })).toBeInTheDocument();
    expect(screen.getByText('acme /')).toBeInTheDocument();

    const bar = screen.getByRole('navigation', { name: 'Repository' });
    expect(
      Array.from(bar.querySelectorAll('a')).map((link) => link.getAttribute('href'))
    ).toEqual([
      BASE,
      `${BASE}/pulls`,
      `${BASE}/automation`,
      `${BASE}/agents`,
      `${BASE}/activity`,
      `${BASE}/settings`,
    ]);
    expect(screen.getByTestId('repo-tab-agents')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('repo-tab-code')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('the page')).toBeInTheDocument();
  });

  it('counts the open pull requests and the agents at work on the tabs', async () => {
    renderAt('code');
    expect(await screen.findByTestId('repo-tab-count-pulls')).toHaveTextContent('7');
    expect(screen.getByTestId('repo-tab-count-agents')).toHaveTextContent('2');
    expect(screen.queryByTestId('repo-tab-count-code')).toBeNull();
  });

  it('marks Automation when one of its warnings needs a person', async () => {
    warnings = ['merge-bot has no write grant on acme/widget-api'];
    renderAt('code');
    expect(await screen.findByTestId('repo-tab-automation-warning')).toBeInTheDocument();
  });

  it('leaves Automation unmarked when nothing on it is wrong', async () => {
    renderAt('code');
    await screen.findByTestId('repo-tab-automation');
    await waitFor(() => expect(screen.queryByTestId('repo-tab-automation-warning')).toBeNull());
  });

  it('moves between tabs with the arrow keys, one tab stop for the bar', async () => {
    renderAt('code');
    const bar = await screen.findByRole('navigation', { name: 'Repository' });
    expect(screen.getByTestId('repo-tab-code')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('repo-tab-pulls')).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByTestId('repo-tab-pulls'));
    fireEvent.keyDown(bar, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(screen.getByTestId('repo-tab-code'));
    fireEvent.keyDown(bar, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByTestId('repo-tab-settings'));
  });

  it('hides Settings from a reader and refuses the page itself', async () => {
    authUser = { role: 'user' };
    permissions = ['repo.read'];
    renderAt('settings');
    await screen.findByRole('navigation', { name: 'Repository' });
    await waitFor(() => expect(screen.queryByTestId('repo-tab-settings')).toBeNull());
    expect(screen.getByRole('alert')).toHaveTextContent(/Permission denied/i);
    expect(screen.queryByText('the page')).toBeNull();
  });
});

function renderAt(tab: RepoTabKey): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[BASE]}>
        <RepoLayout provider="acme" fullName={FULL_NAME} tab={tab}>
          <p>the page</p>
        </RepoLayout>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function summary(): Record<string, unknown> {
  return {
    id: { id: 'repo-1', host: 'acme', owner: 'acme', name: 'widget-api' },
    entity: { kind: 'repository', id: 'repo-1' },
    description: 'The widget API',
    visibility: 'private',
    default_branch: 'main',
    family: 'acme',
    archived: false,
    repo_role: null,
    topics: [],
    language: 'Rust',
    health: 'healthy',
    open_pull_requests: 7,
    failing_checks: 0,
    running_jobs: 0,
    active_agents: 2,
    blocked_agents: 0,
    updated_at: '2026-10-01T00:00:00Z',
    clone_http_url: null,
    clone_ssh_url: null,
    available_actions: [],
  };
}
