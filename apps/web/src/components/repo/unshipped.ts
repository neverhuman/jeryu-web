// unshipped.ts — what the repositories table's "Unshipped" column says for a
// repository, from `GET /api/v1/deployments?environment=production`.
//
// Four states, kept distinct on purpose: a repository that does not ship to
// production is not the same as one that is up to date, and a count git could
// not produce is not zero.

import type { DeployedRepository } from '../../api/types/deployments';

export type UnshippedCell =
  | { kind: 'not_deployed' }
  | { kind: 'unknown'; deployed: DeployedRepository }
  | { kind: 'up_to_date'; deployed: DeployedRepository }
  | { kind: 'behind'; commits: number; deployed: DeployedRepository };

export function unshippedCell(deployed: DeployedRepository | undefined): UnshippedCell {
  if (!deployed) return { kind: 'not_deployed' };
  if (deployed.commits_behind === null) return { kind: 'unknown', deployed };
  if (deployed.commits_behind === 0) return { kind: 'up_to_date', deployed };
  return { kind: 'behind', commits: deployed.commits_behind, deployed };
}

/** Sort key: behind first by size, then up to date, unknown, not deployed. */
export function unshippedSortValue(cell: UnshippedCell): number {
  switch (cell.kind) {
    case 'behind':
      return cell.commits;
    case 'up_to_date':
      return 0;
    case 'unknown':
      return -1;
    case 'not_deployed':
      return -2;
  }
}

export function unshippedTitle(cell: UnshippedCell): string {
  switch (cell.kind) {
    case 'not_deployed':
      return 'Not deployed to production';
    case 'unknown':
      return `Production runs ${cell.deployed.sha.slice(0, 7)}; the forge could not count commits behind`;
    case 'up_to_date':
      return `Production runs ${cell.deployed.sha.slice(0, 7)}, the tip of ${cell.deployed.default_branch}`;
    case 'behind':
      return `${cell.commits} commit${cell.commits === 1 ? '' : 's'} on ${cell.deployed.default_branch} not in production (${cell.deployed.sha.slice(0, 7)})`;
  }
}
