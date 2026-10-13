// useAttentionAction.test.tsx — a confirmed attention act refreshes the pull
// rows it changed, not only the Needs-you feed.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useAttentionAction } from '../useAttentionAction';

vi.mock('../../api/client', () => ({
  ApiError: class ApiError extends Error {},
  apiDelete: vi.fn(),
  apiDeleteWithBody: vi.fn(),
  apiPatch: vi.fn(async () => ({ ok: true })),
  apiSend: vi.fn(async () => ({ ok: true })),
}));

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useAttentionAction', () => {
  it('refreshes the pipeline, the repo pull lists, and the Pull Room after a call', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useAttentionAction(), { wrapper: wrapperFor(client) });

    result.current.mutate({
      method: 'PATCH',
      path: '/api/v3/repos/acme/widgets/pulls/7',
      body: { state: 'closed' },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate.mock.calls.map(([filter]) => filter?.queryKey)).toEqual([
      ['pipeline'],
      ['repo-pulls'],
      ['control-plane', 'status'],
    ]);
  });
});
