// useFamilyNames.ts — the one list of families every family control offers.
//
// The shift queue knows the families that have a queue (`/shift/families`),
// the repository list knows the families that have repositories (`/repos`
// facets, and `family` on each row), and a deep link can carry a family that
// neither has answered for yet. A control built on one of those sources alone
// offers fewer families than the shell is already showing — the header select
// offered four while Repositories listed eleven — so every control takes its
// options from here: both sources, one canonical key per family, one order.
//
// Pure part first so it is unit-tested without a router or a server.

import { useMemo } from 'react';

import { useRepositories } from '../../hooks/useRepositories';
import { useShiftFamilies } from '../../hooks/useShift';
import { canonicalFamily } from './familyScope';
import { useFamilyScope } from './FamilyScopeProvider';

// Each source is named by the little of it that names a family, so the pure
// function takes the real responses and a test takes two lines of fixture.
export interface FamilyNameSources {
  /** `GET /api/v1/shift/families`, when it has answered. */
  shift?: { families: readonly { name: string }[] } | undefined;
  /** `GET /api/v1/repos`, when it has answered. */
  repositories?:
    | {
        facets?: { families?: readonly string[] } | undefined;
        repositories?: readonly { family?: string | null }[] | undefined;
      }
    | undefined;
  /** Families a page knows of by other means: the scope, a row, a live event. */
  also?: readonly (string | null | undefined)[];
}

/** Every family named by any source, canonical, de-duplicated and sorted. */
export function familyNameList(sources: FamilyNameSources): string[] {
  const keys = new Set<string>();
  const add = (name: string | null | undefined): void => {
    const key = canonicalFamily(name);
    if (key) keys.add(key);
  };
  for (const family of sources.shift?.families ?? []) add(family.name);
  for (const name of sources.repositories?.facets?.families ?? []) add(name);
  // The facets are what the server grouped by; a row may still name a family
  // the facets left out (a trimmed list, a page that stubs them).
  for (const repo of sources.repositories?.repositories ?? []) add(repo.family);
  for (const name of sources.also ?? []) add(name);
  return [...keys].sort((a, b) => a.localeCompare(b));
}

export interface FamilyNames {
  /** Every family a reader can choose, canonical and in one order. */
  names: string[];
  /** True while a source is still on its way: the list can still grow. */
  isPending: boolean;
}

/**
 * The options for a family control. `also` names families the calling page
 * knows about itself; the carried scope is always among them, so a deep link
 * into a family no source lists can still be left again. Both requests are
 * the shared polled ones, so a second control costs no extra call.
 */
export function useFamilyNames(also?: readonly (string | null | undefined)[]): FamilyNames {
  const shift = useShiftFamilies();
  const repositories = useRepositories({});
  const scope = useFamilyScope();
  const extra = useMemo(
    () => [scope.carried, scope.family, scope.outside, ...(also ?? [])],
    [scope.carried, scope.family, scope.outside, also]
  );
  const names = useMemo(
    () => familyNameList({ shift: shift.data, repositories: repositories.data, also: extra }),
    [shift.data, repositories.data, extra]
  );
  // Either source still coming means the list is not final yet, so a control
  // that holds its place until the names are in holds it until both answered.
  return { names, isPending: shift.isPending || repositories.isPending };
}
