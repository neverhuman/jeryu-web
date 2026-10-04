// One builder for repository URLs.
//
// `/repos/<host>/<owner>/<name>/…` is spelled once, by `repoUrl` in
// `pages/repoBrowserModel.ts`. A link assembled anywhere else is how a hard
// -coded forge name gets back in: the page names one host while the repository
// it points at is on another. This guard walks the hand-written front-end and
// the e2e fixtures and fails on a repository path built from a template.
//
// Scope notes:
//   * Only non-test source counts. Tests and stories spell exact paths as
//     fixtures, which is what they are for.
//   * The builder's own module is the one place allowed to assemble the path.
//   * A server route (`/api/v1/repos/<id>/…`) is not an in-app link.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The hand-written front-end source, and the e2e fixtures beside it. */
const ROOTS = [join(import.meta.dirname, '..'), join(import.meta.dirname, '..', '..', 'e2e')];

const SKIP_DIRS = new Set(['node_modules', '__snapshots__']);

/** The one module allowed to assemble a repository path. */
const BUILDER = join('src', 'pages', 'repoBrowserModel.ts');

function isExemptFile(path: string): boolean {
  return (
    /\.(test|spec|stories)\.[cm]?[jt]sx?$/.test(path) ||
    /[\\/]__tests__[\\/]/.test(path) ||
    path.endsWith(BUILDER) ||
    path.endsWith('.snap')
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

describe('one repository URL builder', () => {
  it('builds no repository path by hand outside repoBrowserModel', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of collectSourceFiles(root)) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
          // An app path starts the literal; `/api/v1/repos/<id>/…` and the
          // other server routes do not and are none of this guard's business.
          if (/['"`]\/repos\/\$\{/.test(line)) {
            offenders.push(`${file}:${index + 1}: ${line.trim()}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
