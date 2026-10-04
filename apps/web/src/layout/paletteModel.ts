// paletteModel.ts — what the command palette can jump to beyond its commands:
// repositories by name, and a pull request typed as `owner/name#12` or
// `name#12`. Pure functions; the palette renders what they return.

import { repoUrl, type RepoRef } from '../pages/repoBrowserModel';

/** All the palette needs of a repository row: how its pages are addressed. */
export interface RepositoryRow {
  id: RepoRef;
}

export interface PaletteTarget {
  /** Stable key, also the cmdk item value's tail. */
  id: string;
  label: string;
  path: string;
}

/** The front page of a repository. */
export function repoFrontPage(row: RepositoryRow): string {
  return repoUrl(row.id);
}

/** Every repository as a jump target, `owner/name`, sorted by name. */
export function repositoryTargets(rows: readonly RepositoryRow[]): PaletteTarget[] {
  return rows
    .map((row) => ({
      id: `repo:${row.id.host}:${row.id.owner}/${row.id.name}`,
      label: `${row.id.owner}/${row.id.name}`,
      path: repoFrontPage(row),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface PullQuery {
  /** `owner/name`, or a bare `name`. */
  repo: string;
  number: number;
}

const PULL_QUERY = /^([\w.-]+(?:\/[\w.-]+)?)\s*#\s*(\d{1,9})$/;

/** `owner/name#12` or `name#12`, else null. */
export function parsePullQuery(query: string): PullQuery | null {
  const match = PULL_QUERY.exec(query.trim());
  if (!match) return null;
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return { repo: match[1], number };
}

/**
 * The pull requests a typed `repo#n` may mean. A bare name that several owners
 * share offers one entry per repository; an unknown repository offers none.
 */
export function pullTargets(query: string, rows: readonly RepositoryRow[]): PaletteTarget[] {
  const parsed = parsePullQuery(query);
  if (!parsed) return [];
  const wanted = parsed.repo.toLowerCase();
  const qualified = wanted.includes('/');
  return rows
    .filter((row) => {
      const full = `${row.id.owner}/${row.id.name}`.toLowerCase();
      return qualified ? full === wanted : row.id.name.toLowerCase() === wanted;
    })
    .map((row) => ({
      id: `pull:${row.id.host}:${row.id.owner}/${row.id.name}#${parsed.number}`,
      label: `Open pull request #${parsed.number} in ${row.id.owner}/${row.id.name}`,
      path: repoUrl(row.id, 'pulls', String(parsed.number)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Palette group headings, in display order. */
export const PALETTE_GROUPS = ['Go to', 'Repositories', 'Pull request', 'Search', 'Theme'] as const;

/**
 * The value of the item that always hands the typed text to `/search`. It is
 * force-mounted rather than matched, so it never competes with a real jump.
 */
export const SEARCH_ALL_VALUE = 'search:all-results';

/** Lowercased, with runs of whitespace collapsed. */
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The separators inside a palette value: `owner/name`, `search:all`, `a.b`. */
const WORD_SPLIT = /[\s/:#._-]+/;

/**
 * How well one piece of text answers `needle`, 0 (not at all) to 1 (it is the
 * text). Whole words only: a palette that matches loose subsequences buries the
 * exact hit under every title that happens to contain the same letters.
 */
function textScore(text: string, needle: string): number {
  if (text === needle) return 1;
  if (text.startsWith(needle)) return 0.8;
  if (text.split(WORD_SPLIT).some((word) => word.startsWith(needle))) return 0.6;
  if (text.includes(needle)) return 0.4;
  return 0;
}

/** A keyword is a way in, not the name of the thing; it ranks below the title. */
const KEYWORD_WEIGHT = 0.5;

/**
 * cmdk's filter for the palette: the title first, then the keywords, and
 * nothing at all for text that merely shares letters with the query.
 */
export function paletteScore(value: string, search: string, keywords: readonly string[] = []): number {
  const needle = normalize(search);
  if (needle === '') return 1;
  if (value === SEARCH_ALL_VALUE) return 0;
  let best = textScore(normalize(value), needle);
  for (const keyword of keywords) {
    best = Math.max(best, textScore(normalize(keyword), needle) * KEYWORD_WEIGHT);
  }
  return best;
}
