// endpoints.contract.test.ts — pins the paths the client calls to the routes
// the server actually serves, so a rename on either side fails here rather
// than as a 404 in the deployed bundle.

import { describe, expect, it } from 'vitest';

import { endpoints } from '../endpoints';

/** Every builder called with placeholder arguments. */
function allPaths(): string[] {
  return Object.values(endpoints).map((build) =>
    (build as (...args: unknown[]) => string)('x', 'y', 'z'),
  );
}

describe('endpoint contract', () => {
  it('keeps every builder under a versioned /api/ prefix', () => {
    for (const path of allPaths()) {
      expect(path).toMatch(/^\/api\/v\d+\//);
    }
  });

  it('reads the pipeline event log from /api/v1/events', () => {
    expect(endpoints.events()).toBe('/api/v1/events');
    expect(endpoints.events({ repo: 'jeryu/jeryu-web', pr: 35 })).toBe(
      '/api/v1/events?repo=jeryu%2Fjeryu-web&pr=35',
    );
    expect(endpoints.attention()).toBe('/api/v1/attention');
    expect(endpoints.pins()).toBe('/api/v1/pins');
  });

  it('reads release boards from /api/v1/release-board', () => {
    expect(endpoints.releaseBoards()).toBe('/api/v1/release-board');
    expect(endpoints.releaseBoard('acme')).toBe('/api/v1/release-board/acme');
    expect(endpoints.releaseBoard('a/b c')).toBe('/api/v1/release-board/a%2Fb%20c');
  });

  it('never calls /api/v1/activity, which the server does not serve', () => {
    for (const path of allPaths()) {
      expect(path).not.toMatch(/^\/api\/v1\/activity(?:[/?]|$)/);
    }
  });
});
