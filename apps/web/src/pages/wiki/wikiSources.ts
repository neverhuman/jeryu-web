// wikiSources.ts — a wiki page's frontmatter `sources`, `status` and
// `updated`, read for display: the header shows the date and a status pill,
// and the end of the page lists the sources as links.
//
// A source is written one of three ways, and each links differently:
//   raw/2026-10-01-notes.md            a file of the wiki's own repository
//   jeryu-deploy docs/governed.md      a file (or folder) of another repository
//   live checks on node-a 2026-10-01   a note, shown as text
// A trailing "(…)" is a note about the source and stays in its text.

import type { Tone } from '../../components/tone/tone';

export type SourceTarget =
  | { kind: 'wiki-repo'; path: string }
  | { kind: 'repo'; repo: string; path: string | null };

export interface WikiSource {
  /** The source as the page wrote it. */
  text: string;
  /** Where it may lead; `null` for a note. */
  target: SourceTarget | null;
}

/** Split a frontmatter list (`[a, b (x, y), c]` or `a, b`) at top-level commas. */
export function parseSourceList(value: string): string[] {
  const inner = value.trim().replace(/^\[/, '').replace(/\]$/, '');
  const items: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of inner) {
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      items.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  items.push(current);
  return items.map((item) => item.trim()).filter((item) => item !== '');
}

/** A single path token: has a folder or an extension, no spaces or wildcards. */
function isPathToken(token: string): boolean {
  return /^[\w.@-]+(\/[\w.@-]+)*\/?$/.test(token) && (token.includes('/') || /\.\w+$/.test(token));
}

/** How one source entry links (see the header comment for the three forms). */
export function classifySource(entry: string): WikiSource {
  const text = entry.trim();
  const bare = text.replace(/\s*\([^)]*\)\s*$/, '');
  if (isPathToken(bare)) return { text, target: { kind: 'wiki-repo', path: bare.replace(/\/$/, '') } };
  const repoForm = bare.match(/^([\w.-]+)\s+(\S+)/);
  if (repoForm && !repoForm[1].includes('/')) {
    const path = isPathToken(repoForm[2]) ? repoForm[2] : null;
    return { text, target: { kind: 'repo', repo: repoForm[1], path } };
  }
  return { text, target: null };
}

export type StatusTone = Tone;

/** The pill colour a page status reads as. */
export function statusTone(status: string): StatusTone {
  const value = status.trim().toLowerCase();
  if (['current', 'ok', 'active', 'live', 'stable'].includes(value)) return 'ok';
  if (['draft', 'wip', 'review', 'in-progress', 'proposed'].includes(value)) return 'warn';
  if (['stale', 'outdated', 'superseded', 'archived', 'retired'].includes(value)) {
    return 'warn';
  }
  return 'unknown';
}

/** Frontmatter keys the page header and source list show themselves. */
export const HEADER_FIELDS = ['title', 'summary', 'status', 'updated', 'sources'];

/** The value of one frontmatter key, matched without case. */
export function fieldValue(fields: Array<[string, string]>, key: string): string | null {
  const value = fields.find(([name]) => name.toLowerCase() === key)?.[1]?.trim();
  return value ? value : null;
}
