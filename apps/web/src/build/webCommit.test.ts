// webCommit.test.ts — the build commit the page reports: from the variable,
// else git, else null; never a value that is not a sha.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { normalizeCommit, pageWebCommit, resolveWebCommit } from './webCommit';

const SHA = '0123456789abcdef0123456789abcdef01234567';

describe('resolveWebCommit', () => {
  it('prefers JERYU_WEB_COMMIT over git', () => {
    const git = vi.fn(() => 'ffffffffffffffffffffffffffffffffffffffff\n');
    expect(resolveWebCommit(` ${SHA.toUpperCase()} `, git)).toBe(SHA);
    expect(git).not.toHaveBeenCalled();
  });

  it('reads git HEAD when the variable is unset or blank', () => {
    expect(resolveWebCommit(undefined, () => `${SHA}\n`)).toBe(SHA);
    expect(resolveWebCommit('', () => SHA)).toBe(SHA);
  });

  it('is null without git, or when the value is not a sha', () => {
    expect(
      resolveWebCommit(undefined, () => {
        throw new Error('git: not found');
      })
    ).toBeNull();
    expect(resolveWebCommit('main', () => SHA)).toBeNull();
    expect(normalizeCommit('abc')).toBeNull();
    expect(normalizeCommit(null)).toBeNull();
  });
});

describe('pageWebCommit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is null where no build defined the commit', () => {
    expect(pageWebCommit()).toBeNull();
  });

  it('reads the defined commit', () => {
    vi.stubGlobal('__JERYU_WEB_COMMIT__', SHA);
    expect(pageWebCommit()).toBe(SHA);
  });
});
