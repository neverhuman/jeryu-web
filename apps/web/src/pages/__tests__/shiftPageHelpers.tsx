// shiftPageHelpers.tsx — fetch router + render helper for Shift page tests.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

import { ATTENTION } from './pipelineTestData';
import { FAMILIES, HISTORY, SHIFTS, TODOS, WORKERS } from './shiftTestData';

export interface Recorded {
  method: string;
  pathname: string;
  search: string;
  body: unknown;
  /** The request's own headers, so a test can prove the `Idempotency-Key`. */
  headers: Record<string, string>;
}

/** `init.headers` as a plain object, whatever shape the caller built it in. */
export function recordHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(headers ?? {}).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export type Override = (req: Recorded) => Response | undefined;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function errorResponse(status: number, message: string): Response {
  return json({ error: { code: 'x', message } }, status);
}

/** Spy on fetch, serve contract fixtures, and record every request. */
export function mockShiftApi(override?: Override): Recorded[] {
  const calls: Recorded[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, 'http://localhost');
    const req: Recorded = {
      method: init?.method ?? 'GET',
      pathname: url.pathname,
      search: url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: recordHeaders(init?.headers),
    };
    calls.push(req);
    const custom = override?.(req);
    if (custom) return custom;
    switch (url.pathname) {
      case '/api/v1/shift/families':
        return json(FAMILIES);
      case '/api/v1/shift/todos':
        return json({ generated_at: '2026-09-19T09:00:00Z', todos: TODOS });
      case '/api/v1/shift/shifts':
        return json(SHIFTS);
      case '/api/v1/shift/workers':
        return json(WORKERS);
      case '/api/v1/shift/workers/history':
        return json(HISTORY);
      // The Work page reads the Needs you list for its red chip.
      case '/api/v1/attention':
        return json(ATTENTION);
      default:
        return errorResponse(404, `unmocked ${url.pathname}`);
    }
  });
  return calls;
}

export function renderAt(path: string, route: string, element: ReactElement): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
