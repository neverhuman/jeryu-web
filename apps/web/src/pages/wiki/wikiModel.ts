// wikiModel.ts — the pure parts of the wiki reader: what belongs to the wiki,
// which page a URL names, where a link inside a page leads, the folder tree,
// frontmatter, `[[wiki links]]`, and the sections a page is cut into so each
// can carry a margin note saying where it came from.
//
// The wiki is not the whole repository. It is a start page (`index.md` at the
// top, else `wiki/README.md`) and the Markdown under `wiki/`; everything else
// stays in the repository view, one link away.
//
// Line numbers are 1-based and always count lines of the whole file, so a
// section can be matched against `git blame` of that file directly.

import type { BlameCommit, BlameResponse } from '../../api/types/wiki';

export const WIKI_PATH = '/wiki';
/** The folder whose Markdown is the wiki. */
export const WIKI_DIR = 'wiki/';
/** Where the start page may live, in order of preference. */
export const HOME_CANDIDATES = ['index.md', 'wiki/README.md'];

const INDEX_NAMES = ['readme.md', 'index.md', 'home.md', 'readme.markdown', 'index.markdown'];

function isIndexName(name: string): boolean {
  return INDEX_NAMES.includes(name.toLowerCase());
}

export interface WikiScope {
  /** The start page's repository path, or `null` when neither candidate exists. */
  home: string | null;
  /** Markdown under `wiki/`, by repository path. */
  pages: string[];
}

/** Keep the start page and the Markdown under `wiki/` from a repository's page list. */
export function wikiScope(paths: readonly string[]): WikiScope {
  return {
    home: HOME_CANDIDATES.find((candidate) => paths.includes(candidate)) ?? null,
    pages: paths.filter((path) => path.startsWith(WIKI_DIR)).sort(),
  };
}

function inScope(scope: WikiScope, path: string): boolean {
  return path === scope.home || scope.pages.includes(path);
}

/** The SPA URL of a page of the wiki (the start page is `/wiki` itself). */
export function wikiHref(path: string, scope: WikiScope): string {
  if (path === scope.home) return WIKI_PATH;
  const rest = path.startsWith(WIKI_DIR) ? path.slice(WIKI_DIR.length) : path;
  return `${WIKI_PATH}/${rest.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * The page a `/wiki/<splat>` URL names: the start page for the bare `/wiki`,
 * else `wiki/<splat>` itself or that folder's index page. `null` when the
 * wiki has no such page.
 */
export function resolvePagePath(splat: string, scope: WikiScope): string | null {
  const wanted = splat.replace(/^\/+|\/+$/g, '');
  if (wanted === '') return scope.home;
  const path = `${WIKI_DIR}${wanted}`;
  if (scope.pages.includes(path)) return path;
  const dir = `${path}/`;
  return (
    INDEX_NAMES.map((name) =>
      scope.pages.find((page) => page.startsWith(dir) && page.slice(dir.length).toLowerCase() === name)
    ).find(Boolean) ?? null
  );
}

const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Where a link written inside a page leads. A relative link is resolved
 * against the page's folder: a page of the wiki opens in the wiki, any other
 * file opens in the repository view (`blobHref`). Anchors, absolute paths and
 * external URLs are left alone.
 */
export function resolveDocLink(
  href: string,
  docPath: string,
  scope: WikiScope,
  blobHref: (repoPath: string) => string
): string {
  if (href === '' || href.startsWith('#') || href.startsWith('/') || EXTERNAL.test(href)) {
    return href;
  }
  const dir = docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/') + 1) : '';
  const url = new URL(href, `https://wiki.invalid/${dir}`);
  const target = decodeURIComponent(url.pathname.slice(1)).replace(/\/+$/, '');
  const suffix = `${url.search}${url.hash}`;
  if (inScope(scope, target)) return `${wikiHref(target, scope)}${suffix}`;
  if (target === 'wiki' || target.startsWith(WIKI_DIR)) {
    const folder = resolvePagePath(target.slice(WIKI_DIR.length), scope);
    if (folder) return `${wikiHref(folder, scope)}${suffix}`;
  }
  return `${blobHref(target)}${suffix}`;
}

/**
 * A page's name in the tree. A folder's index page (README, index, home) is
 * listed under its own file name, since the folder above it already names it;
 * other pages read as words. The start page is Home.
 */
export function pageLabel(path: string, scope?: WikiScope): string {
  if (scope && path === scope.home) return 'Home';
  const name = path.split('/').pop() ?? path;
  if (isIndexName(name)) return name;
  return humanize(name.replace(/\.(md|markdown)$/i, ''));
}

/** A title for a page with neither a frontmatter title nor a heading. */
function fallbackTitle(path: string): string {
  const name = path.split('/').pop() ?? path;
  if (isIndexName(name)) {
    const parent = path.split('/').slice(-2, -1)[0];
    return !parent || `${parent}/` === WIKI_DIR ? 'Wiki' : humanize(parent);
  }
  return humanize(name.replace(/\.(md|markdown)$/i, ''));
}

/** A folder's display name in the page tree. */
export function folderLabel(name: string): string {
  return humanize(name);
}

function humanize(stem: string): string {
  const spaced = stem.replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface TreeFolder {
  name: string;
  path: string;
  folders: TreeFolder[];
  pages: string[];
}

/** The pages under `wiki/`, grouped by folder; index pages first, then by name. */
export function buildPageTree(pages: readonly string[]): TreeFolder {
  const root: TreeFolder = { name: '', path: WIKI_DIR.slice(0, -1), folders: [], pages: [] };
  for (const page of pages) {
    const parts = page.slice(WIKI_DIR.length).split('/');
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      const path = `${folder.path}/${part}`;
      let next = folder.folders.find((child) => child.name === part);
      if (!next) {
        next = { name: part, path, folders: [], pages: [] };
        folder.folders.push(next);
      }
      folder = next;
    }
    folder.pages.push(page);
  }
  const sort = (folder: TreeFolder): void => {
    folder.folders.sort((a, b) => a.name.localeCompare(b.name));
    folder.pages.sort((a, b) => {
      const ai = isIndexName(a.split('/').pop() ?? '') ? 0 : 1;
      const bi = isIndexName(b.split('/').pop() ?? '') ? 0 : 1;
      return ai - bi || a.localeCompare(b);
    });
    folder.folders.forEach(sort);
  };
  sort(root);
  return root;
}

export interface Frontmatter {
  /** `key: value` pairs in file order; lists and nesting are kept as text. */
  fields: Array<[string, string]>;
  /** The Markdown after the closing `---`. */
  body: string;
  /** How many file lines the frontmatter took, so `body` line 1 is file line `offset + 1`. */
  offset: number;
}

/** Split a leading YAML frontmatter block off a page. */
export function splitFrontmatter(markdown: string): Frontmatter {
  const lines = markdown.split('\n');
  if (lines[0]?.trim() !== '---') return { fields: [], body: markdown, offset: 0 };
  const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line));
  if (end < 0) return { fields: [], body: markdown, offset: 0 };
  const fields: Array<[string, string]> = [];
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) {
      fields.push([match[1], match[2].replace(/^["']|["']$/g, '')]);
    } else if (fields.length > 0 && /^\s+-\s+/.test(line)) {
      const last = fields[fields.length - 1];
      const item = line.replace(/^\s+-\s+/, '');
      last[1] = last[1] ? `${last[1]}, ${item}` : item;
    }
  }
  return { fields, body: lines.slice(end + 1).join('\n'), offset: end + 1 };
}

/** The title a page gives itself: frontmatter `title`, else its first heading. */
export function pageTitle(path: string, page: Frontmatter): string {
  const fromFields = page.fields.find(([key]) => key.toLowerCase() === 'title')?.[1];
  if (fromFields) return fromFields;
  const heading = page.body.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1];
  return heading ?? fallbackTitle(path);
}

export interface Section {
  /** First and last file line (1-based, inclusive). */
  startLine: number;
  endLine: number;
  markdown: string;
  /** The heading that opens the section, if any. */
  heading: string | null;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX_HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*\S/;

/**
 * Cut a page at each heading outside a fenced code block. `offset` is the
 * number of file lines before `body` (the frontmatter). Reference-style link
 * definitions are appended to every section so a link still resolves when its
 * definition lives in another one. Blank-only sections are dropped.
 */
export function splitSections(body: string, offset = 0): Section[] {
  const lines = body.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const definitions = lines.filter((line) => REFERENCE_DEFINITION.test(line));
  const sections: Section[] = [];
  let fence: string | null = null;
  let start = 0;
  let heading: string | null = null;
  const flush = (end: number): void => {
    const chunk = lines.slice(start, end);
    if (chunk.some((line) => line.trim() !== '')) {
      const own = new Set(chunk);
      const extra = definitions.filter((line) => !own.has(line));
      sections.push({
        startLine: offset + start + 1,
        endLine: offset + end,
        markdown: [...chunk, ...(extra.length > 0 ? ['', ...extra] : [])].join('\n'),
        heading,
      });
    }
  };
  lines.forEach((line, index) => {
    const fenceMatch = line.match(FENCE);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      return;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      return;
    }
    const headingMatch = line.match(ATX_HEADING);
    if (headingMatch && index > start) {
      flush(index);
      start = index;
      heading = headingMatch[2];
    } else if (headingMatch) {
      heading = headingMatch[2];
    }
  });
  flush(lines.length);
  return sections;
}

const WIKI_LINK = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;

function pageKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^wiki\//, '')
    .replace(/\.(md|markdown)$/i, '')
    .replace(/[\s_]+/g, '-');
}

/**
 * Turn `[[name]]` and `[[name|label]]` into links to the wiki page whose path
 * (inside `wiki/`) or file name matches `name`, outside fenced and inline
 * code. A name no page matches is left as written, so a broken link shows.
 */
export function linkWikiReferences(markdown: string, scope: WikiScope): string {
  const byKey = new Map<string, string>();
  const all = scope.home ? [scope.home, ...scope.pages] : scope.pages;
  for (const page of all) {
    if (!byKey.has(pageKey(page))) byKey.set(pageKey(page), page);
  }
  for (const page of all) {
    const name = page.split('/').pop() ?? page;
    if (!byKey.has(pageKey(name))) byKey.set(pageKey(name), page);
  }
  let fence: string | null = null;
  return markdown
    .split('\n')
    .map((line) => {
      const fenceMatch = line.match(FENCE);
      if (fence) {
        if (fenceMatch && fenceMatch[1][0] === fence[0]) fence = null;
        return line;
      }
      if (fenceMatch) {
        fence = fenceMatch[1];
        return line;
      }
      return line
        .split(/(`[^`]*`)/)
        .map((part) =>
          part.startsWith('`')
            ? part
            : part.replace(WIKI_LINK, (whole, name: string, label?: string) => {
                const target = byKey.get(pageKey(name));
                if (!target) return whole;
                return `[${(label ?? name).trim()}](${wikiHref(target, scope)})`;
              })
        )
        .join('');
    })
    .join('\n');
}

export interface SectionNote {
  /** The newest commit that changed a line of the section. */
  latest: BlameCommit;
  /** The oldest commit still holding a line of the section. */
  earliest: BlameCommit;
  /** Distinct commits behind the section's current lines. */
  commitCount: number;
}

/** Who last shaped the lines `startLine..endLine`, from a file's blame. */
export function sectionNote(
  blame: BlameResponse,
  startLine: number,
  endLine: number
): SectionNote | null {
  const bySha = new Map(blame.commits.map((commit) => [commit.sha, commit]));
  const touching = new Set<string>();
  for (const hunk of blame.hunks) {
    const last = hunk.start_line + hunk.line_count - 1;
    if (hunk.start_line <= endLine && last >= startLine) touching.add(hunk.commit);
  }
  const commits = [...touching]
    .map((sha) => bySha.get(sha))
    .filter((commit): commit is BlameCommit => commit !== undefined)
    .sort((a, b) => b.authored_at.localeCompare(a.authored_at));
  if (commits.length === 0) return null;
  return {
    latest: commits[0],
    earliest: commits[commits.length - 1],
    commitCount: commits.length,
  };
}

/** `Sep 12, 2026`: a fixed, readable date for "added" notes. */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
