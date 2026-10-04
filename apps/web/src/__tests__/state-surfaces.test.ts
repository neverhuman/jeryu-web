// state-surfaces.test.ts — loading and failure branches belong to the shared
// state components, not to a hand-rolled `page__roadmap-note` paragraph.
//
// `page__roadmap-note` is the page's own prose: a header note, an aside under
// a list. A read that is still running or has failed is a state surface
// (`components/state`), so it carries a role, a typed error code with the
// request id, and a Retry. This test reads the pages that used to hand-roll
// those branches and fails if a note sits in one again.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

/** The pages that were moved onto the shared surfaces. */
const PAGES = [
  'pages/DependenciesPage.tsx',
  'pages/IntelligencePage.tsx',
  'pages/PullRoomPage.tsx',
  'pages/ReleasesPage.tsx',
  'pages/FleetPage.tsx',
  'pages/RepositoryAgentsPage.tsx',
  'pages/RepositoryPullRequestsPage.tsx',
  'pages/releaseBoard/ReleaseBoardView.tsx',
];

/**
 * What a loading or failure branch reads like, in code or in prose — the state
 * a note is named for (`runnerNetworkNote`) counts too.
 */
const BRANCH =
  /isLoading|isPending|isError|\berror\b|Loading|Resolving|unavailable|could not|did not answer|note\b/i;

/** The class names themselves hold "note": drop them before reading. */
const CLASS = /[\w-]*-note\b/g;

/** How far around a note counts as the same branch. */
const WINDOW = 4;

describe('shared loading and failure surfaces', () => {
  it.each(PAGES)('%s hand-rolls no note in a loading or failure branch', (page) => {
    const lines = readFileSync(join(SRC, page), 'utf8').split('\n');
    const offenders: string[] = [];
    lines.forEach((line, index) => {
      if (!line.includes('page__roadmap-note')) return;
      const near = lines
        .slice(Math.max(0, index - WINDOW), index + WINDOW + 1)
        .join('\n')
        .replace(CLASS, '');
      if (BRANCH.test(near)) offenders.push(`${page}:${index + 1}: ${line.trim()}`);
    });
    expect(offenders).toEqual([]);
  });

  it('the pages that read the forge use the state components', () => {
    for (const page of PAGES) {
      const source = readFileSync(join(SRC, page), 'utf8');
      expect(source, page).toMatch(/from '\.\.(\/\.\.)?\/components\/state'/);
    }
  });
});
