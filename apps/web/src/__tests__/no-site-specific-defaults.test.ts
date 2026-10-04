// No install's own families or repositories in the app.
//
// The web app ships to more than one forge, so nothing in it may stand on the
// names one install happens to use. A default family, a default repository, a
// repository sorted first by name: each is a page that reads wrong — or empty
// — on every other install. Where a page needs a family or a repository it
// asks the server (`/api/v1/repositories`, `/api/v1/site-settings`,
// `/api/v1/pins`) and falls back to saying it has none.
//
// This guard walks the hand-written front-end and fails on a string literal
// that names a family or a repository.
//
// Scope notes:
//   * Only non-test source counts. Tests, stories and e2e fixtures spell
//     exact families and repositories on purpose — that is what a fixture is.
//   * Comments are stripped first: a comment may name an example route.
//   * A family key is `<name>-split`, the forge's own spelling; a repository
//     literal is `owner/name`. The app's own routes, media types, module
//     specifiers and time zones share that shape and are none of this guard's
//     business, so the first half of a literal is read against a list of words
//     that never name a repository owner.
//   * `pages/repoStatusModel.ts` names the forge's own check-run contexts
//     (`<product>/<check>`), which every install emits; they are check names,
//     not repositories.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The hand-written front-end source. */
const SRC = join(import.meta.dirname, '..');

const SKIP_DIRS = new Set(['node_modules', '__snapshots__', '__tests__', 'test']);

/** Check-run contexts, not repositories; see the scope notes. */
const CHECK_NAMES = join('pages', 'repoStatusModel.ts');

function isExemptFile(path: string): boolean {
  return (
    /\.(test|spec|stories)\.[cm]?[jt]sx?$/.test(path) ||
    path.endsWith('.snap') ||
    path.endsWith(CHECK_NAMES)
  );
}

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...collectSourceFiles(full));
    } else if (/\.[cm]?[jt]sx?$/.test(full) && !isExemptFile(full)) {
      out.push(full);
    }
  }
  return out;
}

/** The source with its comments blanked out, line numbering intact. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (line, lead) => lead + ' '.repeat(line.length - lead.length));
}

/** Every single- and double-quoted string literal on one line. */
function stringLiterals(line: string): string[] {
  return (line.match(/'[^'\n]*'|"[^"\n]*"/g) ?? []).map((raw) => raw.slice(1, -1));
}

/** A family key as the forge spells one: `acme-split`. */
const FAMILY_KEY = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-split$/;

/** True when the literal is a family key, or a path with one in it. */
function namesFamily(literal: string): boolean {
  return literal.split('/').some((segment) => FAMILY_KEY.test(segment));
}

/** A repository as every read model names one: `owner/name`. */
const REPOSITORY = /^([a-z0-9][a-z0-9.-]*)\/[a-z0-9][a-z0-9._-]*$/;

/**
 * First halves that are never a repository owner: the app's own route roots,
 * the media types it sends and reads, and the placeholder the UI prints when it
 * explains the `owner/name` shape to a reader.
 */
const NOT_AN_OWNER = new Set([
  'application',
  'audio',
  'font',
  'image',
  'model',
  'multipart',
  'owner',
  'repos',
  'shared-tools',
  'text',
  'unscheduled',
  'video',
  'wiki',
  'work',
]);

/** True when the literal names a repository rather than a path or a type. */
function namesRepository(literal: string): boolean {
  const owner = REPOSITORY.exec(literal)?.[1];
  return owner !== undefined && !NOT_AN_OWNER.has(owner);
}

describe('no site-specific family or repository defaults', () => {
  it('names no family and no repository anywhere in src', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SRC)) {
      withoutComments(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, index) => {
          // A module specifier is a package, not a repository.
          if (/\bfrom\s*['"]|\bimport\s*\(|\brequire\s*\(/.test(line)) return;
          for (const literal of stringLiterals(line)) {
            const what = namesFamily(literal)
              ? 'family'
              : namesRepository(literal)
                ? 'repository'
                : null;
            if (what) {
              offenders.push(`${file}:${index + 1} names a ${what}: ${literal}`);
            }
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
