import { describe, expect, it } from 'vitest';

import type { DeployedRepository } from '../../../api/types/deployments';
import { unshippedCell, unshippedSortValue, unshippedTitle } from '../unshipped';

function deployed(commitsBehind: number | null): DeployedRepository {
  return {
    repo: 'jeryu/jeryu-deploy',
    default_branch: 'main',
    sha: 'ad96ff4fd2288bf3a37c2c5e8aa18584dcdc10a8',
    release: 'prod-20260918T054528Z-ad96ff4-unsigned',
    deployed_at: '2026-09-18T05:50:00Z',
    deployed_by: 'alton2',
    commits_behind: commitsBehind,
  };
}

describe('unshipped column', () => {
  it('keeps not deployed, unknown, up to date and behind distinct', () => {
    expect(unshippedCell(undefined).kind).toBe('not_deployed');
    expect(unshippedCell(deployed(null)).kind).toBe('unknown');
    expect(unshippedCell(deployed(0)).kind).toBe('up_to_date');
    expect(unshippedCell(deployed(5))).toMatchObject({ kind: 'behind', commits: 5 });
  });

  it('sorts behind by size above up to date, unknown and not deployed', () => {
    const order = [undefined, deployed(null), deployed(0), deployed(1), deployed(9)]
      .map((d) => unshippedSortValue(unshippedCell(d)));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
  });

  it('explains each state with the deployed commit', () => {
    expect(unshippedTitle(unshippedCell(undefined))).toBe('Not deployed to production');
    expect(unshippedTitle(unshippedCell(deployed(1)))).toBe(
      '1 commit on main not in production (ad96ff4)'
    );
    expect(unshippedTitle(unshippedCell(deployed(0)))).toContain('the tip of main');
    expect(unshippedTitle(unshippedCell(deployed(null)))).toContain('could not count');
  });
});
