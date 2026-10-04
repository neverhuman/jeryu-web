// RepositoryCommitsPage.test.tsx — the commits list and one commit's page.
//
// Both pages read a resolved repository plus one query of their own, so the
// cache is seeded and the render asserted: the rows of a history (narrowed to
// a path, and paged on `has_more`), and a commit's message with its diff.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { RepositoryListResponse, RepositorySummary } from '../../api/types';
import type { RepoCommitDetail, RepoCommitsResponse } from '../../api/types/commits';
import { repositoriesQueryKey } from '../../hooks/useRepositories';
import { repoCommitQueryKey } from '../../hooks/useRepoCommit';
import { RepositoryCommitPage } from '../RepositoryCommitPage';
import { RepositoryCommitsPage } from '../RepositoryCommitsPage';
import { COMMITS_PAGE_SIZE } from '../repoCommitsModel';

const SUMMARY = {
  id: { id: 'repo-1', host: 'jeryu', owner: 'acme', name: 'widget' },
  entity: { kind: 'repository', id: 'repo-1' },
  description: null,
  visibility: 'private',
  default_branch: 'main',
  family: 'acme',
  archived: false,
  repo_role: null,
  topics: [],
  language: 'Rust',
  health: 'healthy',
  open_pull_requests: 0,
  failing_checks: 0,
  running_jobs: 0,
  active_agents: 0,
  blocked_agents: 0,
  updated_at: '2026-05-25T09:00:00Z',
  clone_http_url: null,
  clone_ssh_url: null,
  available_actions: [],
} as unknown as RepositorySummary;

function repoList(): RepositoryListResponse {
  return {
    generated_at: '2026-05-25T09:00:00Z',
    total: 1,
    repositories: [SUMMARY],
    facets: { hosts: [], visibilities: [], families: [] },
  } as unknown as RepositoryListResponse;
}

function history(overrides: Partial<RepoCommitsResponse['page']> = {}): RepoCommitsResponse {
  return {
    ref: 'main',
    sha: 'a'.repeat(40),
    commits: [
      {
        sha: 'a'.repeat(40),
        summary: 'feat: call run',
        author: 'Ada Lovelace',
        committed_at: '2026-05-25T09:00:00Z',
      },
      {
        sha: 'b'.repeat(40),
        summary: 'feat: add the entry point',
        author: 'Bea Fermat',
        committed_at: '2026-05-24T09:00:00Z',
      },
    ],
    page: { limit: COMMITS_PAGE_SIZE, page: 1, total: 2, has_more: false, ...overrides },
  };
}

function seeded(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(repositoriesQueryKey({ host: 'jeryu' }), repoList());
  return client;
}

function historyKey(path: string, page: number): readonly unknown[] {
  return ['repo', 'repo-1', 'commits', 'main', 'path', path, 'page', page, COMMITS_PAGE_SIZE];
}

function renderAt(client: QueryClient, url: string, element: JSX.Element): void {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>{element}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('RepositoryCommitsPage', () => {
  it('lists a ref\'s commits with author, time and sha', () => {
    const client = seeded();
    client.setQueryData(historyKey('', 1), history());
    renderAt(
      client,
      '/repos/jeryu/acme/widget/commits/main',
      <RepositoryCommitsPage provider="jeryu" fullName="acme/widget" refTail="main" />
    );

    expect(screen.getByRole('heading', { name: 'Commits on main' })).toBeInTheDocument();
    expect(screen.getByTestId('repo-commits-range')).toHaveTextContent('Commits 1–2 of 2');
    expect(screen.getAllByTestId('repo-commit-row')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'feat: call run' })).toHaveAttribute(
      'href',
      `/repos/jeryu/acme/widget/commit/${'a'.repeat(40)}`
    );
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('aaaaaaaa')).toBeInTheDocument();
    // One page of everything there is: no paging to offer.
    expect(screen.queryByRole('navigation', { name: 'Commit pages' })).toBeNull();
  });

  it('narrows the history to `?path=` and says so', () => {
    const client = seeded();
    client.setQueryData(historyKey('src/main.rs', 1), history());
    renderAt(
      client,
      '/repos/jeryu/acme/widget/commits/main?path=src%2Fmain.rs',
      <RepositoryCommitsPage provider="jeryu" fullName="acme/widget" refTail="main" />
    );

    expect(
      screen.getByRole('heading', { name: 'History of src/main.rs' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'src/main.rs' })).toHaveAttribute(
      'href',
      '/repos/jeryu/acme/widget/blob/main/src/main.rs'
    );
    expect(screen.getByRole('link', { name: 'See the whole history.' })).toBeInTheDocument();
  });

  it('offers Older while the server says there is more, and Newer past page one', () => {
    const client = seeded();
    client.setQueryData(historyKey('', 2), history({ page: 2, total: 64, has_more: true }));
    renderAt(
      client,
      '/repos/jeryu/acme/widget/commits/main?page=2',
      <RepositoryCommitsPage provider="jeryu" fullName="acme/widget" refTail="main" />
    );

    const paging = screen.getByRole('navigation', { name: 'Commit pages' });
    expect(paging).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Newer' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Older' })).toBeEnabled();
    expect(screen.getByTestId('repo-commits-range')).toHaveTextContent('Commits 31–32 of 64');
  });

  it('says a path nothing touched has no commits', () => {
    const client = seeded();
    client.setQueryData(historyKey('docs/gone.md', 1), {
      ...history(),
      commits: [],
      page: { limit: COMMITS_PAGE_SIZE, page: 1, total: 0, has_more: false },
    });
    renderAt(
      client,
      '/repos/jeryu/acme/widget/commits/main?path=docs%2Fgone.md',
      <RepositoryCommitsPage provider="jeryu" fullName="acme/widget" refTail="main" />
    );

    expect(screen.getByText('No commit on main touched docs/gone.md.')).toBeInTheDocument();
  });
});

const DETAIL: RepoCommitDetail = {
  sha: 'a'.repeat(40),
  summary: 'feat: call run',
  message: 'feat: call run\n\nThe entry point did nothing.\n\nTodo: 20261003-020854\n',
  author: 'Ada Lovelace',
  author_email: 'ada@acme.example',
  authored_at: '2026-05-25T09:00:00Z',
  committed_at: '2026-05-25T09:00:00Z',
  parents: ['b'.repeat(40)],
  truncated: false,
  files: [
    {
      path: 'src/main.rs',
      old_path: null,
      status: 'modified',
      additions: 2,
      deletions: 1,
      risk: null,
      is_binary: false,
      hunks: [
        {
          header: '@@ -1,3 +1,4 @@',
          old_start: 1,
          old_lines: 3,
          new_start: 1,
          new_lines: 4,
          lines: [' fn main() {', '-}', '+    run();', '+}'],
        },
      ],
    },
  ],
};

describe('RepositoryCommitPage', () => {
  it('renders the commit message, its trailers and its diff', () => {
    const client = seeded();
    client.setQueryData(repoCommitQueryKey('repo-1', DETAIL.sha), DETAIL);
    renderAt(
      client,
      `/repos/jeryu/acme/widget/commit/${DETAIL.sha}`,
      <RepositoryCommitPage provider="jeryu" fullName="acme/widget" sha={DETAIL.sha} />
    );

    expect(screen.getByTestId('repo-commit-subject')).toHaveTextContent('feat: call run');
    expect(screen.getByText('The entry point did nothing.')).toBeInTheDocument();
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /parent bbbbbbbb/ })).toHaveAttribute(
      'href',
      `/repos/jeryu/acme/widget/commit/${'b'.repeat(40)}`
    );
    expect(screen.getByRole('region', { name: 'Diff for src/main.rs' })).toBeInTheDocument();
  });

  it('says so when a commit changes no files', () => {
    const client = seeded();
    const empty = { ...DETAIL, files: [], message: 'chore: empty commit' };
    client.setQueryData(repoCommitQueryKey('repo-1', DETAIL.sha), empty);
    renderAt(
      client,
      `/repos/jeryu/acme/widget/commit/${DETAIL.sha}`,
      <RepositoryCommitPage provider="jeryu" fullName="acme/widget" sha={DETAIL.sha} />
    );

    expect(screen.getByTestId('repo-commit-no-files')).toHaveTextContent(
      'This commit changes no files.'
    );
  });
});
