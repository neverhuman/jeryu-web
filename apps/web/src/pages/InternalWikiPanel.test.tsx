import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { apiPut } from '../api/client';
import { InternalWikiPanel } from './InternalWikiPanel';

const saved = {
  internal_wiki: {
    id: 'repo-1',
    host: 'jeryu',
    owner: 'acme',
    name: 'handbook',
    full_name: 'acme/handbook',
    default_branch: 'main',
    private: true,
  },
  internal_wiki_missing: false,
  updated_by: 'ada',
  updated_at: '2026-10-01T00:00:00Z',
};

vi.mock('../api/client', () => ({
  apiGet: vi.fn(async (url: string) =>
    url.startsWith('/api/v1/admin/site-settings')
      ? { internal_wiki: null, internal_wiki_missing: false, updated_by: null, updated_at: null }
      : {
          repositories: [
            { id: { host: 'jeryu', owner: 'acme', name: 'handbook', id: 'repo-1' }, visibility: 'private' },
            { id: { host: 'jeryu', owner: 'acme', name: 'api', id: 'repo-2' }, visibility: 'public' },
          ],
        }
  ),
  apiPut: vi.fn(async () => saved),
}));

describe('InternalWikiPanel', () => {
  it('lists repositories and saves the chosen one as the wiki', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <InternalWikiPanel />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const select = await screen.findByTestId('internal-wiki-select');
    expect(
      Array.from(select.querySelectorAll('option')).map((option) => option.textContent)
    ).toEqual(['No wiki', 'acme/api (public)', 'acme/handbook (private)']);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    fireEvent.change(select, { target: { value: 'acme/handbook' } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith('/api/v1/admin/site-settings', {
        internal_wiki: 'acme/handbook',
      })
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the wiki' })).toHaveAttribute('href', '/wiki');
    expect(screen.getByText(/Set by ada/)).toBeInTheDocument();
  });
});
