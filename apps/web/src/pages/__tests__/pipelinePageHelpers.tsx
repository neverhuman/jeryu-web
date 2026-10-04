// pipelinePageHelpers.tsx — fetch router for pages on the pipeline
// visibility contract. Anything unmocked answers 404, like an older server.

import { vi } from 'vitest';

import { errorResponse, json, recordHeaders, type Override, type Recorded } from './shiftPageHelpers';
import { ATTENTION, EVENTS, PINS } from './pipelineTestData';

/** The SPA shell an older server returns for an unknown `/api/v1/*` path. */
export function htmlShell(): Response {
  return new Response('<!doctype html><html><body><div id="root"></div></body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
}

export function mockPipelineApi(override?: Override): Recorded[] {
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
    if (url.pathname === '/api/v1/attention') return json(ATTENTION);
    if (url.pathname === '/api/v1/pins') return json(PINS);
    if (url.pathname === '/api/v1/events') {
      return json({ events: EVENTS, latest_seq: EVENTS[0]?.seq ?? 0 });
    }
    return errorResponse(404, `unmocked ${url.pathname}`);
  });
  return calls;
}
