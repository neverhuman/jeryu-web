// SearchPage.test.tsx — /search?q=: the query is read from and written to the
// URL, the records come from one `GET /api/v1/search` call, pages are matched
// locally, and every section the server searched says when nothing matched.

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchHit, SearchQuery, SearchResponse } from '../../api/types';
import { useCommandStore } from '../../stores/commandStore';
import { SearchPage } from './SearchPage';

interface SearchResult {
  isLoading: boolean;
  isError: boolean;
  error?: Error;
  data?: SearchResponse;
}

interface SearchState {
  answer: ((query: SearchQuery) => SearchResult) | null;
  calls: SearchQuery[];
}

// Declared, not cast: an `as` on the initialiser types the boundary by
// assertion, which is the shape the auditor reads as an any-boundary.
const searchState = vi.hoisted((): SearchState => ({ answer: null, calls: [] }));

vi.mock('../../hooks/useSearch', () => ({
  useSearch: (query: SearchQuery) => {
    searchState.calls.push(query);
    if (query.q.trim() === '') return { isLoading: false, isError: false };
    return searchState.answer!(query);
  },
}));

const hit = (over: Partial<SearchHit> & Pick<SearchHit, 'kind' | 'id'>): SearchHit => ({
  title: over.id,
  context: '',
  path: '/',
  ...over,
});

function ok(over: Partial<SearchResponse> = {}): SearchResult {
  return {
    isLoading: false,
    isError: false,
    data: {
      generated_at: '2026-09-29T09:00:00Z',
      query: 'q',
      kinds: ['repository', 'pull_request', 'issue', 'todo'],
      counts: {},
      limit: 10,
      results: [],
      problems: [],
      ...over,
    },
  };
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
    searchState.calls = [];
    searchState.answer = () => ok();
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

  it('asks for a query and searches nothing when the address has none', () => {
    renderAt('/search');
    expect(screen.getByText('Type something to search for')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Repositories' })).toBeNull();
    expect(searchState.calls.every((c) => c.q.trim() === '')).toBe(true);
  });

  it('renders one section per kind the server searched, with links and context', () => {
    searchState.answer = () =>
      ok({
        results: [
          hit({
            kind: 'repository',
            id: 'repository:fam/jeryu',
            title: 'fam/jeryu',
            context: 'public',
            snippet: 'The forge',
            path: '/repos/jeryu/fam/jeryu',
          }),
          hit({
            kind: 'pull_request',
            id: 'pull_request:fam/jeryu#12',
            title: '#12 Write the receipt',
            context: 'fam/jeryu · open',
            path: '/repos/jeryu/fam/jeryu/pulls/12',
          }),
          hit({
            kind: 'todo',
            id: 'todo:jeryu/20260921',
            title: 'Add product-wide search',
            context: 'jeryu · open',
            path: '/work?family=jeryu&todo=20260921',
          }),
        ],
      });
    renderAt('/search?q=jeryu');
    expect(searchState.calls.at(-1)).toEqual({ q: 'jeryu' });

    const repos = screen.getByRole('region', { name: 'Repositories' });
    expect(within(repos).getByRole('link', { name: 'fam/jeryu' })).toHaveAttribute(
      'href',
      '/repos/jeryu/fam/jeryu'
    );
    expect(within(repos).getByText('The forge')).toBeInTheDocument();

    const pulls = screen.getByRole('region', { name: 'Pull requests' });
    expect(within(pulls).getByRole('link', { name: '#12 Write the receipt' })).toHaveAttribute(
      'href',
      '/repos/jeryu/fam/jeryu/pulls/12'
    );

    const todos = screen.getByRole('region', { name: 'Todos' });
    expect(within(todos).getByRole('link', { name: 'Add product-wide search' })).toHaveAttribute(
      'href',
      '/work?family=jeryu&todo=20260921'
    );

    // Nothing matched in Issues, and the page says so rather than hiding it.
    const issues = screen.getByRole('region', { name: 'Issues' });
    expect(within(issues).getByText('No issue matches “jeryu”.')).toBeInTheDocument();
  });

  it('never offers a section for a kind the server did not search', () => {
    searchState.answer = () => ok({ kinds: ['repository'] });
    renderAt('/search?q=jeryu');
    expect(screen.getByRole('region', { name: 'Repositories' })).toBeInTheDocument();
    for (const label of ['Pull requests', 'Issues', 'Todos', 'Activity']) {
      expect(screen.queryByRole('region', { name: label })).toBeNull();
    }
  });

  it('says how many more matched than the server returned', () => {
    searchState.answer = () =>
      ok({
        kinds: ['issue'],
        counts: { issue: 9 },
        results: [hit({ kind: 'issue', id: 'issue:fam/jeryu#1', title: '#1 a' })],
      });
    renderAt('/search?q=a');
    expect(screen.getByText('8 more issues match “a”.')).toBeInTheDocument();
  });

  it('reports a source the server could not read', () => {
    searchState.answer = () => ok({ problems: ['todo queue jeryu: no such ref'] });
    renderAt('/search?q=a');
    expect(
      screen.getByText('Could not search todo queue jeryu: no such ref')
    ).toBeInTheDocument();
  });

  it('shows loading and error states for the search', () => {
    searchState.answer = () => ({ isLoading: true, isError: false });
    renderAt('/search?q=x');
    expect(screen.queryByRole('region', { name: 'Repositories' })).toBeNull();
    cleanup();

    searchState.answer = () => ({ isLoading: false, isError: true, error: new Error('boom') });
    renderAt('/search?q=x');
    expect(screen.getByText('Search failed.')).toBeInTheDocument();
  });

  it('matches route pages by title or keyword, never actions', () => {
    renderAt('/search?q=deploy');
    const section = screen.getByRole('region', { name: 'Pages' });
    const links = within(section).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Releases']);
    expect(links[0]).toHaveAttribute('href', '/releases');
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
