import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiDelete, apiGet, apiSend } from '../api/client';
import { AccessTokensPanel } from './AccessTokensPanel';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  apiGet: vi.fn(),
  apiSend: vi.fn(),
  apiDelete: vi.fn(),
}));

/** Not a real credential: a marker the test looks for. */
const CANARY = ['token', 'test', 'canary'].join('-');

const LISTED = {
  id: 'tok_1',
  name: 'laptop CLI',
  createdAt: '2026-10-08T00:00:00Z',
  expiresAt: '2027-01-06T00:00:00Z',
};

function mount(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AccessTokensPanel />
    </QueryClientProvider>
  );
  return client;
}

describe('AccessTokensPanel', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiSend).mockReset();
    vi.mocked(apiDelete).mockReset();
  });

  it('shows a new token once, keeps it out of the query client, and forgets it on Done', async () => {
    vi.mocked(apiGet).mockResolvedValue([]);
    vi.mocked(apiSend).mockResolvedValue({
      id: 'tok_1',
      token: CANARY,
      name: 'laptop CLI',
      expiresAt: LISTED.expiresAt,
    });
    const client = mount();
    expect(await screen.findByTestId('access-tokens-empty')).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Create an access token' });
    const create = within(form).getByRole('button', { name: 'Create token' });
    expect(create).toBeDisabled();
    fireEvent.change(within(form).getByLabelText('Token name'), {
      target: { value: ' laptop CLI ' },
    });
    fireEvent.change(within(form).getByLabelText('Expires after'), { target: { value: '30' } });
    const before = Date.now();
    fireEvent.click(create);
    await waitFor(() => expect(apiSend).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(apiSend).mock.calls[0] as [string, { name: string; expiresAt: string }];
    expect(path).toBe('/api/v1/auth/tokens');
    expect(body.name).toBe('laptop CLI');
    const lifetime = Date.parse(body.expiresAt) - before;
    expect(lifetime).toBeGreaterThan(29 * 24 * 3600 * 1000);
    expect(lifetime).toBeLessThanOrEqual(30 * 24 * 3600 * 1000 + 60_000);

    const shown = await screen.findByTestId('access-token-created');
    expect(within(shown).getByRole('textbox')).toHaveValue(CANARY);
    await waitFor(() => {
      const kept = JSON.stringify([
        client.getMutationCache().getAll().map((mutation) => mutation.state),
        client.getQueryCache().getAll().map((query) => query.state.data),
      ]);
      expect(kept).not.toContain(CANARY);
    });
    fireEvent.click(within(shown).getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('access-token-created')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(CANARY);
  });

  it('shows why a create failed', async () => {
    vi.mocked(apiGet).mockResolvedValue([]);
    vi.mocked(apiSend).mockRejectedValue(new Error('token name is taken'));
    mount();
    const form = await screen.findByRole('form', { name: 'Create an access token' });
    fireEvent.change(within(form).getByLabelText('Token name'), { target: { value: 'ci' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create token' }));
    expect(await screen.findByText('Could not create the token')).toBeInTheDocument();
    expect(screen.queryByTestId('access-token-created')).not.toBeInTheDocument();
  });

  it('revokes only after a confirmation', async () => {
    vi.mocked(apiGet).mockResolvedValueOnce([LISTED]).mockResolvedValue([]);
    vi.mocked(apiDelete).mockResolvedValue(undefined);
    mount();
    const table = await screen.findByTestId('access-tokens-table');
    fireEvent.click(within(table).getByRole('button', { name: 'Revoke laptop CLI' }));
    expect(apiDelete).not.toHaveBeenCalled();
    fireEvent.click(within(table).getByRole('button', { name: 'Confirm revoke' }));
    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith('/api/v1/auth/tokens/tok_1'));
    expect(await screen.findByTestId('access-tokens-empty')).toBeInTheDocument();
  });
});
