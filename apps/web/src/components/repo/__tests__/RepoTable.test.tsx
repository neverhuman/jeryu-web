import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RepositorySummary } from '../../../api/types';
import { RepoTable } from '../RepoTable';

const REPO: RepositorySummary = {
  id: {
    id: 'repo-uuid-1',
    host: 'jeryu',
    owner: 'neverhuman',
    name: 'jeryu-core',
  },
  entity: { kind: 'repository', id: 'repo-uuid-1' },
  description: 'Core split',
  visibility: 'public',
  default_branch: 'main',
  family: 'jeryu-split',
  archived: false,
  repo_role: 'split_member',
  topics: [],
  language: 'Rust',
  health: 'healthy',
  open_pull_requests: 0,
  failing_checks: 0,
  running_jobs: 0,
  active_agents: 0,
  blocked_agents: 0,
  updated_at: '2026-05-26T12:00:00Z',
  clone_http_url: null,
  clone_ssh_url: null,
  available_actions: [],
};

function withQueries(node: ReactElement): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function renderTable(repos: RepositorySummary[]): void {
  render(withQueries(<MemoryRouter><RepoTable repos={repos} /></MemoryRouter>));
}

describe('RepoTable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['mouse', 'keyboard'])('opens the PR count link with the %s without opening the row', async (input) => {
    const user = userEvent.setup();
    const router = createMemoryRouter([
      { path: '/', element: <RepoTable repos={[REPO]} /> },
      { path: '/in-flight', element: <h1>Pull requests</h1> },
      { path: '/repos/*', element: <h1>Repository</h1> },
    ]);
    render(<RouterProvider router={router} />);
    const link = screen.getByRole('link', { name: '0 open pull requests, see them' });
    if (input === 'mouse') await user.click(link);
    else {
      link.focus();
      await user.keyboard('{Enter}');
    }
    expect(router.state.location.pathname).toBe('/in-flight');
    expect(new URLSearchParams(router.state.location.search).get('repo')).toBe('neverhuman/jeryu-core');
    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
  });

  it('shows the last push in Updated, and says so, falling back to updated_at', () => {
    const pushed: RepositorySummary = {
      ...REPO,
      pushed_at: '2026-09-18T09:00:00Z',
    };
    const neverPushed: RepositorySummary = {
      ...REPO,
      id: { ...REPO.id, id: 'repo-uuid-2', name: 'jeryu-web' },
    };
    renderTable([pushed, neverPushed]);

    const [first, second] = Array.from(
      document.querySelectorAll('tbody time')
    );
    expect(first).toHaveAttribute('datetime', '2026-09-18T09:00:00Z');
    expect(first).toHaveAttribute('title', 'Last push: 2026-09-18T09:00:00Z');
    expect(second).toHaveAttribute('datetime', '2026-05-26T12:00:00Z');
    expect(second).toHaveAttribute('title', 'Last updated: 2026-05-26T12:00:00Z');
  });

  it('sorts Updated on the push time when there is one', async () => {
    const user = userEvent.setup();
    // Pushed longer ago than the other repo's metadata edit: sorting on
    // `updated_at` alone would put them the other way round.
    const pushed: RepositorySummary = {
      ...REPO,
      updated_at: '2026-09-19T12:00:00Z',
      pushed_at: '2026-01-02T09:00:00Z',
    };
    const edited: RepositorySummary = {
      ...REPO,
      id: { ...REPO.id, id: 'repo-uuid-2', name: 'jeryu-web' },
      updated_at: '2026-05-26T12:00:00Z',
    };
    renderTable([pushed, edited]);

    await user.click(screen.getByRole('columnheader', { name: 'Updated' }));
    const names = () =>
      Array.from(document.querySelectorAll('tbody tr strong')).map(
        (node) => node.textContent
      );
    expect(names()).toEqual(['jeryu-core', 'jeryu-web']);
    await user.click(screen.getByRole('columnheader', { name: 'Updated' }));
    expect(names()).toEqual(['jeryu-web', 'jeryu-core']);
  });

  it('renders split-member role badges in rows', () => {
    render(
      <MemoryRouter>
        <RepoTable repos={[REPO]} />
      </MemoryRouter>
    );

    expect(screen.getByText('Split member')).toBeInTheDocument();
  });

  it('names a repository owner/name as a link, so equal names stay distinguishable', () => {
    const twin: RepositorySummary = {
      ...REPO,
      id: { ...REPO.id, id: 'repo-uuid-2', owner: 'veox-ai' },
    };
    render(
      <MemoryRouter>
        <RepoTable repos={[REPO, twin]} />
      </MemoryRouter>
    );
    const first = screen.getByTestId('repo-link-neverhuman/jeryu-core');
    const second = screen.getByTestId('repo-link-veox-ai/jeryu-core');
    expect(first).toHaveTextContent('neverhuman/jeryu-core');
    expect(second).toHaveTextContent('veox-ai/jeryu-core');
    expect(first.tagName).toBe('A');
    expect(first.getAttribute('href')).not.toBe(second.getAttribute('href'));
    expect(screen.getByRole('row', { name: 'Open veox-ai/jeryu-core' })).toBeInTheDocument();
  });

  it('has one column about trouble, Status, and says healthy quietly', () => {
    renderTable([{ ...REPO, running_jobs: 2 }]);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'Family',
      'Repository',
      'Description',
      'Status',
      'Score (floor 85)',
      'Open PRs',
      'Updated',
    ]);
    const status = screen.getByTestId('repo-status-jeryu-core');
    expect(status).toHaveTextContent('healthy');
    expect(status).toHaveClass('text-muted');
    expect(status.tagName).not.toBe('BUTTON');
    expect(screen.getByLabelText('2 running jobs')).toBeInTheDocument();
    expect(screen.queryByTestId('repo-mirror-failing-jeryu-core')).toBeNull();
  });

  it('opens what is failing and what to do under the row, without leaving the page', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push(url);
      return new Response(
        JSON.stringify({
          check_runs: [
            {
              name: 'jankurai/proof',
              conclusion: 'failure',
              completed_at: '2026-09-19T17:00:00Z',
              output: { title: 'score 84 < floor 85', summary: '- score: 84\n- floor: 85' },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });
    const failing: RepositorySummary = {
      ...REPO,
      health: 'warning',
      failing_checks: 1,
      mirror: {
        configured: true,
        last_attempt_at: '2026-09-19T17:35:49Z',
        last_attempt_ok: false,
        last_attempt_conclusion: 'failure',
        last_success_at: null,
      },
    };
    const router = createMemoryRouter([
      { path: '/', element: withQueries(<RepoTable repos={[failing]} />) },
      { path: '/repos/*', element: <h1>Repository</h1> },
    ]);
    render(<RouterProvider router={router} />);

    const chip = screen.getByRole('button', { name: '1 failing check' });
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('repo-mirror-failing-jeryu-core')).toHaveTextContent('mirror failing');
    expect(calls).toEqual([]);

    await user.click(chip);
    expect(router.state.location.pathname).toBe('/');
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(chip.getAttribute('aria-controls') ?? '')).not.toBeNull();
    expect(await screen.findByText('jankurai/proof')).toBeInTheDocument();
    expect(screen.getByText(/score 84 < floor 85/)).toBeInTheDocument();
    expect(screen.getByText(/^Raise the audit score to the floor/)).toBeInTheDocument();
    expect(calls[0]).toContain('/api/v3/repos/neverhuman/jeryu-core/commits/main/check-runs');
    expect(
      screen.getByRole('link', { name: 'In flight for neverhuman/jeryu-core' })
    ).toHaveAttribute('href', '/in-flight?repo=neverhuman%2Fjeryu-core');

    await user.click(chip);
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('jankurai/proof')).toBeNull();
  });

  it('starts in the order the sort control names and reports matching header clicks', async () => {
    const user = userEvent.setup();
    const old: RepositorySummary = { ...REPO, updated_at: '2026-01-01T00:00:00Z' };
    const fresh: RepositorySummary = {
      ...REPO,
      id: { ...REPO.id, id: 'repo-uuid-2', name: 'a-fresh' },
      updated_at: '2026-09-01T00:00:00Z',
    };
    const onSortChange = vi.fn();
    render(
      withQueries(
        <MemoryRouter>
          <RepoTable repos={[old, fresh]} sort="recent_activity" onSortChange={onSortChange} />
        </MemoryRouter>
      )
    );
    expect(screen.getByRole('columnheader', { name: 'Updated' })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: 'Repository' })).toHaveAttribute('aria-sort', 'none');
    expect(Array.from(document.querySelectorAll('tbody tr strong')).map((n) => n.textContent)).toEqual([
      'a-fresh',
      'jeryu-core',
    ]);
    await user.click(screen.getByRole('columnheader', { name: 'Repository' }));
    expect(onSortChange).toHaveBeenCalledWith('name');
  });

  it('shows only the distinct part of a description and links the score to its evidence', () => {
    const rows = ['a', 'b', 'c'].map((name, i) => ({
      ...REPO,
      id: { ...REPO.id, id: `repo-${i}`, name },
      description: 'Primary shared Git authority (jain)',
      jankurai_score: 44,
    }));
    renderTable([...rows, { ...REPO, description: 'Core split' }]);
    const boiler = screen.getByTestId('repo-description-neverhuman/a');
    expect(boiler).toHaveTextContent('—');
    expect(boiler).toHaveAttribute('title', 'Primary shared Git authority (jain)');
    expect(screen.getByTestId('repo-description-neverhuman/jeryu-core')).toHaveTextContent('Core split');
    expect(screen.getByTestId('repo-score-neverhuman/a')).toHaveAttribute('href', '/quality-gate');
  });
});
