import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { apiGet, apiSend, setCsrfToken } from '../../api/client';
import { AUTH_ME_QUERY_KEY, AuthProvider, useAuth } from '../useAuth';

vi.mock('../../api/client', () => ({
  apiGet: vi.fn(),
  apiSend: vi.fn(),
  setCsrfToken: vi.fn(),
}));

const account = { login: 'viewer', role: 'user' as const, mustChangePassword: false, csrfToken: 'csrf-viewer' };

function mountAuth(): ReturnType<typeof renderHook<ReturnType<typeof useAuth>, unknown>> & { client: QueryClient } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(['repos'], ['private-repository']);
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider></QueryClientProvider>
  );
  return { ...renderHook(() => useAuth(), { wrapper }), client };
}

describe('useAuth logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiGet).mockResolvedValue(account);
    vi.mocked(apiSend).mockResolvedValue({ ok: true });
  });

  it('keeps a settled signed-out account while removing private query and mutation data', async () => {
    const { result, client } = mountAuth();
    await waitFor(() => expect(result.current.user).toEqual(account));
    await act(async () => { await result.current.logout.mutateAsync(); });

    await waitFor(() => expect(result.current.user).toBeNull());
    expect(result.current.isPending).toBe(false);
    expect(client.getQueryData(AUTH_ME_QUERY_KEY)).toBeNull();
    expect(client.getQueryData(['repos'])).toBeUndefined();
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(setCsrfToken).toHaveBeenCalledWith(null);
  });

  it('keeps the account and private cache when the logout request fails', async () => {
    const failure = new Error('logout unavailable');
    vi.mocked(apiSend).mockRejectedValueOnce(failure);
    const { result, client } = mountAuth();
    await waitFor(() => expect(result.current.user).toEqual(account));
    await act(async () => { await expect(result.current.logout.mutateAsync()).rejects.toThrow(failure); });

    expect(result.current.user).toEqual(account);
    await waitFor(() => expect(result.current.logout.error).toBe(failure));
    expect(client.getQueryData(['repos'])).toEqual(['private-repository']);
  });
});
