// Guard for `ops/ci/tracked-ignored.sh`.
//
// A shift once force-added the vitest coverage output that `apps/web/.gitignore`
// excludes. Every gate run rewrote those files, found a dirty tree, and re-gated
// the pull request every few minutes. The script stops that at the worker's own
// gate; these tests build a scratch repository and prove it.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

/** Repository root: src/__tests__ -> src -> web -> apps -> root. */
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const SCRIPT = join(REPO_ROOT, 'ops', 'ci', 'tracked-ignored.sh');

const scratchDirs: string[] = [];

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A scratch repository that ignores `coverage/` and has one committed file. */
function scratchRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'jeryu-tracked-ignored-'));
  scratchDirs.push(dir);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '--quiet');
  git('config', 'user.email', 'gate@example.invalid');
  git('config', 'user.name', 'Gate');
  writeFileSync(join(dir, '.gitignore'), 'coverage\n');
  writeFileSync(join(dir, 'README.md'), 'scratch\n');
  git('add', '.gitignore', 'README.md');
  git('commit', '--quiet', '-m', 'scratch');
  return dir;
}

function runCheck(dir: string) {
  return spawnSync('bash', [SCRIPT, dir], { encoding: 'utf8' });
}

describe('tracked-but-ignored check', () => {
  it('passes on a tree whose tracked files are all unignored', () => {
    const result = runCheck(scratchRepo());
    expect(result.status).toBe(0);
  });

  it('fails and names a force-added ignored file', () => {
    const dir = scratchRepo();
    writeFileSync(join(dir, 'coverage'), 'generated\n');
    execFileSync('git', ['add', '-f', 'coverage'], { cwd: dir });

    const result = runCheck(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('coverage');
    expect(result.stderr).toContain('.gitignore');
  });

  it('runs on this repository and finds nothing tracked that is ignored', () => {
    const result = spawnSync('bash', [SCRIPT], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
