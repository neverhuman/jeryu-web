import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

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

describe('RepoTable', () => {
  it.each(['mouse', 'keyboard'])('opens the PR count link with the %s without opening the row', async (input) => {
    const user = userEvent.setup();
    const router = createMemoryRouter([
      { path: '/', element: <RepoTable repos={[REPO]} /> },
      { path: '/pull-room', element: <h1>Pull Room</h1> },
      { path: '/repos/*', element: <h1>Repository</h1> },
    ]);
    render(<RouterProvider router={router} />);
    const link = screen.getByRole('link', { name: '0 open pull requests in Pull Room' });
    if (input === 'mouse') await user.click(link);
    else {
      link.focus();
      await user.keyboard('{Enter}');
    }
    expect(router.state.location.pathname).toBe('/pull-room');
    expect(new URLSearchParams(router.state.location.search).get('repo')).toBe('neverhuman/jeryu-core');
    expect(screen.getByRole('heading', { name: 'Pull Room' })).toBeInTheDocument();
  });

  it('renders split-member role badges in rows', () => {
    render(
      <MemoryRouter>
        <RepoTable repos={[REPO]} />
      </MemoryRouter>
    );

    expect(screen.getByText('Split member')).toBeInTheDocument();
  });

  it('labels the column Failing CI and shows a muted dash when nothing fails', () => {
    render(
      <MemoryRouter>
        <RepoTable repos={[{ ...REPO, running_jobs: 2 }]} />
      </MemoryRouter>
    );

    expect(screen.getByRole('columnheader', { name: /Failing CI/ })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^Checks/ })).not.toBeInTheDocument();
    const cell = screen.getByTestId('repo-failing-ci-jeryu-core');
    expect(cell).toHaveTextContent('—');
    expect(cell).toHaveClass('text-muted');
    expect(cell.tagName).not.toBe('A');
    expect(screen.getByLabelText('2 running jobs')).toBeInTheDocument();
  });

  it('links a non-zero failing CI count to the repo overview without opening the row', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter([
      { path: '/', element: <RepoTable repos={[{ ...REPO, failing_checks: 3 }]} /> },
      { path: '/repos/*', element: <h1>Repository</h1> },
    ]);
    render(<RouterProvider router={router} />);
    const link = screen.getByRole('link', { name: '3 failing CI checks' });
    expect(link).toHaveTextContent('3');
    await user.click(link);
    expect(router.state.location.pathname.startsWith('/repos/')).toBe(true);
    expect(screen.getByRole('heading', { name: 'Repository' })).toBeInTheDocument();
  });
});
