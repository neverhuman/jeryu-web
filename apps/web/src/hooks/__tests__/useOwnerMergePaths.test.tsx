import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiGet } from '../../api/client';
import { useOwnerMergePaths } from '../useOwnerMergePaths';
import { invalidateAfterPrChange } from '../prInvalidation';

vi.mock('../../api/client', () => ({ apiGet: vi.fn() }));

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 3 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => vi.clearAllMocks());

describe('useOwnerMergePaths', () => {
  it('requests a fresh answer when a blocked pull changes head', async () => {
    const { wrapper, client } = harness();
    vi.mocked(apiGet).mockResolvedValueOnce({ head_sha: 'a' }).mockResolvedValueOnce({ head_sha: 'b' });
    const { result, rerender } = renderHook(
      ({ head }) => useOwnerMergePaths('r1', '32', head, true),
      { initialProps: { head: 'a' }, wrapper }
    );
    await waitFor(() => expect(result.current.data?.head_sha).toBe('a'));
    rerender({ head: 'b' });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.head_sha).toBe('b'));
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(['pull-owner-paths', 'r1', '32', 'a'])).toEqual({ head_sha: 'a' });
    client.clear();
  });

  it('does not retry an unavailable optional route', async () => {
    const { wrapper, client } = harness();
    vi.mocked(apiGet).mockRejectedValue(new Error('route unavailable'));
    const { result } = renderHook(() => useOwnerMergePaths('r1', '32', 'a', true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(apiGet).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it('invalidates every cached head after a pull mutation', () => {
    const { client } = harness();
    client.setQueryData(['pull-owner-paths', 'r1', '32', 'a'], { head_sha: 'a' });
    client.setQueryData(['pull-owner-paths', 'r1', '32', 'b'], { head_sha: 'b' });
    invalidateAfterPrChange(client, 'r1');
    expect(client.getQueryState(['pull-owner-paths', 'r1', '32', 'a'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['pull-owner-paths', 'r1', '32', 'b'])?.isInvalidated).toBe(true);
    client.clear();
  });
});
