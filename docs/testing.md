# Testing

Use the local CI entrypoints before pushing changes:

- `just fast`
- `just check`
- `just score`
- `just security`
- `just artifact-support`

For web UI changes, the required browser lane is the mocked Chromium action
matrix:

- `npm --workspace @jeryu/web run test:e2e:ci`
- `npm --workspace @jeryu/web run ux-qa`

`test:e2e:ci` runs `test:e2e:actions` in `JERYU_PLAYWRIGHT_E2E_MODE=ui-mocked`
and then verifies `apps/web/playwright-report/junit.xml` against
`apps/web/e2e/action-matrix.json`. Tests tagged `@bff` are live edge smoke and
are intentionally excluded from the action matrix; run them with
`npm --workspace @jeryu/web run test:e2e:bff` only when the BFF workspace is
available.

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
