// contractMirrorLock.test.ts — runs the family contract compatibility check
// (ADR 0015) against the real mirror and against a copy with a removed and a
// changed file, so the failure names the consumer and classifies the change.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const script = join(repoRoot, 'ops/ci/contract_compat.sh');

function run(root: string) {
  return spawnSync('sh', [script], {
    env: { ...process.env, JERYU_CONTRACT_ROOT: root },
    encoding: 'utf8',
  });
}

describe('contract mirror lock', () => {
  it('accepts the committed mirror', () => {
    const r = run(repoRoot);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('rejects a removed and a changed mirror file, naming the consumer', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'contract-lock-'));
    try {
      mkdirSync(join(tmp, 'contracts'));
      cpSync(join(repoRoot, 'contracts/generated'), join(tmp, 'contracts/generated'), {
        recursive: true,
      });
      cpSync(join(repoRoot, 'contracts/generated.lock'), join(tmp, 'contracts/generated.lock'));
      rmSync(join(tmp, 'contracts/generated/AccessSettings.ts'));
      writeFileSync(join(tmp, 'contracts/generated/AgentPosture.ts'), 'export type AgentPosture = never;\n');
      writeFileSync(join(tmp, 'contracts/generated/BrandNew.ts'), 'export type BrandNew = string;\n');
      const r = run(tmp);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('consumer jeryu-web');
      expect(r.stderr).toMatch(/removed \(breaking for consumer jeryu-web\): AccessSettings\.ts/);
      expect(r.stderr).toMatch(/changed .*: AgentPosture\.ts/);
      expect(r.stderr).toMatch(/added \(additive\): BrandNew\.ts/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
