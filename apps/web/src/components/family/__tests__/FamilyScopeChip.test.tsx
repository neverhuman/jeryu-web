// FamilyScopeChip.test.tsx — the scope chip in the shell header.
//
// Invented families only (acme, globex, initech): this repository is public.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FamilyScopeChip } from '../FamilyScopeChip';
import { FAMILY_SCOPE_STORAGE_SLOT } from '../familyScope';
import { FamilyScopeProvider } from '../FamilyScopeProvider';

const FAMILIES = {
  families: [
    { name: 'acme-split', queue_repo: 'acme/acme-todo', repos: [], shift_tz: 'UTC', landing: {} },
    { name: 'globex', queue_repo: 'globex/globex-todo', repos: [], shift_tz: 'UTC', landing: {} },
  ],
};

function mockApi(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(JSON.stringify(FAMILIES), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  );
}

function Where(): JSX.Element {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{`${pathname}${search}`}</p>;
}

function renderAt(path: string): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <FamilyScopeProvider>
          <FamilyScopeChip />
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
        </FamilyScopeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('FamilyScopeChip', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('says which family is in scope and offers the way out', async () => {
    mockApi();
    renderAt('/work?family=acme-split');
    const select = screen.getByTestId('family-scope-select');
    expect(select).toHaveValue('acme');
    // One option per family, the aliases of one family folded into one key.
    await waitFor(() =>
      expect(
        Array.from(select.querySelectorAll('option')).map((option) => option.textContent)
      ).toEqual(['All', 'acme', 'globex'])
    );

    fireEvent.click(screen.getByTestId('family-scope-clear'));
    expect(screen.getByTestId('where').textContent).toBe('/work');
    expect(screen.queryByTestId('family-scope-clear')).toBeNull();
  });

  it('offers the families only the repository list names', async () => {
    // The header used to offer the shift queues alone, so a family with
    // repositories but no queue could not be chosen from it.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
      const body =
        url.pathname === '/api/v1/repos'
          ? {
              generated_at: '2026-10-06T09:00:00Z',
              total: 2,
              repositories: [
                { id: { host: 'jeryu', owner: 'initech', name: 'initech-web' }, family: 'initech-split' },
              ],
              facets: { hosts: ['jeryu'], owners: [], families: ['hooli-split'], languages: [] },
            }
          : FAMILIES;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    renderAt('/work');
    const select = screen.getByTestId('family-scope-select');
    await waitFor(() =>
      expect(
        Array.from(select.querySelectorAll('option')).map((option) => option.textContent)
      ).toEqual(['All', 'acme', 'globex', 'hooli', 'initech'])
    );
  });

  it('shows every family when nothing is in scope, and picking one scopes the page', async () => {
    mockApi();
    renderAt('/work');
    const select = screen.getByTestId('family-scope-select');
    expect(select).toHaveValue('');
    expect(screen.queryByTestId('family-scope-clear')).toBeNull();

    await waitFor(() => expect(screen.getByRole('option', { name: 'globex' })).toBeDefined());
    fireEvent.change(select, { target: { value: 'globex' } });
    expect(screen.getByTestId('where').textContent).toBe('/work?family=globex');
  });

  it('says a page is outside the scope, and switches to it in one click', async () => {
    mockApi();
    window.sessionStorage.setItem(FAMILY_SCOPE_STORAGE_SLOT, 'acme');
    renderAt('/work?family=globex');
    const select = screen.getByTestId('family-scope-select');
    // The chip keeps saying which family the tab carries everywhere else.
    expect(select).toHaveValue('acme');
    const switcher = screen.getByTestId('family-scope-switch');
    expect(switcher).toHaveTextContent('outside acme · switch to globex');

    fireEvent.click(switcher);
    await waitFor(() => expect(select).toHaveValue('globex'));
    expect(screen.queryByTestId('family-scope-switch')).toBeNull();
  });

  it('keeps the scope choosable when the families cannot be read', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":{"code":"x","message":"no"}}', { status: 500 })
    );
    renderAt('/work?family=initech');
    const select = screen.getByTestId('family-scope-select');
    expect(select).toHaveValue('initech');
    expect(screen.getByRole('option', { name: 'initech' })).toBeDefined();
  });
});
