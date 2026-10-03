import { describe, expect, it } from 'vitest';

import {
  REPO_TABS,
  activeRepoTab,
  canSeeRepoSettings,
  repoTabCount,
  repoTabHref,
  rovingIndex,
  visibleRepoTabs,
} from '../repoShellModel';

describe('repoShellModel', () => {
  it('orders the tabs the way the repository is worked', () => {
    expect(REPO_TABS.map((tab) => tab.key)).toEqual([
      'code',
      'pulls',
      'automation',
      'agents',
      'activity',
      'settings',
    ]);
  });

  it('gives Code the front page and every route that reads the tree', () => {
    for (const sub of [null, 'blob', 'tree', 'commit', 'code', 'something-else']) {
      expect(activeRepoTab(sub)).toBe('code');
    }
  });

  it('names the tab each sub-path is on', () => {
    expect(activeRepoTab('pulls')).toBe('pulls');
    expect(activeRepoTab('automation')).toBe('automation');
    expect(activeRepoTab('agents')).toBe('agents');
    expect(activeRepoTab('activity')).toBe('activity');
    expect(activeRepoTab('settings')).toBe('settings');
  });

  it('points each tab at the repository it is shown for', () => {
    const base = '/repos/acme/acme/widget-api';
    expect(REPO_TABS.map((tab) => repoTabHref(base, tab))).toEqual([
      base,
      `${base}/pulls`,
      `${base}/automation`,
      `${base}/agents`,
      `${base}/activity`,
      `${base}/settings`,
    ]);
  });

  it('shows Settings to an administrator or a writer, and to nobody else', () => {
    expect(canSeeRepoSettings('admin', [])).toBe(true);
    expect(canSeeRepoSettings('user', ['repo.admin'])).toBe(true);
    expect(canSeeRepoSettings('user', ['code.write'])).toBe(true);
    expect(canSeeRepoSettings('user', ['repo.read', 'pr.read'])).toBe(false);
    expect(canSeeRepoSettings(null)).toBe(false);
  });

  it('leaves Settings out of the bar a reader sees', () => {
    expect(visibleRepoTabs(false).map((tab) => tab.key)).toEqual([
      'code',
      'pulls',
      'automation',
      'agents',
      'activity',
    ]);
    expect(visibleRepoTabs(true)).toHaveLength(REPO_TABS.length);
  });

  it('counts only the tabs that carry a count, and only above zero', () => {
    const counts = { openPullRequests: 4, activeAgents: 0 };
    expect(repoTabCount('pulls', counts)).toBe(4);
    expect(repoTabCount('agents', counts)).toBeNull();
    expect(repoTabCount('agents', { activeAgents: 2 })).toBe(2);
    expect(repoTabCount('code', counts)).toBeNull();
    expect(repoTabCount('pulls', { openPullRequests: null })).toBeNull();
  });

  it('wraps arrow keys inside the bar and jumps to its ends', () => {
    expect(rovingIndex(0, 6, 'ArrowRight')).toBe(1);
    expect(rovingIndex(5, 6, 'ArrowRight')).toBe(0);
    expect(rovingIndex(0, 6, 'ArrowLeft')).toBe(5);
    expect(rovingIndex(3, 6, 'Home')).toBe(0);
    expect(rovingIndex(3, 6, 'End')).toBe(5);
    expect(rovingIndex(3, 6, 'Enter')).toBeNull();
    expect(rovingIndex(0, 0, 'ArrowRight')).toBeNull();
  });
});
