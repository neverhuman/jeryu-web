// Playwright configuration for the JeRyu Web Forge SPA (W-T-08).
//
// `webServer` blocks bring up either Vite alone (mocked UI action matrix) or
// the Axum HTTP edge (targeted live BFF smoke). The default is UI-only so an
// isolated jeryu-web checkout does not need the sibling jeryu-deploy workspace.
//
// NOTE: BFF mode runs `cargo run` for the jeryu-api web edge that serves REST
// routes and `/api/v1/ws`. Keep that mode for `@bff` smoke only; matrix-tagged
// UI tests must mock `/api/v1/*` and tolerate/abort WS locally.
//
// Trace / screenshot / video are captured only on failure to keep the
// happy-path runs cheap; the a11y scans (`e2e/10-a11y.spec.ts`) reuse the
// same trace artifacts.

import { defineConfig, devices } from '@playwright/test';

import { resolveE2eWorkers } from './scripts/e2e-workers.mjs';

// `JERYU_PLAYWRIGHT_E2E_MODE` toggles the test target:
//   - `ui-only` (default): launch Vite on a dedicated strict port.
//     Matrix-tagged tests mock all API and WS traffic and are safe in
//     isolated jeryu-web CI.
//   - `bff-only`: point baseURL at the BFF, which serves the built SPA from
//     `web/dist`. Use this only for `@bff` live edge smoke.
//   - `with-vite`: launch both BFF and Vite for local debugging against a
//     live edge with the dev bundle.
//   - `ui-mocked`: serve built `dist` via Vite preview for CI action coverage.
const E2E_MODE = process.env.JERYU_PLAYWRIGHT_E2E_MODE ?? 'ui-only';
const useUiOnly = E2E_MODE === 'ui-only';
const useViteDev = E2E_MODE === 'with-vite';
const useUiMocked = E2E_MODE === 'ui-mocked';
const bffBaseURL = process.env.JERYU_PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8787';
const bffHealthURL = `${bffBaseURL.replace(/\/$/, '')}/health`;
const bffBind = new URL(bffBaseURL).host;
const externalApi = process.env.JERYU_PLAYWRIGHT_EXTERNAL_API === '1';
// Race-free ports. Each Vite server binds port 0, so the kernel hands it a
// free port at bind time: there is no pick-then-bind window two gates on one
// host could race through. Playwright reads the bound port from Vite's own
// "Local:" line (`webServer.wait`), stores the named capture in process.env,
// and starts workers only after that; each worker re-reads this config and
// sees the port. A colour code before the port is tolerated.
const boundPort = (name: string): RegExp =>
  new RegExp(`Local:\\s+(?:\\x1b\\[[0-9;]*m)*http://127\\.0\\.0\\.1:(?:\\x1b\\[[0-9;]*m)*(?<${name}>\\d+)`);
const previewPort = process.env.JERYU_PLAYWRIGHT_PREVIEW_PORT;
const previewBaseURL = previewPort ? `http://127.0.0.1:${previewPort}` : undefined;
const vitePort = process.env.JERYU_PLAYWRIGHT_WEB_PORT;
const viteBaseURL = vitePort ? `http://127.0.0.1:${vitePort}` : undefined;
const baseURL = useUiOnly || useViteDev
  ? viteBaseURL
  : useUiMocked
    ? previewBaseURL
    : bffBaseURL;
const apiCwd = process.env.JERYU_PLAYWRIGHT_API_CWD ?? '../../../jeryu-deploy';
const spaDir =
  process.env.JERYU_PLAYWRIGHT_SPA_DIR ?? '../jeryu-web/apps/web/dist';

const apiWebServer = {
  // Axum HTTP edge (jeryu-api web edge). `JERYU_WEB_TRUST_LOCAL=1`
  // short-circuits the cookie session check so the SPA can fetch
  // `/api/v1/bootstrap` without provisioning a session.
  command:
    `JERYU_WEB_TRUST_LOCAL=1 cargo run --features web -p jeryu-api -- web serve --bind ${bffBind} --spa-dir ${spaDir}`,
  url: bffHealthURL,
  timeout: 180_000,
  reuseExistingServer: !process.env.CI,
  cwd: apiCwd,
};

const viteWebServer = {
  // Vite dev server on a kernel-assigned port (see `boundPort`), so no
  // unrelated dev server can satisfy Playwright's readiness probe.
  command: 'npx vite --host 127.0.0.1 --port 0 --strictPort',
  wait: { stdout: boundPort('jeryu_playwright_web_port') },
  stdout: 'pipe' as const,
  timeout: 60_000,
  reuseExistingServer: !process.env.CI,
  cwd: '.',
};

const previewWebServer = {
  // Vite preview serves the already-built dist tree. The e2e lane builds
  // first, then starts this server with no backend proxy.
  command: 'npx vite preview --host 127.0.0.1 --port 0 --strictPort',
  wait: { stdout: boundPort('jeryu_playwright_preview_port') },
  stdout: 'pipe' as const,
  timeout: 60_000,
  reuseExistingServer: false,
  cwd: '.',
};

const webServer = useUiOnly
  ? [viteWebServer]
  : useViteDev
  ? [apiWebServer, viteWebServer]
  : useUiMocked
    ? [previewWebServer]
  : externalApi
    ? undefined
    : [apiWebServer];

export default defineConfig({
  testDir: './e2e',
  // Default is 30s. On a loaded host the multi-route and a11y scans
  // spend that budget inside Vite's first compile and the retry hits
  // the same wall. 120s is the test budget; a missing element still
  // fails at the expect timeout below.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Each test in the mocked modes brings its own page and its own `/api/v1/*`
  // routes, so tests in one file share nothing and may run on any worker; the
  // required lane is otherwise paced by its longest single file. `bff-only`
  // drives a live edge whose state is shared, so there it stays file-serial.
  fullyParallel: useUiOnly || useUiMocked,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The required lane selects the action matrix and the a11y scans in one
  // invocation (`test:e2e:required`), so both suites share these workers.
  // `fullyParallel: false` only serializes tests within a file, so `bff-only`
  // keeps one worker to stay strictly serial against the shared live edge.
  workers: useUiOnly || useUiMocked ? resolveE2eWorkers(process.env) : 1,
  ...(useUiOnly || useUiMocked ? { grepInvert: /@bff/ } : {}),
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'playwright-report/junit.xml' }],
    ['line'],
  ],
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // `retain-on-failure` screencasts every test and throws the recording
    // away when it passes; the lane is CPU-bound, so pay for the recording
    // only on the retry that follows a failure, as the trace already does.
    video: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // firefox + webkit added once the chromium baseline is stable.
  ],
  ...(webServer ? { webServer } : {}),
});
