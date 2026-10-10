// useRepoFamilyScope.ts — the family scope, for a page whose rows name repos.
//
// One hook for every such page: the shell's scope, plus the repo→family map
// built from the repository list the shell already polls. The endpoints behind
// these pages (the runner snapshot, the quality-gate overview, the dependency
// graph, tool adoption, search) take no `family` yet, so the narrowing happens
// here; see repoFamilyScope.ts for what a scoped page keeps and what it counts.

import { useMemo } from 'react';

import { useRepositories } from '../../hooks/useRepositories';
import { useFamilyScope } from './FamilyScopeProvider';
import {
  familyOfRepo,
  repoFamilyIndex,
  repoInScope,
  scopeRepoNames,
  scopeRowsByRepo,
  scopeRowsByRepos,
  type RepoFamilyIndex,
  type ScopedRows,
} from './repoFamilyScope';

export interface RepoFamilyScope {
  /** The family in scope, canonical; '' means every family. */
  family: string;
  /** True while one family is in scope. */
  active: boolean;
  /** What a reader calls it ('' when every family is in scope). */
  label: string;
  /** The repo→family map, for a page that needs it directly. */
  index: RepoFamilyIndex;
  /** The family that owns a repository, or null when the map cannot say. */
  familyOf: (repo: string | null | undefined) => string | null;
  /** Whether a row naming this repository stays on the page. */
  keeps: (repo: string | null | undefined) => boolean;
  /** Rows narrowed to the scope, with the rest counted. */
  rowsByRepo: <T>(rows: readonly T[], repoOf: (row: T) => string | null | undefined) => ScopedRows<T>;
  /** The same, for rows that span several repositories. */
  rowsByRepos: <T>(rows: readonly T[], reposOf: (row: T) => readonly string[]) => ScopedRows<T>;
  /** Only the repository names the scope is about. */
  repoNames: (repos: readonly string[]) => string[];
}

export function useRepoFamilyScope(): RepoFamilyScope {
  const scope = useFamilyScope();
  // The shared polled list: a second page costs no extra call.
  const repositories = useRepositories({});
  const index = useMemo(
    () => repoFamilyIndex(repositories.data?.repositories ?? []),
    [repositories.data]
  );
  const family = scope.family;
  return useMemo(
    () => ({
      family,
      active: family !== '',
      label: scope.label,
      index,
      familyOf: (repo) => familyOfRepo(repo, index),
      keeps: (repo) => repoInScope(repo, family, index),
      rowsByRepo: (rows, repoOf) => scopeRowsByRepo(rows, repoOf, family, index),
      rowsByRepos: (rows, reposOf) => scopeRowsByRepos(rows, reposOf, family, index),
      repoNames: (repos) => scopeRepoNames(repos, family, index),
    }),
    [family, index, scope.label]
  );
}
