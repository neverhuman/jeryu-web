// RepoSwitcher.test.tsx — the header chip is a switcher: it names where you
// are and takes you to another repository by name.
//
// Invented families only (acme, globex): this repository is public.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { FamilyScopeProvider } from '../../components/family/FamilyScopeProvider';
import {
  RepoSwitcher,
  repoHomeFromPath,
  repoNameFromPath,
  switchTargets,
} from '../RepoSwitcher';

const REPOS = [
  { host: 'example-forge', owner: 'acme', name: 'widgets', family: 'acme-split' },
  { host: 'example-forge', owner: 'acme', name: 'gears', family: 'acme-split' },
  { host: 'example-forge', owner: 'globex', name: 'ledger', family: 'globex' },
];

function mockApi(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(
      JSON.stringify({
        generated_at: '2026-10-06T00:00:00Z',
        total: REPOS.length,
        repositories: REPOS.map((repo) => ({
          id: { id: `${repo.owner}-${repo.name}`, ...repo },
          family: repo.family,
        })),
        facets: { hosts: [], owners: [], families: [], languages: [] },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  );
}

function Where(): JSX.Element {
  const { pathname } = useLocation();
  return <p data-testid="where">{pathname}</p>;
}

function renderAt(path: string): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <FamilyScopeProvider>
          <RepoSwitcher />
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
        </FamilyScopeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  // cmdk measures its list; jsdom has no ResizeObserver.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('repoNameFromPath', () => {
  it('names the repository a path is inside, never an id', () => {
    expect(repoNameFromPath('/repos/example-forge/acme/widgets')).toBe('acme/widgets');
    expect(repoNameFromPath('/repos/example-forge/acme/gears/blob/main/README.md')).toBe(
      'acme/gears'
    );
    expect(repoNameFromPath('/repos')).toBeNull();
    expect(repoNameFromPath('/repos/new')).toBeNull();
    expect(repoNameFromPath('/repos/family/acme-split')).toBeNull();
    expect(repoNameFromPath('/needs-you')).toBeNull();
  });
});

describe('switchTargets', () => {
  it('puts the family in scope first and leaves out the repository you are in', () => {
    const targets = switchTargets(
      REPOS.map((repo) => ({ id: repo, family: repo.family })),
      // The scope says `acme`; the rows say `acme-split`: one family either way.
      'acme',
      'acme/widgets'
    );
    expect(targets.map((target) => target.label)).toEqual(['acme/gears', 'globex/ledger']);
    expect(targets[0].path).toBe('/repos/example-forge/acme/gears');
  });

  it('sorts by name when no family is in scope', () => {
    const targets = switchTargets(
      REPOS.map((repo) => ({ id: repo, family: repo.family })),
      '',
      null
    );
    expect(targets.map((target) => target.label)).toEqual([
      'acme/gears',
      'acme/widgets',
      'globex/ledger',
    ]);
  });
});

describe('RepoSwitcher', () => {
  it('names the repository you are in and opens a typeahead over the rest', async () => {
    mockApi();
    renderAt('/repos/example-forge/acme/gears/pulls/38');
    const chip = screen.getByRole('button', { name: 'acme/gears: switch repository' });
    expect(chip).toHaveTextContent('acme/gears');

    fireEvent.click(chip);
    const input = await screen.findByLabelText('Switch repository');
    await waitFor(() => {
      expect(screen.getByText('acme/widgets')).toBeInTheDocument();
    });

    // Typing part of a name and pressing Enter lands on that repository.
    fireEvent.change(input, { target: { value: 'wid' } });
    await waitFor(() => {
      expect(screen.queryByText('globex/ledger')).not.toBeInTheDocument();
    });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByTestId('where')).toHaveTextContent(
        '/repos/example-forge/acme/widgets'
      );
    });
  });

  it('asks for nothing until it is opened', () => {
    mockApi();
    renderAt('/repos/example-forge/acme/gears');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('renders nothing outside a repository: the left nav already has Repositories', () => {
    mockApi();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/needs-you']}>
          <RepoSwitcher />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(container).toBeEmptyDOMElement();
    expect(repoHomeFromPath('/repos/family/acme-split')).toBeNull();
  });
});
