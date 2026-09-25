// SearchPage.test.tsx — /search?q=: the query is read from and written to the
// URL, repositories come from the server search, pages and `name#12` pull
// requests are matched locally, and each section says when nothing matched.

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommandStore } from '../../stores/commandStore';
import { SearchPage } from './SearchPage';

interface RepoResult {
  isLoading: boolean;
  isError: boolean;
  error?: Error;
  data?: { repositories: unknown[] };
}

const jeryu = {
  id: { host: 'jeryu', owner: 'fam', name: 'jeryu' },
  description: 'The forge',
};
const jeryuWeb = { id: { host: 'jeryu', owner: 'fam', name: 'jeryu-web' }, description: null };

interface RepoQuery {
  search?: string;
}

interface RepoCall {
  query: RepoQuery;
  enabled?: boolean;
}

interface RepoState {
  search: ((query: RepoQuery) => RepoResult) | null;
  calls: RepoCall[];
}

// Declared, not cast: an `as` on the initialiser types the boundary by
// assertion, which is the shape the auditor reads as an any-boundary.
const repoState = vi.hoisted((): RepoState => ({ search: null, calls: [] }));

vi.mock('../../hooks/useRepositories', () => ({
  useRepositories: (query: { search?: string }, options?: { enabled?: boolean }) => {
    repoState.calls.push({ query, enabled: options?.enabled });
    if (options?.enabled === false) return { isLoading: false, isError: false };
    return repoState.search!(query);
  },
}));

function ok(repositories: unknown[]): RepoResult {
  return { isLoading: false, isError: false, data: { repositories } };
}

function renderAt(url: string) {
  const router = createMemoryRouter([{ path: '/search', element: <SearchPage /> }], {
    initialEntries: [url],
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('SearchPage', () => {
  beforeEach(() => {
    repoState.calls = [];
    repoState.search = () => ok([]);
    useCommandStore.setState({
      commands: [
        {
          id: 'nav.releases',
          title: 'Releases',
          keywords: ['deploy', 'channel'],
          target: { kind: 'route', path: '/releases' },
        },
        {
          id: 'nav.fleet',
          title: 'Fleet',
          keywords: ['runners'],
          target: { kind: 'route', path: '/fleet' },
        },
        {
          id: 'action.theme',
          title: 'Toggle theme deploy',
          keywords: [],
          target: { kind: 'action', actionId: 'theme' },
        },
      ],
    });
  });

  it('asks for a query and fetches nothing when the address has none', () => {
    renderAt('/search');
    expect(screen.getByText('Type something to search for')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Repositories' })).toBeNull();
    expect(repoState.calls.every((c) => c.enabled === false)).toBe(true);
  });

  it('lists server repository matches with links and descriptions', () => {
    repoState.search = () => ok([jeryu, jeryuWeb]);
    renderAt('/search?q=jeryu');
    expect(repoState.calls[0]).toEqual({
      query: { search: 'jeryu', sort: 'name' },
      enabled: true,
    });
    const section = screen.getByRole('region', { name: 'Repositories' });
    expect(within(section).getByRole('link', { name: 'fam/jeryu' })).toHaveAttribute(
      'href',
      '/repos/jeryu/fam/jeryu'
    );
    expect(within(section).getByText('— The forge')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'fam/jeryu-web' })).toBeInTheDocument();
  });

  it('says so when no repository or page matches', () => {
    renderAt('/search?q=nothing');
    expect(screen.getByText('No repository matches “nothing”.')).toBeInTheDocument();
    expect(screen.getByText('No page matches “nothing”.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pull requests' })).toBeNull();
  });

  it('shows loading and error states for the repository search', () => {
    repoState.search = () => ({ isLoading: true, isError: false });
    renderAt('/search?q=x');
    expect(
      within(screen.getByRole('region', { name: 'Repositories' })).queryByRole('link')
    ).toBeNull();
    cleanup();

    repoState.search = () => ({ isLoading: false, isError: true, error: new Error('boom') });
    renderAt('/search?q=x');
    expect(screen.getByText('Repository search failed.')).toBeInTheDocument();
  });

  it('matches route pages by title or keyword, never actions', () => {
    renderAt('/search?q=deploy');
    const section = screen.getByRole('region', { name: 'Pages' });
    const links = within(section).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Releases']);
    expect(links[0]).toHaveAttribute('href', '/releases');
  });

  it('offers a pull request link for name#12 from the full repository list', () => {
    repoState.search = (query) => (query.search === undefined ? ok([jeryu, jeryuWeb]) : ok([]));
    renderAt('/search?q=jeryu%2312');
    const section = screen.getByRole('region', { name: 'Pull requests' });
    const link = within(section).getByRole('link');
    expect(link).toHaveTextContent('Open pull request #12 in fam/jeryu');
    expect(link).toHaveAttribute('href', '/repos/jeryu/fam/jeryu/pulls/12');
  });

  it('writes a submitted query into the address and clears it when emptied', async () => {
    const user = userEvent.setup();
    const router = renderAt('/search?q=old');
    const input = screen.getByRole('searchbox', { name: 'Search query' });
    expect(input).toHaveValue('old');

    await user.clear(input);
    await user.type(input, '  fleet  ');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(router.state.location.search).toBe('?q=fleet');
    expect(
      within(screen.getByRole('region', { name: 'Pages' })).getByRole('link', { name: 'Fleet' })
    ).toBeInTheDocument();

    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(router.state.location.search).toBe('');
    expect(screen.getByText('Type something to search for')).toBeInTheDocument();
  });

  it('follows the address when it changes underneath the form', async () => {
    const router = renderAt('/search?q=one');
    await router.navigate('/search?q=two');
    expect(await screen.findByDisplayValue('two')).toBeInTheDocument();
  });
});
