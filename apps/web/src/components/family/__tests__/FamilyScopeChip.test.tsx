// FamilyScopeChip.test.tsx — the scope chip in the shell header.
//
// Invented families only (acme, globex, initech): this repository is public.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FamilyScopeChip } from '../FamilyScopeChip';
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
      ).toEqual(['All families', 'acme', 'globex'])
    );

    fireEvent.click(screen.getByTestId('family-scope-clear'));
    expect(screen.getByTestId('where').textContent).toBe('/work');
    expect(screen.queryByTestId('family-scope-clear')).toBeNull();
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
