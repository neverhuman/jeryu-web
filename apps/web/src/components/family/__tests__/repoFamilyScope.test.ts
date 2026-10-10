// repoFamilyScope.test.ts — what a page keeps when its rows name repositories
// and the endpoint behind it cannot filter by family.
//
// Invented families only (acme, globex, initech): jeryu is public.

import { describe, expect, it } from 'vitest';

import {
  familyOfRepo,
  repoFamilyIndex,
  repoInScope,
  scopeRepoNames,
  scopeRowsByRepo,
  scopeRowsByRepos,
} from '../repoFamilyScope';

const INDEX = repoFamilyIndex([
  { id: { owner: 'acme', name: 'acme-web' }, family: 'acme-split' },
  { id: { owner: 'acme', name: 'acme-core' }, family: 'acme' },
  { id: { owner: 'globex', name: 'globex-web' }, family: 'globex' },
  // No family: the list knows the repository but nobody claims it.
  { id: { owner: 'initech', name: 'initech-web' }, family: null },
]);

describe('the repo→family map', () => {
  it('answers by full name, by bare name, and on the family a reader says', () => {
    // `acme-split` and `acme` are one family to a reader, so the index keeps
    // the canonical key and a scope set on either matches.
    expect(familyOfRepo('acme/acme-web', INDEX)).toBe('acme');
    expect(familyOfRepo('acme-web', INDEX)).toBe('acme');
    expect(familyOfRepo('globex/globex-web', INDEX)).toBe('globex');
  });

  it('says nothing about a repository it has never heard of', () => {
    expect(familyOfRepo('initech/initech-web', INDEX)).toBeNull();
    expect(familyOfRepo('nowhere/thing', INDEX)).toBeNull();
    expect(familyOfRepo('', INDEX)).toBeNull();
  });
});

describe('what a scoped page keeps', () => {
  it('keeps the scope’s own repositories and the ones it cannot place', () => {
    expect(repoInScope('acme/acme-web', 'acme', INDEX)).toBe(true);
    expect(repoInScope('globex/globex-web', 'acme', INDEX)).toBe(false);
    // Unknown to the map: claiming it is another family's would be a guess,
    // and a page that blanked while the repository list loads is worse.
    expect(repoInScope('nowhere/thing', 'acme', INDEX)).toBe(true);
    expect(repoInScope(null, 'acme', INDEX)).toBe(true);
  });

  it('keeps everything with no family in scope', () => {
    expect(repoInScope('globex/globex-web', '', INDEX)).toBe(true);
  });

  it('counts the rows it held back rather than dropping them silently', () => {
    const rows = [
      { repo: 'acme/acme-web' },
      { repo: 'acme/acme-core' },
      { repo: 'globex/globex-web' },
      { repo: 'nowhere/thing' },
    ];
    const scoped = scopeRowsByRepo(rows, (row) => row.repo, 'acme-split', INDEX);
    expect(scoped.rows.map((row) => row.repo)).toEqual([
      'acme/acme-web',
      'acme/acme-core',
      'nowhere/thing',
    ]);
    expect(scoped.elsewhere).toBe(1);
  });

  it('keeps a row that spans several repositories while one is in scope', () => {
    const rows = [
      { id: 'shared', repos: ['acme/acme-web', 'globex/globex-web'] },
      { id: 'theirs', repos: ['globex/globex-web'] },
      { id: 'nameless', repos: [] },
    ];
    const scoped = scopeRowsByRepos(rows, (row) => row.repos, 'acme', INDEX);
    expect(scoped.rows.map((row) => row.id)).toEqual(['shared', 'nameless']);
    expect(scoped.elsewhere).toBe(1);
  });

  it('cuts a list of repository names to the scope', () => {
    expect(
      scopeRepoNames(['acme/acme-web', 'globex/globex-web'], 'acme', INDEX)
    ).toEqual(['acme/acme-web']);
    expect(
      scopeRepoNames(['acme/acme-web', 'globex/globex-web'], '', INDEX)
    ).toEqual(['acme/acme-web', 'globex/globex-web']);
  });
});
