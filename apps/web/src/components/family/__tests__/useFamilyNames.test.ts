// useFamilyNames.test.ts — the one list of families every control offers.
//
// Invented families only (acme, globex, initech, hooli): jeryu is public.

import { describe, expect, it } from 'vitest';

import { familyNameList } from '../useFamilyNames';

function shift(...names: string[]): { families: { name: string }[] } {
  return { families: names.map((name) => ({ name })) };
}

function repos(
  facets: string[],
  rows: (string | null)[]
): { facets: { families: string[] }; repositories: { family: string | null }[] } {
  return {
    repositories: rows.map((family) => ({ family })),
    facets: { families: facets },
  };
}

describe('familyNameList', () => {
  it('names every family either source knows, once and in one order', () => {
    expect(
      familyNameList({
        shift: shift('globex', 'acme-split'),
        repositories: repos(['acme-split', 'hooli-split'], ['initech', null]),
      })
    ).toEqual(['acme', 'globex', 'hooli', 'initech']);
  });

  it('keeps a family the server lists nowhere, so a deep link can be left', () => {
    expect(familyNameList({ also: ['jailgun', '', null, undefined] })).toEqual(['jailgun']);
  });

  it('is empty before anything has answered', () => {
    expect(familyNameList({})).toEqual([]);
  });

  it('folds the aliases of one family into the key the scope uses', () => {
    expect(
      familyNameList({ shift: shift('acme'), also: ['acme-split', ' acme '] })
    ).toEqual(['acme']);
  });
});
