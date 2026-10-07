// jeryu-deploy pins jeryu-web by commit plus a sha256 over the whole dist
// (scripts/release in jeryu-deploy hashes a sorted `sha256sum` manifest and
// refuses a dist whose hash is not the locked one). So `vite build` must be a
// pure function of the commit: two builds of one tree have to agree file for
// file. This case builds twice into scratch directories and compares the same
// manifest the release build computes.
//
// It caught the random `import.meta.ROLLDOWN_FILE_URL_<id>` the bundler stamps
// into every asset module and leaves in the source maps' `sourcesContent`;
// vite.config.ts pins those to the asset's emitted file name.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

/** apps/web: src/build -> src -> web. */
const WEB_ROOT = join(import.meta.dirname, '..', '..');
const SCRATCH = join(WEB_ROOT, '.reproducibility');

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

function filesUnder(root: string, dir = root): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(root, path) : [relative(root, path)];
  });
}

/** The release build's manifest: `<sha256>  <path>` per file, paths sorted. */
function manifest(dist: string): string {
  return filesUnder(dist)
    .sort()
    .map((path) => `${createHash('sha256').update(readFileSync(join(dist, path))).digest('hex')}  ${path}`)
    .join('\n');
}

function build(name: string): string {
  const outDir = join(SCRATCH, name);
  mkdirSync(outDir, { recursive: true });
  execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: WEB_ROOT,
    encoding: 'utf8',
    env: { ...process.env, JERYU_WEB_COMMIT: '0'.repeat(40) },
  });
  return outDir;
}

describe('dist reproducibility', () => {
  it(
    'builds the same tree to byte-identical files twice',
    () => {
      const first = manifest(build('first'));
      const second = manifest(build('second'));
      expect(second.split('\n')).toEqual(first.split('\n'));
      expect(first).not.toBe('');
    },
    600_000
  );
});
