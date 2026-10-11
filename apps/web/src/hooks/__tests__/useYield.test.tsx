// useYield.test.tsx — what stays on screen while the next read loads: a new
// window or cut keeps the last answer (flagged as placeholder data), a new
// family never shows another family's numbers.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { YieldQuery } from '../../api/types';
import { REPORT } from '../../pages/__tests__/yieldTestData';
import { useYield } from '../useYield';

afterEach(() => vi.restoreAllMocks());

/** Answer the first read; leave every later one in flight. */
function mockFirstReadOnly(): void {
  let answered = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (answered) return new Promise<Response>(() => {});
    answered = true;
    return new Response(JSON.stringify(REPORT), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const BASE: YieldQuery = { family: 'acme', since: '2026-09-11', until: '2026-10-09', by: 'model' };

describe('useYield', () => {
  it('keeps the last answer up, flagged, while a new window loads', async () => {
    mockFirstReadOnly();
    const { result, rerender } = renderHook((query: YieldQuery) => useYield(query), {
      wrapper,
      initialProps: BASE,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ ...BASE, since: '2026-10-02' });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data).toEqual(REPORT);
  });

  it('does not show another family\'s numbers while a new family loads', async () => {
    mockFirstReadOnly();
    const { result, rerender } = renderHook((query: YieldQuery) => useYield(query), {
      wrapper,
      initialProps: BASE,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ ...BASE, family: 'globex' });
    expect(result.current.isPlaceholderData).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(true);
  });
});
