import { describe, expect, it } from 'vitest';

import { serverOffsetMs } from '../useServerNow';
import { repoScope } from '../useRunnerChangeNudge';

describe('serverOffsetMs', () => {
  it('is how far the forge clock is ahead of the one that received the answer', () => {
    const received = Date.parse('2026-10-06T12:00:00Z');
    expect(serverOffsetMs('2026-10-06T12:00:05Z', received)).toBe(5000);
    expect(serverOffsetMs('2026-10-06T11:59:58Z', received)).toBe(-2000);
  });

  it('is zero without a usable server time or receive time', () => {
    expect(serverOffsetMs(undefined, 1)).toBe(0);
    expect(serverOffsetMs('not a time', 1)).toBe(0);
    expect(serverOffsetMs('2026-10-06T12:00:00Z', 0)).toBe(0);
  });
});

describe('repoScope', () => {
  it('names the repository scope the forge pushes runner changes on', () => {
    expect(repoScope('acme/api')).toBe('repo.acme.api');
    expect(repoScope('acme')).toBeNull();
    expect(repoScope('acme/api/extra')).toBeNull();
  });
});
