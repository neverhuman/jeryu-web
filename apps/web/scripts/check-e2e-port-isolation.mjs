#!/usr/bin/env node
// check-e2e-port-isolation.mjs — regression check for the hosted gate
// failure "http://127.0.0.1:4173 is already used" (web #125 and #126), where
// two gates on one runner host raced for one fixed preview port.
//
// It holds 127.0.0.1:4173 with an HTTP server for the whole check, as an old
// fixed-port gate would, and fails if it cannot. Then it runs ROUNDS rounds
// of two concurrent ui-mocked Playwright runs, each with --retries=0 so a CI
// retry cannot hide a failure. Every run must pass, and in each round the two
// runs must report distinct ports that are not 4173. The port each run used
// is read from its preview server's own "Local:" line.

import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import console from 'node:console';

const OLD_FIXED_PORT = 4173;
const ROUNDS = 3;
const RUN_BOUND_MS = 180_000; // a hang guard, not a retry

function fail(message) {
  console.error(`e2e port isolation: ${message}`);
  process.exit(1);
}

// Answer like another gate's preview server would.
const blocker = http.createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end('<!doctype html><title>another gate</title>');
});
await new Promise((resolve) => {
  blocker.once('error', (error) =>
    fail(`cannot hold ${OLD_FIXED_PORT} (${error.code}); this check would prove nothing`)
  );
  blocker.listen({ host: '127.0.0.1', port: OLD_FIXED_PORT }, resolve);
});

/** One gate's e2e run; resolves with its exit code and bound port. */
function gate(label) {
  const output = mkdtempSync(path.join(tmpdir(), `jeryu-e2e-${label}-`));
  return new Promise((resolve) => {
    const child = spawn(
      'npx',
      [
        'playwright',
        'test',
        '--project=chromium',
        'e2e/01-bootstrap.spec.ts',
        '--retries=0',
        '--workers=1',
        '--reporter=line',
        `--output=${output}`,
      ],
      {
        // No colour, so the "Local:" line is plain text.
        env: { ...process.env, JERYU_PLAYWRIGHT_E2E_MODE: 'ui-mocked', NO_COLOR: '1', FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let log = '';
    const collect = (chunk) => {
      log += chunk.toString();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => child.kill('SIGKILL'), RUN_BOUND_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      rmSync(output, { recursive: true, force: true });
      const port = /Local:\s+http:\/\/127\.0\.0\.1:(\d+)/.exec(log)?.[1];
      resolve({ label, code, port, log });
    });
  });
}

const seen = [];
for (let round = 1; round <= ROUNDS; round += 1) {
  const runs = await Promise.all([gate(`r${round}a`), gate(`r${round}b`)]);
  for (const run of runs) {
    if (run.code !== 0) {
      console.error(run.log.slice(-4000));
      fail(`round ${round}: run ${run.label} exited ${run.code}`);
    }
    if (!run.port) fail(`round ${round}: run ${run.label} reported no bound port`);
    if (run.port === String(OLD_FIXED_PORT)) fail(`round ${round}: run ${run.label} used ${OLD_FIXED_PORT}`);
  }
  if (runs[0].port === runs[1].port) fail(`round ${round}: both runs bound ${runs[0].port}`);
  seen.push(runs.map((run) => run.port).join('+'));
}
blocker.close();
console.log(
  `e2e port isolation: ${ROUNDS} rounds of 2 concurrent runs, 0 failures, ` +
    `ports ${seen.join(', ')}, while ${OLD_FIXED_PORT} was held`
);
