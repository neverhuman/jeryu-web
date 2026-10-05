// Guard: the UI says what the glossary says.
//
// `src/words/glossary.ts` names one canonical term per thing and lists the
// synonyms that must not ship. This test walks the hand-written `src/` tree,
// pulls the user-facing strings out of every non-test source file, and FAILS
// when one of them uses a banned synonym — so mixed vocabulary trips here
// instead of reaching an operator.
//
// What counts as a user-facing string:
//   * JSX text (what sits between tags), and
//   * quoted or backticked literals that contain a space.
// A literal without a space is a code name — a test id, a sort key, a class,
// a route — and the glossary is about words, not identifiers. Comments are
// stripped first: they explain the code and may name what they forbid.
//
// Test, spec and story files are exempt: like this guard, they quote the
// banned words as fixtures.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BANNED_SYNONYMS, GLOSSARY, bannedTermsIn } from '../words/glossary';

/** Root of the hand-written front-end source tree. */
const SRC_ROOT = join(import.meta.dirname, '..');

/** Directory names we never descend into. */
const SKIP_DIRS = new Set(['node_modules', '__snapshots__']);

/** Files that legitimately quote the banned words (fixtures, and this guard). */
function isExemptFile(path: string): boolean {
  return (
    /\.(test|spec|stories)\.[cm]?[jt]sx?$/.test(path) ||
    /[\\/]__tests__[\\/]/.test(path) ||
    path.endsWith('.snap') ||
    path.endsWith(join('words', 'glossary.ts'))
  );
}

/** Extensions worth scanning for copy. */
function isScannable(path: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(path);
}

/** Recursively collect every scannable, non-exempt source file under `dir`. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...collectSourceFiles(full));
    } else if (isScannable(full) && !isExemptFile(full)) {
      out.push(full);
    }
  }
  return out;
}

/** Drop `//` and block comments, which document the code rather than speak to the operator. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

/** String, template and JSX-text literals that could reach the screen. */
function uiStrings(source: string): string[] {
  const text = stripComments(source);
  const out: string[] = [];

  // Quoted and backticked literals. Only phrases (something with a space) are
  // copy; a single token is a code name.
  for (const match of text.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    if (/\s/.test(value)) out.push(value);
  }

  // JSX text: what sits between a closing `>` and the next `<` on one line,
  // with no interpolation between them. Requires a letter so punctuation and
  // whitespace-only gaps are ignored.
  for (const match of text.matchAll(/>([^<>{}\n]*)</g)) {
    const value = match[1];
    if (/[A-Za-z]/.test(value)) out.push(value);
  }

  return out;
}

describe('glossary vocabulary guard', () => {
  const files = collectSourceFiles(SRC_ROOT);

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('gives every canonical term a meaning and at least one banned synonym', () => {
    for (const entry of GLOSSARY) {
      expect(entry.term, 'a glossary term needs a name').not.toBe('');
      expect(entry.meaning.length, `${entry.term} needs a meaning`).toBeGreaterThan(20);
      expect(entry.banned.length, `${entry.term} bans nothing`).toBeGreaterThan(0);
    }
  });

  it('matches each banned synonym against its own word', () => {
    for (const banned of BANNED_SYNONYMS) {
      expect(
        banned.pattern.test(`before ${banned.word} after`),
        `${banned.word} does not match its own pattern`
      ).toBe(true);
    }
  });

  it('picks copy out of source and leaves code names alone', () => {
    const strings = uiStrings(
      [
        '// a comment about PRs and tasks',
        'const id = `fleet-task-${x}`;',
        "const key = 'open_prs';",
        'const label = "Open pull requests";',
        'const el = <p>Pull request #31 is open</p>;',
      ].join('\n')
    );
    expect(strings).toContain('Open pull requests');
    expect(strings).toContain('Pull request #31 is open');
    expect(strings.some((s) => s.includes('fleet-task-'))).toBe(false);
    expect(strings.some((s) => s.includes('open_prs'))).toBe(false);
    expect(strings.some((s) => s.includes('a comment about'))).toBe(false);
  });

  it('flags a banned synonym in a user-facing string', () => {
    const found = uiStrings('const label = "Open PRs";').flatMap(bannedTermsIn);
    expect(found.map((banned) => banned.word)).toEqual(['PR']);
  });

  it('uses no banned synonym in any user-facing string', () => {
    const violations: string[] = [];
    for (const file of files) {
      for (const value of uiStrings(readFileSync(file, 'utf8'))) {
        for (const banned of bannedTermsIn(value)) {
          violations.push(`${file}: "${value.trim()}" says "${banned.word}", say "${banned.instead}"`);
        }
      }
    }
    expect(violations, `Banned vocabulary:\n${violations.join('\n')}`).toEqual([]);
  });
});
