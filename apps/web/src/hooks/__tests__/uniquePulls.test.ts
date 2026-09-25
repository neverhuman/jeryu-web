import { describe, expect, it } from 'vitest';

import type { PullRequestSummary } from '../../api/types';
import { uniquePulls } from '../useRepoPullLists';

function pull(owner: string, name: string, number: number, title: string): PullRequestSummary {
  return { number, title, repo: { host: 'jeryu', owner, name } } as PullRequestSummary;
}

describe('uniquePulls', () => {
  it('lists a pull request answered by two repo lists once', () => {
    const title = 'Quality gate API: jankurai overview, rule and score detail, disputes';
    const rows = uniquePulls([
      pull('jeryu', 'jeryu-web', 7, title),
      pull('jeryu', 'jeryu-deploy', 7, title),
      pull('jeryu', 'jeryu-web', 7, title),
      pull('Jeryu', 'jeryu-web', 7, title),
    ]);
    expect(rows.map((pr) => `${pr.repo.name}#${pr.number}`)).toEqual([
      'jeryu-web#7',
      'jeryu-deploy#7',
    ]);
  });
});
