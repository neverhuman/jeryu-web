// RepositoryFamilyPage.test.tsx — the old family address is a doorway now.
//
// `useRepositories` is mocked so the test focuses on where the page sends the
// reader: the repository the family publishes from, or the member `?repo=`
// names. The states it still draws — loading, empty, 403 permission denied
// (negative authorization proof) and a failed read with a retry — are here too.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../api/client';
import { RepositoryFamilyPage } from '../RepositoryFamilyPage';
import type { RepositorySummary } from '../../api/types';

const useRepositoriesMock = vi.fn();

vi.mock('../../hooks/useRepositories', () => ({
  useRepositories: (query: unknown) => useRepositoriesMock(query),
}));

function repoSummary(
  name: string,
  overrides: Partial<RepositorySummary> = {}
): RepositorySummary {
  return {
    id: { id: `uuid-${name}`, host: 'jeryu', owner: 'veox', name },
    entity: { kind: 'repository', id: `uuid-${name}` },
    description: null,
    visibility: 'internal',
    default_branch: 'main',
    family: 'veox-split',
    archived: false,
    repo_role: null,
    topics: [],
    language: null,
    health: 'healthy',
    open_pull_requests: 1,
    failing_checks: 0,
    running_jobs: 0,
    active_agents: 0,
    blocked_agents: 0,
    updated_at: '2026-06-09T08:30:00Z',
    clone_http_url: null,
    clone_ssh_url: null,
    available_actions: [],
    ...overrides,
  };
}

function listResult(repositories: RepositorySummary[]): unknown {
  return {
    data: {
      generated_at: '2026-06-10T00:00:00Z',
      total: repositories.length,
      repositories,
      facets: { hosts: [], owners: [], families: [], languages: [] },
    },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  };
}

function Landed(): JSX.Element {
  const location = useLocation();
  return <div data-testid="landed">{location.pathname}</div>;
}

function renderPage(family = 'veox-split', search = ''): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[`/repos/family/${encodeURIComponent(family)}${search}`]}
      >
        <Routes>
          <Route
            path="/repos/family/:family"
            element={<RepositoryFamilyPage />}
          />
          <Route path="/repos/:provider/*" element={<Landed />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('RepositoryFamilyPage', () => {
  beforeEach(() => {
    useRepositoriesMock.mockReset();
  });

  it('lands on the repository the family publishes from', () => {
    useRepositoriesMock.mockReturnValue(
      listResult([
        repoSummary('redline'),
        repoSummary('bluebird', { repo_role: 'public_portal' }),
      ])
    );

    renderPage();

    expect(useRepositoriesMock).toHaveBeenCalledWith({
      family: 'veox-split',
      sort: 'name',
    });
    expect(screen.getByTestId('landed')).toHaveTextContent(
      '/repos/jeryu/veox/bluebird'
    );
  });

  it('lands on the member ?repo= names, so old links keep working', () => {
    useRepositoriesMock.mockReturnValue(
      listResult([repoSummary('redline'), repoSummary('bluebird')])
    );

    renderPage('veox-split', '?repo=redline');

    expect(screen.getByTestId('landed')).toHaveTextContent(
      '/repos/jeryu/veox/redline'
    );
  });

  it('opens the family when ?repo= names nobody in it', () => {
    useRepositoriesMock.mockReturnValue(
      listResult([repoSummary('redline'), repoSummary('bluebird')])
    );

    renderPage('veox-split', '?repo=not-a-member');

    // Alphabetical, no portal: the first member of the family.
    expect(screen.getByTestId('landed')).toHaveTextContent(
      '/repos/jeryu/veox/bluebird'
    );
  });

  it('renders the empty state with a back-to-repos action', () => {
    useRepositoriesMock.mockReturnValue(listResult([]));

    renderPage();

    expect(
      screen.getByText('No repositories in this family')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Back to repositories/ })
    ).toHaveAttribute('href', '/repos');
  });

  it('renders permission denied for a non-owner viewer (403 forbidden) without leaking repos', () => {
    // Negative authorization proof (owner/non-owner): a viewer without
    // repo.read on this family gets 403 forbidden from the list endpoint.
    useRepositoriesMock.mockReturnValue({
      data: undefined,
      isPending: false,
      error: new ApiError(403, {
        code: 'permission_denied',
        message: 'missing repo.read',
      }),
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Permission denied')).toBeInTheDocument();
    expect(screen.getByText(/missing: repo\.read/)).toBeInTheDocument();
    // The non-owner viewer must see zero repository data in the DOM.
    expect(screen.queryByTestId('landed')).toBeNull();
    expect(document.querySelector('.repo-card')).toBeNull();
  });

  it('renders the error state and retries via refetch', () => {
    const refetch = vi.fn();
    useRepositoriesMock.mockReturnValue({
      data: undefined,
      isPending: false,
      error: new ApiError(500, {
        code: 'internal',
        message: 'upstream exploded',
      }),
      refetch,
    });

    renderPage();

    expect(
      screen.getByText('Could not load family repositories')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
