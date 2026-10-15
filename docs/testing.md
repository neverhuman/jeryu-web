# Testing

Use the local CI entrypoints before pushing changes:

- `just fast`
- `just check`
- `just score`
- `just security`
- `just artifact-support`

For web UI changes, the required browser lane is the mocked Chromium action
matrix (build the SPA first):

- `npm --workspace @jeryu/web run build`
- `npm --workspace @jeryu/web run test:e2e:ci`
- `npm --workspace @jeryu/web run ux-qa`

`test:e2e:ci` runs `test:e2e:required` in `JERYU_PLAYWRIGHT_E2E_MODE=ui-mocked`
and then verifies `apps/web/playwright-report/junit.xml` against
`apps/web/e2e/action-matrix.json`. `test:e2e:required` is one Playwright
invocation over both required suites: the `@action:`-tagged matrix and the
`@a11y`-tagged axe scans of `e2e/10-a11y.spec.ts`. One invocation means one
built-SPA server, one report, and both suites sharing the lane's workers, which
is why every describe in the a11y spec carries `@a11y`
(`apps/web/scripts/e2e-suite-selection.test.mjs` holds that). Either suite still
runs on its own: `test:e2e:actions` and `test:e2e:a11y`.

The gate builds the SPA once. `ops/ci/pr-ci.sh` exports
`JERYU_WEB_DIST_FRESH=1` after its build, and the browser lanes
(`apps/web/scripts/ensure-dist.mjs`) then serve that dist instead of building
again; run on their own, they build first. Straight after that build,
`ops/ci/dist-reproducible.sh` builds once more and requires identical files,
because jeryu-deploy pins the dist by content hash. For a release candidate,
`just reproducible-build` is the stronger check (two clones, fresh installs).

The lane's worker count comes from `apps/web/scripts/e2e-workers.mjs`: the
governed `JERYU_CI_JOBS` scaled down, since a Chromium worker costs more than
one CPU, and capped. `JERYU_PLAYWRIGHT_WORKERS=<n>` overrides it for one run.
In the mocked modes every test brings its own page and its own `/api/v1/*`
routes, so the run is fully parallel; `bff-only` drives shared live state and
stays file-serial.

Tests tagged `@bff` are live edge smoke and are intentionally excluded from the
action matrix; run them with `npm --workspace @jeryu/web run test:e2e:bff` only
when the BFF workspace is available.

Specs import `test` and `expect` from `apps/web/e2e/fixtures/test.ts`, never
from `@playwright/test` directly. That `test` serves the app's own files to the
page from the Node test process, so a host network change (any Docker container
starting or stopping on a shared box makes Chromium abort in-flight requests
with `net::ERR_NETWORK_CHANGED`) cannot stop the SPA from mounting mid-test.

That `test` also answers the app's WebSocket (`/api/v1/ws`) inside the
browser through `page.routeWebSocket`, so no socket reaches the dev proxy or
whatever sits behind it. The connection is accepted and silent by default; a
spec that tests live updates takes the `realtime` fixture
(`apps/web/e2e/fixtures/realtime.ts`) and pushes frames with `hello()` and
`event()`. `e2e/33-realtime-socket.spec.ts` proves no upgrade leaves the
browser.

`scripts/ci-local.sh` delegates to the same `ops/ci/*.sh` lanes used by the
GitHub workflow. `scripts/ci-doctor.sh` checks the required local tools.

Agent-readable exception guidance:

- purpose: every typed error documents the caller-facing failure purpose
- reason: failures preserve enough context for local diagnosis
- common fixes: map repeated failures to a small set of operator repairs
- docs_url: point users to this file or a narrower runbook
- repair_hint: state the next command or config change to try

Cost and bounded-operation policy: budget, quota, spend cap, kill switch, and
stop condition evidence must be added before introducing paid or unbounded
network operations.


## Public pages and Rust flow CI

`bash ops/ci/web-flows.sh` drives the built SPA through Rust/ChromeDriver and an
in-process Rust fixture server. It covers public home, inline and direct login,
signup navigation, waitlist success/repeat/validation/errors, HTTP request
bodies, opacity restoration, the shared grid, and rendered leftward motion.
The standalone test crate is `apps/web/tests/web-flows`; it imports no backend
workspace or SDK. Its locked dependencies and matched browser pair are cached
by the independent `Rust public web flows` job. See its README for local setup.

`bash ops/ci/frontend-checks.sh` reproduces the independent `Frontend checks`
job: locked npm dependencies, typecheck, lint, unit coverage, type contracts,
production build, the full rendered action matrix, accessibility, Storybook,
UX evidence, and the existing security lane. Browser action/a11y tests use the
built SPA (`ui-mocked`); Vite development mode remains available for debugging.
Keep the action matrix based on the target branch so unrelated feature tags
cannot be added accidentally.

The original `local` job and native `jeryu-web/required` gate still require the
governed Jankurai installation and receipt. The front-end jobs grant no audit,
merge, or release authority. A hosted runner without that installation fails
before the canonical gate; do not bypass the verifier to make it green. Runner
provisioning is tracked in https://github.com/neverhuman/jeryu-web/issues/2.
All checks, including that existing job, must pass before this PR is ready.

The owner-path endpoint is exercised through the authenticated Axum router in
jeryu-deploy's `web::tests::browser_link_tests::owner_paths_are_served_to_readers_without_private_repository_disclosure`.
Its handler tests also check administrator protection settings and their masking
for other readers. The web route-index fixture checks client spelling only; it
is not evidence that a running server provides the route. Older servers may
answer 404, in which case the optional panel remains hidden without retries.
