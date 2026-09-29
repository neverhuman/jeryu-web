// verifyE2eActionMatrix.test.ts — the action matrix is a two-way contract.
//
// Deleting or merging an e2e test must carry its `@action:` tags forward, so
// the verifier has to fail both ways: a matrix entry no Playwright test
// reports, and a reported tag the matrix never declared.

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
// Vitest runs with `apps/web` as its root (see vitest.config.ts).
const script = path.resolve('scripts/verify-e2e-action-matrix.mjs');

let dir: string;

function matrix(ids: string[]): string {
  return JSON.stringify({
    actions: ids.map((id) => ({
      id,
      route: `/${id}`,
      surface: 'web',
      action: id,
      testTag: `@action:${id}`,
      owner: 'web',
    })),
  });
}

function junit(tags: string[]): string {
  const cases = tags
    .map((tag) => `<testcase name="does a thing @action:${tag}" />`)
    .join('');
  return `<testsuites><testsuite>${cases}</testsuite></testsuites>`;
}

async function verify(
  actionIds: string[],
  reportedTags: string[]
): Promise<{ code: number; stderr: string }> {
  const matrixPath = path.join(dir, 'matrix.json');
  const junitPath = path.join(dir, 'junit.xml');
  await writeFile(matrixPath, matrix(actionIds));
  await writeFile(junitPath, junit(reportedTags));
  try {
    await run(process.execPath, [
      script,
      '--matrix',
      matrixPath,
      '--junit',
      junitPath,
    ]);
    return { code: 0, stderr: '' };
  } catch (error) {
    const failure = error as { code?: number; stderr?: string };
    return { code: failure.code ?? 1, stderr: failure.stderr ?? '' };
  }
}

describe('verify-e2e-action-matrix', () => {
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'action-matrix-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('passes when every declared action is reported and nothing else is', async () => {
    const result = await verify(['repo.overview', 'repo.route_pulls'], [
      'repo.overview',
      'repo.route_pulls',
    ]);
    expect(result.code).toBe(0);
  });

  it('fails on a declared action no test reports', async () => {
    const result = await verify(['repo.overview', 'repo.route_pulls'], [
      'repo.overview',
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Missing Playwright action coverage');
    expect(result.stderr).toContain('@action:repo.route_pulls');
  });

  it('fails on a reported tag the matrix does not declare', async () => {
    const result = await verify(['repo.overview'], [
      'repo.overview',
      'repo.route_pulls',
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not declared in the matrix');
    expect(result.stderr).toContain('@action:repo.route_pulls');
  });

  it('counts several tags on one test name, so merged tests still cover', async () => {
    const matrixPath = path.join(dir, 'matrix.json');
    const junitPath = path.join(dir, 'junit.xml');
    await writeFile(matrixPath, matrix(['repo.overview', 'repo.route_pulls']));
    await writeFile(
      junitPath,
      '<testsuites><testsuite><testcase name="every repo sub-path resolves ' +
        '@action:repo.overview @action:repo.route_pulls" /></testsuite></testsuites>'
    );
    await expect(
      run(process.execPath, [
        script,
        '--matrix',
        matrixPath,
        '--junit',
        junitPath,
      ])
    ).resolves.toBeTruthy();
  });
});
