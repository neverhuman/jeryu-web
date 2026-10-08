// e2e-workers.mjs — how many Playwright workers the browser lane may use.
//
// The required lane runs the action matrix and the a11y scans in one
// invocation, so the worker count decides the lane's wall time. jeryu governs
// concurrency from live load: `ops/ci/pr-ci.sh` resolves `JERYU_CI_JOBS` from
// `jeryu-ci-governor` and exports it, so that number — not the core count — is
// what this lane is allowed to take. `JERYU_PLAYWRIGHT_WORKERS` overrides it
// for a single run.
//
// A worker is a Chromium instance, and one of those takes more than a single
// CPU once the page paints and axe walks the tree: measured on the gate host,
// the suite reaches the lane's whole CPU budget at three quarters as many
// workers as governed jobs, and runs *slower* above that. So the governed job
// count is scaled, not used as-is, and capped: a host that governs 64 jobs
// would otherwise launch 64 browsers for a suite that stops gaining long
// before that.

/** Most workers the browser lane takes, however many jobs are governed. */
export const MAX_E2E_WORKERS = 8;

/** Workers to use when neither variable says otherwise. */
export const DEFAULT_E2E_WORKERS = 4;

/** Workers per governed job: a browser worker costs more than one CPU. */
export const WORKERS_PER_JOB = 3 / 4;

/**
 * Resolve the Playwright worker count from the environment.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {number} a worker count in [1, MAX_E2E_WORKERS]
 */
export function resolveE2eWorkers(env = {}) {
  // An explicit count is a person or a script asking for exactly that many;
  // only the governed number is capped.
  const explicit = positiveInteger(env.JERYU_PLAYWRIGHT_WORKERS);
  if (explicit !== undefined) return explicit;
  const governed = positiveInteger(env.JERYU_CI_JOBS);
  if (governed !== undefined) {
    return clamp(Math.max(1, Math.floor(governed * WORKERS_PER_JOB)));
  }
  return DEFAULT_E2E_WORKERS;
}

function positiveInteger(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return undefined;
  return value;
}

function clamp(value) {
  return Math.min(value, MAX_E2E_WORKERS);
}
