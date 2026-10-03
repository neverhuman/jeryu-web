// pullTabsModel.test.ts — the four tabs of a pull request: which URL is which,
// where each tab points, and what it counts.

import { describe, expect, it } from 'vitest';

import {
  activePullTab,
  parsePullTail,
  PULL_TABS,
  pullBasePath,
  pullFileHref,
  pullTabCount,
  pullTabHref,
} from '../pullTabsModel';

const BASE = '/repos/acme/acme/widget-api/pulls/32';

describe('parsePullTail', () => {
  it('reads the number, and the Conversation when no tab is named', () => {
    expect(parsePullTail('32')).toEqual({ prNumber: '32', tab: 'conversation' });
    expect(parsePullTail('32/')).toEqual({ prNumber: '32', tab: 'conversation' });
  });

  it('reads each tab of a pull request', () => {
    expect(parsePullTail('32/files').tab).toBe('files');
    expect(parsePullTail('32/checks').tab).toBe('checks');
    expect(parsePullTail('32/commits').tab).toBe('commits');
  });

  it('falls back to the Conversation for a tab it does not know', () => {
    expect(parsePullTail('32/elsewhere').tab).toBe('conversation');
    expect(activePullTab(null)).toBe('conversation');
  });

  it('answers no number for the pull request list', () => {
    expect(parsePullTail('').prNumber).toBeNull();
  });
});

describe('the tab bar', () => {
  it('points each tab at its own URL under the pull request', () => {
    expect(pullBasePath('acme', 'acme/widget-api', '32')).toBe(BASE);
    expect(PULL_TABS.map((tab) => pullTabHref(BASE, tab))).toEqual([
      BASE,
      `${BASE}/files`,
      `${BASE}/checks`,
      `${BASE}/commits`,
    ]);
  });

  it('counts the files, the failing checks and the commits, and nothing else', () => {
    const counts = { files: 3, failingChecks: 1, commits: 5 };
    expect(pullTabCount('files', counts)).toBe(3);
    expect(pullTabCount('checks', counts)).toBe(1);
    expect(pullTabCount('commits', counts)).toBe(5);
    expect(pullTabCount('conversation', counts)).toBeNull();
    // Nothing to count is no badge at all, not a zero.
    expect(pullTabCount('checks', { failingChecks: 0 })).toBeNull();
    expect(pullTabCount('files', {})).toBeNull();
  });
});

describe('pullFileHref', () => {
  it('opens one file of the diff on the Files tab, at its line', () => {
    expect(pullFileHref(BASE, 'src/login.rs', 42)).toBe(
      `${BASE}/files?path=src%2Flogin.rs#L42`
    );
    expect(pullFileHref(BASE, 'src/login.rs')).toBe(
      `${BASE}/files?path=src%2Flogin.rs`
    );
  });
});
