// Covers ops/ci/web-deps.sh, the step that brings a gate tree's node_modules in
// line with the checked-out package-lock.json before any lane runs.
//
// The gate runner reuses one tree across branches, so the interesting case is a
// branch whose lockfile differs from the one the cached node_modules came from:
// without a reinstall the lane below reports the new dependency as a missing
// module. Each case here builds a small workspace with a scripted `npm` on PATH
// and drives the script exactly as pr-ci.sh and e2e.sh do.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const WEB_DEPS = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'ci', 'web-deps.sh');

const trees: string[] = [];

afterEach(() => {
  for (const tree of trees.splice(0)) rmSync(tree, { recursive: true, force: true });
});

interface LockOptions {
  /** Direct dependencies of the apps/web member, name to version. */
  readonly deps: Record<string, string>;
  readonly playwright?: string;
}

function lockfile({ deps, playwright = '1.55.0' }: LockOptions): string {
  const packages: Record<string, unknown> = {
    '': { name: 'fixture-workspace', workspaces: ['apps/web'] },
    'apps/web': { name: '@jeryu/web', dependencies: deps },
    'node_modules/@playwright/test': { version: playwright },
  };
  for (const [name, version] of Object.entries(deps)) {
    packages[`node_modules/${name}`] = { version };
  }
  return JSON.stringify({ name: 'fixture-workspace', lockfileVersion: 3, packages }, null, 2);
}

/**
 * Write a workspace whose node_modules holds `installed` and carries the stamp
 * for `stamped` (the lockfile an earlier gate run installed from).
 */
function makeTree(options: {
  lock: string;
  stamped?: string;
  installed: Record<string, string>;
  /** Packages placed in apps/web/node_modules, shadowing the hoisted copy. */
  member?: Record<string, string>;
  /** `npm ci` fails, as it does on a host that cannot reach the registry. */
  offline?: boolean;
}): string {
  const tree = mkdtempSync(join(tmpdir(), 'web-deps-'));
  trees.push(tree);

  mkdirSync(join(tree, 'apps', 'web'), { recursive: true });
  writeFileSync(join(tree, 'package.json'), JSON.stringify({ workspaces: ['apps/web'] }));
  writeFileSync(join(tree, 'package-lock.json'), options.lock);

  const place = (root: string, packages: Record<string, string>) => {
    for (const [name, version] of Object.entries(packages)) {
      mkdirSync(join(root, name), { recursive: true });
      writeFileSync(join(root, name, 'package.json'), JSON.stringify({ name, version }));
    }
  };
  place(join(tree, 'node_modules'), options.installed);
  if (options.member) place(join(tree, 'apps', 'web', 'node_modules'), options.member);
  if (options.stamped !== undefined) {
    writeFileSync(join(tree, 'node_modules', '.jeryu-lockfile-sha256'), `${options.stamped}\n`);
  }

  // A scripted npm: it records every call, and `ci` rebuilds node_modules from
  // the lockfile the way the real one does.
  mkdirSync(join(tree, 'fakebin'));
  const npm = join(tree, 'fakebin', 'npm');
  writeFileSync(
    npm,
    [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >>"$NPM_CALL_LOG"',
      options.offline ? 'if [ "$1" = ci ]; then exit 1; fi' : '',
      'if [ "$1" = ci ]; then',
      '  rm -rf node_modules',
      '  node --input-type=module <<\'NODE\'',
      "import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
      "const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));",
      'for (const [key, entry] of Object.entries(lock.packages)) {',
      "  if (!key.startsWith('node_modules/')) continue;",
      '  mkdirSync(key, { recursive: true });',
      '  writeFileSync(`${key}/package.json`, JSON.stringify({ version: entry.version }));',
      '}',
      'NODE',
      'fi',
      'exit 0',
    ].join('\n'),
    { mode: 0o755 }
  );
  return tree;
}

interface RunResult {
  readonly status: number;
  readonly stderr: string;
  readonly calls: readonly string[];
}

function run(tree: string, fn: string, env: NodeJS.ProcessEnv = {}): RunResult {
  const log = join(tree, 'npm-calls.log');
  writeFileSync(log, '');
  let status = 0;
  let stderr = '';
  try {
    execFileSync('bash', ['-c', `set -euo pipefail; source "$1"; ${fn}`, '--', WEB_DEPS], {
      cwd: tree,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: '',
        ...env,
        NPM_CALL_LOG: log,
        PATH: `${join(tree, 'fakebin')}:${process.env.PATH ?? ''}`,
      },
    });
  } catch (error) {
    const failure = error as { status?: number; stderr?: string };
    status = failure.status ?? 1;
    stderr = failure.stderr ?? '';
  }
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
  return { status, stderr, calls };
}

function digest(tree: string): string {
  return execFileSync('sha256sum', ['package-lock.json'], { cwd: tree, encoding: 'utf8' }).split(
    ' '
  )[0];
}

function stampOf(tree: string): string {
  return readFileSync(join(tree, 'node_modules', '.jeryu-lockfile-sha256'), 'utf8').trim();
}

describe('ensure_web_deps', () => {
  it('installs nothing when node_modules already came from this lockfile', () => {
    const lock = lockfile({ deps: { dompurify: '3.4.15' } });
    const tree = makeTree({ lock, installed: { dompurify: '3.4.15' } });
    writeFileSync(join(tree, 'node_modules', '.jeryu-lockfile-sha256'), `${digest(tree)}\n`);

    const result = run(tree, 'ensure_web_deps');

    expect(result.status).toBe(0);
    expect(result.calls).toEqual([]);
  });

  it('reinstalls when the branch adds a dependency the cached tree never had', () => {
    // The shape of jeryu-web#74: apps/web/package.json and the root lockfile
    // both gained mermaid, and the tree still held the previous run's install.
    const before = lockfile({ deps: { dompurify: '3.4.15' } });
    const after = lockfile({ deps: { dompurify: '3.4.15', mermaid: '11.17.2' } });
    const tree = makeTree({ lock: before, installed: { dompurify: '3.4.15' } });
    writeFileSync(join(tree, 'node_modules', '.jeryu-lockfile-sha256'), `${digest(tree)}\n`);
    writeFileSync(join(tree, 'package-lock.json'), after);

    const result = run(tree, 'ensure_web_deps');

    expect(result.status).toBe(0);
    expect(result.calls).toEqual(['ci']);
    expect(existsSync(join(tree, 'node_modules', 'mermaid', 'package.json'))).toBe(true);
    expect(stampOf(tree)).toBe(digest(tree));
  });

  it('reinstalls once when a cached tree carries no stamp at all', () => {
    const lock = lockfile({ deps: { dompurify: '3.4.15' } });
    const tree = makeTree({ lock, installed: { dompurify: '3.4.15' } });

    expect(run(tree, 'ensure_web_deps').calls).toEqual(['ci']);
    expect(run(tree, 'ensure_web_deps').calls).toEqual([]);
  });

  it('clears a member tree that would shadow a version the lockfile bumped', () => {
    const before = lockfile({ deps: { dompurify: '3.4.14' } });
    const after = lockfile({ deps: { dompurify: '3.4.15' } });
    const tree = makeTree({
      lock: before,
      installed: { dompurify: '3.4.14' },
      member: { dompurify: '3.4.14' },
    });
    writeFileSync(join(tree, 'node_modules', '.jeryu-lockfile-sha256'), `${digest(tree)}\n`);
    writeFileSync(join(tree, 'package-lock.json'), after);

    const result = run(tree, 'ensure_web_deps');

    expect(result.status).toBe(0);
    expect(existsSync(join(tree, 'apps', 'web', 'node_modules', 'dompurify'))).toBe(false);
  });

  it('fails by name when the host cannot install the new dependency', () => {
    const before = lockfile({ deps: { dompurify: '3.4.15' } });
    const after = lockfile({ deps: { dompurify: '3.4.15', mermaid: '11.17.2' } });
    const tree = makeTree({ lock: before, installed: { dompurify: '3.4.15' }, offline: true });
    writeFileSync(join(tree, 'node_modules', '.jeryu-lockfile-sha256'), `${digest(tree)}\n`);
    writeFileSync(join(tree, 'package-lock.json'), after);

    const result = run(tree, 'ensure_web_deps');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('npm ci failed');
    expect(result.stderr).toContain('mermaid@11.17.2');
  });

  it('rebuilds a stamped tree that another checkout installed into since', () => {
    // The shape of jeryu-web#74's gate on 2026-10-01: the stamp matched the
    // lockfile, but apps/web/node_modules held newer copies some other
    // checkout left behind, and a required package was gone.
    const lock = lockfile({ deps: { dompurify: '3.4.15', mermaid: '11.17.2' } });
    const tree = makeTree({
      lock,
      installed: { dompurify: '3.4.15' },
      member: { dompurify: '3.9.0' },
    });
    writeFileSync(join(tree, 'node_modules', '.jeryu-lockfile-sha256'), `${digest(tree)}\n`);

    const result = run(tree, 'ensure_web_deps');

    expect(result.status).toBe(0);
    expect(result.calls).toEqual(['ci']);
    expect(existsSync(join(tree, 'apps', 'web', 'node_modules', 'dompurify'))).toBe(false);
    expect(existsSync(join(tree, 'node_modules', 'mermaid', 'package.json'))).toBe(true);
    expect(stampOf(tree)).toBe(digest(tree));
  });

  it('refuses to hand a lane a stamped tree that a rebuild cannot repair', () => {
    const lock = lockfile({ deps: { dompurify: '3.4.15', mermaid: '11.17.2' } });
    const tree = makeTree({ lock, installed: { dompurify: '3.4.15' }, offline: true });
    writeFileSync(join(tree, 'node_modules', '.jeryu-lockfile-sha256'), `${digest(tree)}\n`);

    const result = run(tree, 'ensure_web_deps');

    expect(result.status).not.toBe(0);
    expect(result.calls).toEqual(['ci', 'ci --prefer-online']);
    expect(result.stderr).toContain('mermaid@11.17.2');
  });
});

describe('ensure_playwright_browsers', () => {
  function browserCache(tree: string, options: { stamp?: string; chromium?: boolean }): string {
    const cache = join(tree, 'browsers');
    mkdirSync(cache, { recursive: true });
    if (options.chromium) mkdirSync(join(cache, 'chromium-1200'), { recursive: true });
    if (options.stamp) writeFileSync(join(cache, '.jeryu-playwright-version'), `${options.stamp}\n`);
    return cache;
  }

  it('installs nothing when the cache already holds the pinned version', () => {
    const tree = makeTree({ lock: lockfile({ deps: {} }), installed: {} });
    const cache = browserCache(tree, { stamp: '1.55.0', chromium: true });

    const result = run(tree, 'ensure_playwright_browsers', { PLAYWRIGHT_BROWSERS_PATH: cache });

    expect(result.status).toBe(0);
    expect(result.calls).toEqual([]);
  });

  it('installs the browser build again when the branch bumps playwright', () => {
    const tree = makeTree({
      lock: lockfile({ deps: {}, playwright: '1.56.1' }),
      installed: {},
    });
    const cache = browserCache(tree, { stamp: '1.55.0', chromium: true });

    const result = run(tree, 'ensure_playwright_browsers', { PLAYWRIGHT_BROWSERS_PATH: cache });

    expect(result.status).toBe(0);
    expect(result.calls).toEqual(['--workspace @jeryu/web exec -- playwright install chromium']);
    expect(readFileSync(join(cache, '.jeryu-playwright-version'), 'utf8').trim()).toBe('1.56.1');
  });

  it('provisions system dependencies on a CI runner', () => {
    const tree = makeTree({ lock: lockfile({ deps: {} }), installed: {} });
    const cache = browserCache(tree, {});
    const result = run(tree, 'ensure_playwright_browsers', {
      CI: 'true',
      PLAYWRIGHT_BROWSERS_PATH: cache,
    });
    expect(result.status).toBe(0);
    expect(result.calls).toEqual(['--workspace @jeryu/web exec -- playwright install --with-deps chromium']);
  });
});
