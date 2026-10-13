import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiDelete, apiGet, apiSend } from '../api/client';
import { AgentProvidersPanel } from './AgentProvidersPanel';

vi.mock('../api/client', () => ({
  apiGet: vi.fn(),
  apiSend: vi.fn(),
  apiDelete: vi.fn(),
}));

/** Not a real credential: a marker the test can look for on the page. */
const CANARY = ['provider', 'test', 'canary'].join('-');

const CONNECTED = {
  id: 'pc_1',
  owner_id: 'user/alice',
  provider: 'grok',
  provider_account: 'team-key',
  credential_kind: 'api_key',
  state: 'connected',
  connection_generation: 1,
  secret_version: 0,
  created_at: '2026-10-08T00:00:00Z',
  updated_at: '2026-10-08T00:00:00Z',
  refreshed_at: null,
};

function mount(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AgentProvidersPanel />
    </QueryClientProvider>
  );
  return client;
}

describe('AgentProvidersPanel', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiSend).mockReset();
    vi.mocked(apiDelete).mockReset();
  });

  it('connects once, sends the secret only in the request, and clears the field', async () => {
    vi.mocked(apiGet).mockResolvedValue({ connections: [] });
    vi.mocked(apiSend).mockResolvedValue({ ...CONNECTED, provider: 'claude' });
    const client = mount();
    expect(await screen.findByTestId('agent-providers-empty')).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Connect a provider' });
    const connect = within(form).getByRole('button', { name: 'Connect' });
    expect(connect).toBeDisabled();
    fireEvent.change(within(form).getByLabelText('Account label'), {
      target: { value: ' team-key ' },
    });
    const secret = within(form).getByLabelText('Secret');
    expect(secret).toHaveAttribute('type', 'password');
    fireEvent.change(secret, { target: { value: CANARY } });
    fireEvent.click(connect);
    await waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith('/api/v1/me/provider-connections', {
        provider: 'claude',
        provider_account: 'team-key',
        credential_kind: 'api_key',
        secret: CANARY,
      })
    );
    await screen.findByText('Connected Claude');
    expect(secret).toHaveValue('');
    // Nothing the query client keeps holds the secret: not the mutation's
    // variables, not its result, not the cached list.
    const kept = JSON.stringify([
      client.getMutationCache().getAll().map((mutation) => mutation.state),
      client.getQueryCache().getAll().map((query) => query.state.data),
    ]);
    expect(kept).not.toContain(CANARY);
  });

  it('lists live connections and disconnects only after a confirmation', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      connections: [CONNECTED, { ...CONNECTED, id: 'pc_2', state: 'disconnected' }],
    });
    vi.mocked(apiDelete).mockResolvedValue(undefined);
    mount();
    const table = await screen.findByTestId('agent-providers-table');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(table).not.toHaveTextContent(CANARY);
    fireEvent.click(within(table).getByRole('button', { name: 'Disconnect Grok team-key' }));
    expect(apiDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('stops every running session');
    fireEvent.click(within(table).getByRole('button', { name: 'Confirm disconnect' }));
    await waitFor(() =>
      expect(apiDelete).toHaveBeenCalledWith('/api/v1/me/provider-connections/pc_1')
    );
  });
});

describe('AgentProvidersPanel connection state', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
  });

  it('asks for a new sign-in when a connection is auth_required', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      connections: [
        CONNECTED,
        { ...CONNECTED, id: 'pc_2', provider: 'claude', provider_account: 'max', state: 'auth_required' },
      ],
    });
    mount();
    const table = await screen.findByTestId('agent-providers-table');
    expect(within(table).getByText('Connected')).toBeInTheDocument();
    const signIn = within(table).getByText('Sign in again');
    expect(signIn).toHaveAttribute(
      'title',
      'A refresh could not confirm the credential, so it is no longer used. Connect it again.'
    );
  });
});
