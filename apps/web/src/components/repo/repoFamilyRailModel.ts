// repoFamilyRailModel.ts — the order of a family's member repositories, as the
// family page lists them, without React.

import type { RepositorySummary } from '../../api/types';

import { portalRank } from './familyRollup';

/**
 * The family's members in order: the repository the family publishes
 * from leads (the forge says which, `repo_role`), then the rest by name.
 */
export function sortFamilyMembers(
  repos: readonly RepositorySummary[]
): RepositorySummary[] {
  return [...repos].sort(
    (a, b) => portalRank(a) - portalRank(b) || a.id.name.localeCompare(b.id.name)
  );
}
