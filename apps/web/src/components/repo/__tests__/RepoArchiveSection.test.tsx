// RepoArchiveSection.test.tsx — the Archive section against PATCH /api/v1/repos/{id}.
//
// One button whose label follows the state, a confirm step naming the
// repository, `{ archived }` on the wire, and a 403 for a non-admin surfaced
// inside the dialog without closing it.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RepoArchiveSection } from '../RepoArchiveSection';
import { RepoArchivedBadge } from '../RepoArchivedBadge';
import type { RepositorySummary } from '../../../api/types';

const FULL_NAME = 'veox/redline';

function repoFixture(archived: boolean): RepositorySummary {
  return {
    id: { id: FULL_NAME, host: 'jeryu', owner: 'veox', name: 'redline' },
    entity: { kind: 'repository', id: FULL_NAME },
    description: null,
    visibility: 'internal',
    default_branch: 'main',
    family: null,
    archived,
    repo_role: null,
    topics: [],
    language: null,
    health: 'healthy',
    open_pull_requests: 0,
    failing_checks: 0,
    running_jobs: 0,
    active_agents: 0,
    blocked_agents: 0,
    updated_at: '2026-09-21T08:30:00Z',
    clone_http_url: null,
    clone_ssh_url: null,
    available_actions: [],
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderSection(archived: boolean): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RepoArchiveSection repo={repoFixture(archived)} />
    </QueryClientProvider>
  );
  return queryClient;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('RepoArchiveSection', () => {
  it('has one button and says archiving is read-only, reversible and deletes nothing', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderSection(false);
    const section = screen.getByTestId('repo-archive-section');
    expect(section).toHaveTextContent('read-only');
    expect(section).toHaveTextContent('Nothing is deleted');
    expect(section).toHaveTextContent('unarchive it');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Archive this repository' })
    ).toBeInTheDocument();
  });

  it('confirms by name, then sends archived: true and refreshes the repos list', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = renderSection(false);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(
      screen.getByRole('button', { name: 'Archive this repository' })
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(`Archive ${FULL_NAME}`);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: `Archive ${FULL_NAME}` })
    );

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/repos/veox%2Fredline');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ archived: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['repos'] });
  });

  it('an archived repository offers Unarchive and sends archived: false', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    renderSection(true);

    await user.click(screen.getByRole('button', { name: 'Unarchive' }));
    await user.click(
      screen.getByRole('button', { name: `Unarchive ${FULL_NAME}` })
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ archived: false });
  });

  it('a 403 for a non-admin stays in the dialog with the server message', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(403, {
          error: {
            code: 'forbidden',
            message: 'admin role required to archive or unarchive a repository',
            request_id: 'r1',
          },
        })
      )
    );
    renderSection(false);

    await user.click(
      screen.getByRole('button', { name: 'Archive this repository' })
    );
    await user.click(
      screen.getByRole('button', { name: `Archive ${FULL_NAME}` })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin role required'
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('RepoArchivedBadge', () => {
  it('shows Archived only for an archived repository', () => {
    const { rerender } = render(<RepoArchivedBadge archived />);
    expect(screen.getByText('Archived')).toBeInTheDocument();
    rerender(<RepoArchivedBadge archived={false} />);
    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
  });
});
