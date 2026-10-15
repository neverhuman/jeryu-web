#!/usr/bin/env node
// ensure-dist.mjs — build the SPA before a browser lane, unless the caller has
// just built it. The browser lanes serve `dist`, so run on their own they must
// build first; inside the gate (ops/ci/pr-ci.sh, ops/ci/e2e.sh) the build has
// already run and a second one only costs time. Those callers export
// JERYU_WEB_DIST_FRESH=1 straight after their build. A missing dist always
// builds, whatever the variable says.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.env.JERYU_WEB_DIST_FRESH === '1' && existsSync(path.join(webRoot, 'dist', 'index.html'))) {
  process.exit(0);
}
const result = spawnSync('npm', ['run', 'build'], { cwd: webRoot, stdio: 'inherit' });
process.exit(result.status ?? 1);
