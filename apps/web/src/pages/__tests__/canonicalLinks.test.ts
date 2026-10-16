// canonicalLinks.test.ts — the shape of a link that leaves the app.
//
// The server's `jeryu-api/src/links.rs` is the same policy; these cases are
// the ones its own unit tests pin, so the two cannot drift apart quietly.

import { describe, expect, it } from 'vitest';

import {
  canonicalPullPath,
  canonicalRepoPath,
  sharedLink,
  shareableUrl,
} from '../canonicalLinks';

const NATIVE = { host: 'jeryu', owner: 'acme', name: 'widget' };
const MIRRORED = { host: 'github', owner: 'acme', name: 'widget' };

describe('canonical links', () => {
  it('omits the provider for a repository this forge hosts', () => {
    expect(canonicalRepoPath(NATIVE)).toBe('/acme/widget');
    expect(canonicalPullPath(NATIVE, 7)).toBe('/acme/widget/pull/7');
    expect(canonicalPullPath(NATIVE, 7, 'conversation')).toBe('/acme/widget/pull/7');
    expect(canonicalPullPath(NATIVE, 7, 'files')).toBe('/acme/widget/pull/7/files');
  });

  it('keeps the provider for a repository mirrored from another host', () => {
    expect(canonicalRepoPath(MIRRORED)).toBe('/repos/github/acme/widget');
    expect(canonicalPullPath(MIRRORED, 7)).toBe('/repos/github/acme/widget/pulls/7');
  });

  it('encodes each segment it is given', () => {
    expect(canonicalRepoPath({ host: 'jeryu', owner: 'a/b', name: 'c d' })).toBe(
      '/a%2Fb/c%20d'
    );
  });

  it('makes a path absolute against the origin it is given', () => {
    expect(shareableUrl('/acme/widget', 'https://git.example')).toBe(
      'https://git.example/acme/widget'
    );
  });

  it('shares the link the forge returned, falling back to the built one', () => {
    expect(sharedLink('https://git.example/acme/widget/pull/7', '/ignored')).toBe(
      'https://git.example/acme/widget/pull/7'
    );
    expect(sharedLink('  ', '/acme/widget/pull/7')).toBe(
      `${window.location.origin}/acme/widget/pull/7`
    );
    expect(sharedLink(null, '/acme/widget/pull/7')).toBe(
      `${window.location.origin}/acme/widget/pull/7`
    );
  });
});
