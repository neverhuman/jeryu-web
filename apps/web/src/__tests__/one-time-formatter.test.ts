// One time formatter, one number formatter.
//
// `src/format` is where an instant becomes words: `<When>` for a row, and the
// functions behind it for a string. A page that calls `toLocaleString` itself
// is how the four wordings and the four clocks came back last time, and
// `toISOString().slice` is how a UTC clock reaches a reader who is not in UTC.
// This guard walks the hand-written front-end and fails on either.
//
// Scope notes:
//   * Only non-test source counts: tests spell exact stamps as fixtures.
//   * The formatter module itself is the one place both are allowed.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '__snapshots__', 'format']);

/** `toLocaleString(`, `toLocaleDateString(`, `toLocaleTimeString(`. */
const LOCALE_CALL = /\.toLocale(String|DateString|TimeString)\(/;
const UTC_SLICE = /\.toISOString\(\)\s*\.slice\(/;

function isExemptFile(path: string): boolean {
  return /\.(test|spec|stories)\.[cm]?[jt]sx?$/.test(path) || /[\\/]__tests__[\\/]/.test(path);
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

describe('one time formatter', () => {
  it('words no instant and no number outside src/format', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SRC)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (LOCALE_CALL.test(line) || UTC_SLICE.test(line)) {
            offenders.push(`${file}:${index + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it('finds the formatter module where every page imports it from', () => {
    const files = readdirSync(join(SRC, 'format'));
    expect(files).toContain('when.ts');
    expect(files).toContain('When.tsx');
    expect(files).toContain('number.ts');
  });
});
