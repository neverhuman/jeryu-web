// repoFamilyScope.ts — the family scope on pages whose rows name repositories.
//
// Runners, Quality gate, Dependencies, Shared tools and Search all answer with
// rows that name a repository (`owner/name`, sometimes just `name`) and nothing
// about families. None of their endpoints takes a `family` yet, so the scope is
// applied here, from the repository list the shell already polls
// (`useRepositories` → `family` on each row): the one repo→family map, and one
// rule for what a scoped page keeps.
//
// The rule: a row whose repository belongs to another family is held back and
// counted, so the page can say "+N in other families" rather than pretend the
// rest of the fleet does not exist. A row whose repository the map does not
// know — a repository the list has not answered for yet, or one no family
// claims — is kept: the page would otherwise go blank while the list loads, and
// claiming such a row is "not this family" is a guess.
//
// Pure part first, so the rule is unit-tested without a router or a server.

import { canonicalFamily } from './familyScope';

/** `owner/name` and bare `name` → canonical family, both spellings indexed. */
export interface RepoFamilyIndex {
  byFullName: ReadonlyMap<string, string>;
  byName: ReadonlyMap<string, string>;
}

export const EMPTY_REPO_FAMILY_INDEX: RepoFamilyIndex = {
  byFullName: new Map(),
  byName: new Map(),
};

export interface RepoFamilyRow {
  id?: { owner: string; name: string } | undefined;
  family?: string | null | undefined;
}

/**
 * The index, from the repository list. The full name is authoritative; the bare
 * name only answers what the full one cannot, and the first family to claim a
 * bare name keeps it (two families owning `web` is ambiguous, not a reason to
 * pick the later one).
 */
export function repoFamilyIndex(repositories: readonly RepoFamilyRow[]): RepoFamilyIndex {
  const byFullName = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const repo of repositories) {
    const family = canonicalFamily(repo.family);
    if (!family || !repo.id) continue;
    byFullName.set(`${repo.id.owner}/${repo.id.name}`, family);
    if (!byName.has(repo.id.name)) byName.set(repo.id.name, family);
  }
  return { byFullName, byName };
}

/** The family that owns `repo`, or null when the index cannot say. */
export function familyOfRepo(
  repo: string | null | undefined,
  index: RepoFamilyIndex
): string | null {
  const name = (repo ?? '').trim();
  if (!name) return null;
  return index.byFullName.get(name) ?? index.byName.get(name.split('/').pop() ?? '') ?? null;
}

/**
 * Whether a row naming `repo` stays on a page scoped to `family`: its own
 * family, or a repository the index cannot place. '' (every family) keeps all.
 */
export function repoInScope(
  repo: string | null | undefined,
  family: string,
  index: RepoFamilyIndex
): boolean {
  if (!family) return true;
  const owner = familyOfRepo(repo, index);
  return owner === null || owner === canonicalFamily(family);
}

/** What a scoped page shows, and how much of the fleet it is not showing. */
export interface ScopedRows<T> {
  rows: T[];
  /** Rows held back because their repository belongs to another family. */
  elsewhere: number;
}

/** `rows` narrowed to the scope, with the rest counted rather than dropped. */
export function scopeRowsByRepo<T>(
  rows: readonly T[],
  repoOf: (row: T) => string | null | undefined,
  family: string,
  index: RepoFamilyIndex
): ScopedRows<T> {
  if (!family) return { rows: [...rows], elsewhere: 0 };
  const kept: T[] = [];
  let elsewhere = 0;
  for (const row of rows) {
    if (repoInScope(repoOf(row), family, index)) kept.push(row);
    else elsewhere += 1;
  }
  return { rows: kept, elsewhere };
}

/**
 * The same, for a row that names several repositories (a pattern family, a
 * tool's adoption list): it stays while any of them is in scope.
 */
export function scopeRowsByRepos<T>(
  rows: readonly T[],
  reposOf: (row: T) => readonly string[],
  family: string,
  index: RepoFamilyIndex
): ScopedRows<T> {
  if (!family) return { rows: [...rows], elsewhere: 0 };
  const kept: T[] = [];
  let elsewhere = 0;
  for (const row of rows) {
    const repos = reposOf(row);
    // A row naming no repository is one the scope cannot place: it stays.
    const keep =
      repos.length === 0 || repos.some((repo) => repoInScope(repo, family, index));
    if (keep) kept.push(row);
    else elsewhere += 1;
  }
  return { rows: kept, elsewhere };
}

/** Keep only the repository names a scope is about. */
export function scopeRepoNames(
  repos: readonly string[],
  family: string,
  index: RepoFamilyIndex
): string[] {
  return family ? repos.filter((repo) => repoInScope(repo, family, index)) : [...repos];
}
