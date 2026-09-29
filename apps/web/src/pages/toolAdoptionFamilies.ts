// toolAdoptionFamilies.ts — group a tool's repos by the family that owns them.
//
// A tool's adoption lists name repos as `owner/name`; the shift queue names the
// same repo by its bare name inside a family. This module bridges the two so
// the tool page can show "Should adopt" a family at a time and file one todo
// per repo into that family's queue. No React, no I/O — fully unit-testable.

import type { ShiftFamily } from '../api/types';

/** Group for repos no shift queue claims: nothing can be filed for them. */
export const UNCLAIMED_FAMILY = 'other';

export interface AdoptionFamilyGroup {
  /** Shift family that owns the repos, or `other` when no queue claims them. */
  family: string;
  /** Members as `owner/name`, alphabetical. */
  repos: string[];
  /** Names the family's queue uses, aligned with `repos`. */
  queueNames: string[];
}

interface Member {
  family: string;
  queueName: string;
}

/**
 * Index every family's repos twice: by `owner/name` for an exact match, and by
 * bare name for the servers that report no owner. The full name wins; the bare
 * name only answers what the full one cannot.
 */
function indexFamilies(families: readonly ShiftFamily[]): {
  byFullName: Map<string, Member>;
  byName: Map<string, Member>;
} {
  const byFullName = new Map<string, Member>();
  const byName = new Map<string, Member>();
  for (const family of families) {
    for (const repo of family.repos) {
      const member = { family: family.name, queueName: repo.name };
      if (repo.owner) byFullName.set(`${repo.owner}/${repo.name}`, member);
      if (!byName.has(repo.name)) byName.set(repo.name, member);
    }
  }
  return { byFullName, byName };
}

function memberOf(
  fullName: string,
  index: ReturnType<typeof indexFamilies>
): Member | undefined {
  return index.byFullName.get(fullName) ?? index.byName.get(fullName.split('/').pop() ?? '');
}

/**
 * One group per family that owns at least one of `repos`, alphabetical, with
 * the unclaimed repos last. Repos stay in the order the caller gave them
 * within a group, sorted by full name.
 */
export function groupReposByFamily(
  repos: readonly string[],
  families: readonly ShiftFamily[]
): AdoptionFamilyGroup[] {
  const index = indexFamilies(families);
  const groups = new Map<string, { repos: string[]; queueNames: string[] }>();
  for (const fullName of [...repos].sort((a, b) => a.localeCompare(b))) {
    const member = memberOf(fullName, index);
    const family = member?.family ?? UNCLAIMED_FAMILY;
    const group = groups.get(family) ?? { repos: [], queueNames: [] };
    group.repos.push(fullName);
    group.queueNames.push(member?.queueName ?? fullName.split('/').pop() ?? fullName);
    groups.set(family, group);
  }
  return Array.from(groups, ([family, group]) => ({ family, ...group })).sort((a, b) => {
    if (a.family === UNCLAIMED_FAMILY) return 1;
    if (b.family === UNCLAIMED_FAMILY) return -1;
    return a.family.localeCompare(b.family);
  });
}

/** The todo a "file one per repo" click files for one repo of one tool. */
export function adoptionTodoText(tool: string, repo: string): string {
  return [
    `Adopt ${tool} in ${repo}`,
    '',
    `Shared tools → Adoption lists ${repo} as a repo that should adopt ${tool} and does not.`,
    `Wire ${tool} into ${repo} the way the repos already adopting it do, and land it with the repo's gate green.`,
  ].join('\n');
}
