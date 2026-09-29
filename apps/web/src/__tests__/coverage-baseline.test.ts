// Guard for the vitest coverage baseline.
//
// The suite is judged against what it reaches, so the coverage block in
// `vitest.config.ts` has to stay wired: a v8 provider, a reporter that writes
// a machine-readable summary, and per-metric floors at or above the recorded
// baseline. vitest itself enforces the floors at run time; this test fails if
// the configuration that carries them is dropped or lowered, so the baseline
// can only ever move up.
//
// The config is read as text rather than imported: importing it would pull
// vite (and its esbuild binary) into the jsdom worker, which is not what this
// assertion is about.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** Floors recorded when coverage was first measured (2026-09-29). */
const BASELINE = {
  lines: 77,
  statements: 76,
  branches: 70,
  functions: 74,
} as const;

/** Root of the `@jeryu/web` workspace (this file's grandparent). */
const WEB_ROOT = join(import.meta.dirname, '..', '..');

const configSource = readFileSync(join(WEB_ROOT, 'vitest.config.ts'), 'utf8');

const manifest = JSON.parse(readFileSync(join(WEB_ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

/** The floor `vitest.config.ts` declares for one coverage metric. */
function configuredFloor(metric: string): number {
  const match = new RegExp(`\\b${metric}:\\s*(\\d+(?:\\.\\d+)?)`).exec(configSource);
  expect(match, `vitest.config.ts must declare a ${metric} threshold`).not.toBeNull();
  return Number(match![1]);
}

describe('coverage baseline', () => {
  it('runs the v8 provider', () => {
    expect(configSource).toContain("provider: 'v8'");
  });

  it('emits a machine-readable summary alongside the human one', () => {
    expect(configSource).toContain("'json-summary'");
  });

  it.each(Object.entries(BASELINE))('holds the %s floor at or above baseline', (metric, floor) => {
    expect(configuredFloor(metric)).toBeGreaterThanOrEqual(floor);
  });

  it('is reachable through the test:coverage script', () => {
    expect(manifest.scripts['test:coverage']).toContain('--coverage');
    expect(manifest.devDependencies['@vitest/coverage-v8']).toBeDefined();
  });
});
