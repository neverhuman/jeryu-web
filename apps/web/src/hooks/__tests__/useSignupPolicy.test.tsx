// useSignupPolicy.test.tsx — sign-up is closed unless the forge opens it.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { json } from '../../pages/__tests__/shiftPageHelpers';
import { externalWaitlist, useSignupPolicy } from '../useSignupPolicy';

function answer(response: () => Response): string[] {
  const paths: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    paths.push(new URL(input instanceof Request ? input.url : String(input), 'http://forge.test').pathname);
    return response();
  });
  return paths;
}

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => vi.restoreAllMocks());

describe('useSignupPolicy', () => {
  it('reads an open (email) policy and its external waitlist', async () => {
    const paths = answer(() =>
      json({ mode: 'email', waitlistUrl: 'https://waitlist.example.com/join?from=forge' })
    );
    const { result } = renderHook(() => useSignupPolicy(), { wrapper });
    expect(result.current).toEqual({ state: 'loading' });
    await waitFor(() =>
      expect(result.current).toEqual({
        state: 'known',
        mode: 'email',
        waitlist: {
          href: 'https://waitlist.example.com/join?from=forge',
          host: 'waitlist.example.com',
        },
      })
    );
    expect(paths).toEqual(['/api/v1/auth/signup/policy']);
  });

  it('reads a closed policy with the forge\'s own waitlist', async () => {
    answer(() => json({ mode: 'closed', waitlistUrl: null }));
    const { result } = renderHook(() => useSignupPolicy(), { wrapper });
    await waitFor(() =>
      expect(result.current).toEqual({ state: 'known', mode: 'closed', waitlist: null })
    );
  });

  it('treats an older forge (404) as closed, with no external waitlist', async () => {
    answer(() => json({ error: { code: 'not_found', message: 'no route' } }, 404));
    const { result } = renderHook(() => useSignupPolicy(), { wrapper });
    await waitFor(() =>
      expect(result.current).toEqual({ state: 'known', mode: 'closed', waitlist: null })
    );
  });

  it('treats a mode it does not know as closed', async () => {
    answer(() => json({ mode: 'everyone', waitlistUrl: null }));
    const { result } = renderHook(() => useSignupPolicy(), { wrapper });
    await waitFor(() =>
      expect(result.current).toEqual({ state: 'known', mode: 'closed', waitlist: null })
    );
  });
});

describe('externalWaitlist', () => {
  it.each([
    ['https://waitlist.example.com', 'waitlist.example.com'],
    ['http://waitlist.example.com:8080/x#y', 'waitlist.example.com:8080'],
  ])('names the host of %s', (raw, host) => {
    expect(externalWaitlist(raw)).toEqual({ href: raw, host });
  });

  it.each([null, undefined, '', 'ftp://waitlist.example.com', '/waitlist', 'https://'])(
    'keeps the forge\'s own form for %s',
    (raw) => {
      expect(externalWaitlist(raw)).toBeNull();
    }
  );
});
