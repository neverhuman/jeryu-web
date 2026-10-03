// familyScope.test.ts — the two spellings of the family scope, and the one key.
//
// Invented families only (acme, globex, initech): this repository is public.

import { describe, expect, it } from 'vitest';

import {
  canonicalFamily,
  familyFromHref,
  familyFromLocation,
  familyFromPath,
  sameFamily,
  withFamilyScope,
} from '../familyScope';

describe('canonicalFamily', () => {
  it('is one key per family, whichever alias names it', () => {
    expect(canonicalFamily('acme')).toBe('acme');
    expect(canonicalFamily('acme-split')).toBe('acme');
    expect(canonicalFamily(' globex ')).toBe('globex');
    expect(canonicalFamily(null)).toBe('');
    expect(canonicalFamily(undefined)).toBe('');
    expect(canonicalFamily('')).toBe('');
    // Only the suffix: a family actually called "split-acme" keeps its name.
    expect(canonicalFamily('split-acme')).toBe('split-acme');
  });

  it('matches the two aliases of one family', () => {
    expect(sameFamily('acme', 'acme-split')).toBe(true);
    expect(sameFamily('acme', 'globex')).toBe(false);
    expect(sameFamily('', null)).toBe(true);
  });
});

describe('familyFromPath', () => {
  it('reads the path form of the release board and the family browser', () => {
    expect(familyFromPath('/releases/family/acme')).toBe('acme');
    expect(familyFromPath('/repos/family/globex')).toBe('globex');
    expect(familyFromPath('/repos/family/acme-split')).toBe('acme-split');
    expect(familyFromPath('/releases')).toBeNull();
    expect(familyFromPath('/repos')).toBeNull();
    expect(familyFromPath('/work')).toBeNull();
  });

  it('decodes a family a URL had to escape', () => {
    expect(familyFromPath('/repos/family/acme%2Fone')).toBe('acme/one');
  });
});

describe('familyFromLocation', () => {
  it('prefers the path form, then the query, and says so when neither states one', () => {
    expect(familyFromLocation('/releases/family/acme-split', '')).toBe('acme');
    expect(familyFromLocation('/work', '?family=globex')).toBe('globex');
    expect(familyFromLocation('/work', '?family=globex-split&todo=7')).toBe('globex');
    expect(familyFromLocation('/work', '?todo=7')).toBeNull();
    // A page clears its filter by dropping the parameter; an empty one is the same.
    expect(familyFromLocation('/work', '?family=')).toBeNull();
  });

  it('reads a link the same way', () => {
    expect(familyFromHref('/activity?family=initech&kind=todo.')).toBe('initech');
    expect(familyFromHref('/releases/family/initech#lane-1')).toBe('initech');
    expect(familyFromHref('/runners')).toBeNull();
  });
});

describe('withFamilyScope', () => {
  it('carries the scope as a query parameter on the pages that use one', () => {
    expect(withFamilyScope('/work', 'acme')).toBe('/work?family=acme');
    expect(withFamilyScope('/needs-you', 'acme-split')).toBe('/needs-you?family=acme');
    expect(withFamilyScope('/activity?wall=1', 'globex')).toBe('/activity?wall=1&family=globex');
    expect(withFamilyScope('/work#add', 'globex')).toBe('/work?family=globex#add');
    expect(withFamilyScope('/activity?family=initech', 'acme')).toBe('/activity?family=acme');
  });

  it('carries it as a path segment where the family is the page', () => {
    expect(withFamilyScope('/releases', 'acme')).toBe('/releases/family/acme');
    expect(withFamilyScope('/releases/family/globex', 'acme')).toBe('/releases/family/acme');
    expect(withFamilyScope('/repos/family/globex', 'acme')).toBe('/repos/family/acme');
    // The repositories list states it in the query; its family page is a path.
    expect(withFamilyScope('/repos', 'acme')).toBe('/repos?family=acme');
    expect(withFamilyScope('/releases/family/globex#lane-7', 'acme')).toBe(
      '/releases/family/acme#lane-7'
    );
    expect(withFamilyScope('/releases?family=globex', 'acme')).toBe('/releases/family/acme');
  });

  it('takes the scope back off for every family', () => {
    expect(withFamilyScope('/work?family=acme&todo=7', '')).toBe('/work?todo=7');
    expect(withFamilyScope('/releases/family/acme', '')).toBe('/releases');
    expect(withFamilyScope('/repos/family/acme', '')).toBe('/repos');
    expect(withFamilyScope('/runners', '')).toBe('/runners');
    expect(withFamilyScope('/releases/family/acme#lane-7', '')).toBe('/releases#lane-7');
  });

  it('escapes a family a URL has to escape', () => {
    expect(withFamilyScope('/releases', 'acme/one')).toBe('/releases/family/acme%2Fone');
    expect(withFamilyScope('/work', 'acme one')).toBe('/work?family=acme+one');
  });
});
