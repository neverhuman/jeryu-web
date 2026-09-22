// paletteModel.ts — what the command palette can jump to beyond its commands:
// repositories by name, and a pull request typed as `owner/name#12` or
// `name#12`. Pure functions; the palette renders what they return.

/** All the palette needs of a repository row: how its pages are addressed. */
export interface RepositoryRow {
  id: { host: string; owner: string; name: string };
}

export interface PaletteTarget {
  /** Stable key, also the cmdk item value's tail. */
  id: string;
  label: string;
  path: string;
}

/** The front page of a repository. */
export function repoFrontPage(row: RepositoryRow): string {
  const { host, owner, name } = row.id;
  return `/repos/${host}/${owner}/${name}`;
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
      path: `${repoFrontPage(row)}/pulls/${parsed.number}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Palette group headings, in display order. */
export const PALETTE_GROUPS = ['Go to', 'Repositories', 'Pull request', 'Search', 'Theme'] as const;
