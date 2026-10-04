// qualityGateHelpers.tsx — fetch router for the Quality gate page tests.
// Anything unmocked answers 404, exactly like a server without the contract.

import { vi } from 'vitest';

import { errorResponse, json, recordHeaders, type Override, type Recorded } from './shiftPageHelpers';
import { HEAD, OVERVIEW, RULE } from './qualityGateTestData';

export function mockQualityGateApi(override?: Override): Recorded[] {
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
    if (url.pathname === '/api/v1/quality-gate/overview') return json(OVERVIEW);
    if (url.pathname.startsWith('/api/v1/quality-gate/rules/')) return json(RULE);
    if (url.pathname.startsWith('/api/v1/quality-gate/heads/')) return json(HEAD);
    return errorResponse(404, `unmocked ${url.pathname}`);
  });
  return calls;
}
