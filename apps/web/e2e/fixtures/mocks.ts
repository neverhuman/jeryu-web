// mocks.ts — Playwright route-mocking helpers (W-T-12..17).
// Generated API mocks stay aligned with generated contract types here and
// with the MSW mock service worker component-test fixtures in src/test/.
//
// These helpers wrap `page.route(...)` so individual specs can mock out
// `/api/v1/*` JSON endpoints without sharing fragile cross-test state. The
// fixtures here intentionally do NOT depend on the real backend — Phase 3
// services may still be partially live. When a test wants the SPA to
// exercise the BFF and tolerate 502/404, omit the mock and let the live
// route through.
//
// Convention:
//   * Each helper takes the `page` plus the JSON payload to serve.
//   * Routes are registered with `page.route(...)` so they are scoped to a
//     single test's `BrowserContext`.
//   * Mocks return ApiError envelopes for non-2xx codes so the SPA's
//     ErrorState pulls a meaningful `code` / `message`.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page, Route } from '@playwright/test';
import type { RunnerFabricResponse } from '../../src/api/types';

// Playwright 1.60's bundled TS compilation treats fixture files as ESM, so
// `__dirname` is unavailable. Resolve the JSON fixture relative to the
// helper file via `import.meta.url`.
const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP_FIXTURE_PATH = path.resolve(
  FIXTURES_DIR,
  'data',
  'bootstrap.json'
);
const bootstrapJson = JSON.parse(
  readFileSync(BOOTSTRAP_FIXTURE_PATH, 'utf8')
) as Record<string, unknown> & {
  viewer: {
    login: string;
    display_name: string | null;
    global_permissions: string[];
    [key: string]: unknown;
  };
};

async function mockUnhandledApi(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route: Route, request) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'unmocked_e2e_api',
          message: `No Playwright mock handled ${request.method()} ${new URL(request.url()).pathname}.`,
        },
      }),
    });
  });
}

export interface ViewerOverride {
  /** Replace the bootstrap viewer.login. */
  login?: string;
  /** Replace the bootstrap viewer.display_name. */
  display_name?: string;
  /** Replace the entire viewer.global_permissions array. */
  global_permissions?: string[];
  /**
   * AuthProvider mock for the same viewer. Pass `null` when a spec owns
   * `/api/v1/auth/me` itself, for example signed-out or forced-change tests.
   */
  auth?: {
    role?: 'admin' | 'user';
    mustChangePassword?: boolean;
    csrfToken?: string | null;
  } | null;
}

async function mockAuthMeForViewer(
  page: Page,
  viewer: ViewerOverride = {}
): Promise<void> {
  await page.route('**/api/v1/auth/me', async (route: Route, request) => {
    if (request.method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        login: viewer.login ?? bootstrapJson.viewer.login,
        role: viewer.auth?.role ?? 'user',
        mustChangePassword: viewer.auth?.mustChangePassword ?? false,
        csrfToken: viewer.auth?.csrfToken ?? 'e2e-csrf',
      }),
    });
  });
}

/**
 * Mock `GET /api/v1/bootstrap` so the SPA boots in a fully deterministic
 * state regardless of whether the backend is live. The default body is the
 * canonical Phase 2 fixture (`fixtures/data/bootstrap.json`); pass
 * `viewer` to override individual fields.
 */
export async function mockBootstrap(
  page: Page,
  viewer: ViewerOverride = {}
): Promise<void> {
  await mockUnhandledApi(page);
  if (viewer.auth !== null) {
    await mockAuthMeForViewer(page, viewer);
  }
  await page.route('**/api/v1/bootstrap', async (route: Route) => {
    const body = JSON.parse(JSON.stringify(bootstrapJson));
    if (viewer.login !== undefined) body.viewer.login = viewer.login;
    if (viewer.display_name !== undefined) {
      body.viewer.display_name = viewer.display_name;
    }
    if (viewer.global_permissions !== undefined) {
      body.viewer.global_permissions = viewer.global_permissions;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

/** A `PoolRollup`-shaped object as it serializes onto the bootstrap `tui`. */
export interface MockPoolRollup {
  pool: string;
  tags?: string[];
  trust_tier?: string;
  paused?: boolean;
  queued_jobs?: number;
  running_jobs?: number;
  failed_jobs?: number;
  active_slots?: number;
  configured_max_slots?: number;
  online_runners?: number;
  stuck_runners?: number;
}

/**
 * Mock `GET /api/v1/bootstrap` with a populated `tui.pool_activity` +
 * `tui.system` snapshot so the /fleet page paints pool cards + the
 * system-health strip on first paint (the WS spine layers live deltas on top,
 * but Playwright cannot inject raw WS frames — see 08-ws-reconnect.spec.ts —
 * so the bootstrap snapshot is the deterministic e2e surface for /fleet).
 */
export async function mockFleetBootstrap(
  page: Page,
  pools: MockPoolRollup[],
  /** The viewer this bootstrap is for; a spec driving an admin says so here. */
  viewer: ViewerOverride = {}
): Promise<void> {
  await mockUnhandledApi(page);
  if (viewer.auth !== null) await mockAuthMeForViewer(page, viewer);
  await page.route('**/api/v1/bootstrap', async (route: Route) => {
    const body = JSON.parse(JSON.stringify(bootstrapJson)) as Record<
      string,
      unknown
    > & { tui?: Record<string, unknown> };
    const normalizedPools = pools.map((p) => ({
      pool: p.pool,
      tags: p.tags ?? [],
      trust_tier: p.trust_tier ?? 'trusted',
      paused: p.paused ?? false,
      queued_jobs: p.queued_jobs ?? 0,
      running_jobs: p.running_jobs ?? 0,
      failed_jobs: p.failed_jobs ?? 0,
      active_slots: p.active_slots ?? 0,
      configured_max_slots: p.configured_max_slots ?? p.active_slots ?? 0,
      online_runners: p.online_runners ?? 0,
      stuck_runners: p.stuck_runners ?? 0,
    }));
    body.tui = {
      generated_at: new Date().toISOString(),
      pool_activity: {
        repos: [{ repo: 'veox/redline', pools: pools.map((p) => p.pool) }],
        pools: normalizedPools,
        unplaceable: [],
        freshness: null,
      },
      system: {
        scm: { name: 'scm', status: 'healthy', latency_ms: 8, detail: null },
        database: {
          name: 'database',
          status: 'healthy',
          latency_ms: 2,
          detail: null,
        },
        sandbox: {
          name: 'sandbox',
          status: 'degraded',
          latency_ms: null,
          detail: 'slow',
        },
        cache: { name: 'cache', status: 'healthy', latency_ms: 1, detail: null },
        vault: { name: 'vault', status: 'warning', latency_ms: null, detail: null },
        runners: { online: 4, busy: 1, idle: 3, degraded: 0 },
      },
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

export async function mockControlPlaneRunners(
  page: Page,
  response: RunnerFabricResponse
): Promise<void> {
  await page.route('**/api/v1/control-plane/runners', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

export interface MockMirrorStatus {
  configured: boolean;
  last_attempt_at?: string | null;
  last_attempt_ok?: boolean;
  last_attempt_conclusion?: string | null;
  last_success_at?: string | null;
}

export interface MockRepoSummary {
  id: { host: string; owner: string; name: string };
  default_branch?: string;
  description?: string | null;
  visibility?: 'public' | 'internal' | 'private';
  family?: string | null;
  archived?: boolean;
  repo_role?: 'public_portal' | 'split_member' | null;
  topics?: string[];
  open_pull_requests?: number;
  failing_checks?: number;
  /** `warning` when the default branch has failing checks, else `healthy`. */
  health?: string;
  running_jobs?: number;
  active_agents?: number;
  jankurai_score?: number | null;
  jankurai_decision?: string | null;
  jankurai_scored_at?: string | null;
  mirror?: MockMirrorStatus | null;
  available_actions?: Array<{
    action_id: string;
    label: string;
    risk: string | null;
  }>;
}

/**
 * Mock `GET /api/v1/repos` with a list of repositories. The shape mirrors
 * the contract in `RepositoryListResponse` (`generated_at` / `total` /
 * `repositories` / `facets`) so the SPA picks them up without an envelope
 * translation layer. Only the base `/api/v1/repos` (with or without a
 * query string) is intercepted — sub-paths (`/repos/{id}/...`) must fall
 * through to per-resource mocks or the live BFF.
 */
export async function mockRepoList(
  page: Page,
  repos: MockRepoSummary[],
  options: { search?: boolean } = {}
): Promise<void> {
  const repositories = repos.map((r) => normalizeRepo(r));
  const hosts = Array.from(new Set(repos.map((r) => r.id.host)));
  const families = Array.from(
    new Set(
      repos
        .map((r) => r.family)
        .filter((f): f is string => typeof f === 'string' && f.length > 0)
    )
  );
  await page.route('**/api/v1/repos**', async (route: Route, request) => {
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    const url = new URL(request.url());
    // Only the base /api/v1/repos collection — bail out for sub-resources
    // like /api/v1/repos/{id}, /api/v1/repos/{id}/tree, etc.
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 3) {
      await route.fallback();
      return;
    }
    // Honour the `?family=` filter like the real backend so the family
    // drill-down page sees only the matching members.
    const familyFilter = url.searchParams.get('family');
    // And `?archived=1` like the real backend: the Archived filter lists only
    // archived repositories, the default list only unarchived ones.
    const archivedOnly = url.searchParams.get('archived') === '1';
    // With `search`, `?q=` matches name and description like the real search.
    const q = options.search ? (url.searchParams.get('q') ?? '').toLowerCase() : '';
    const filtered = (
      familyFilter
        ? repositories.filter(
            (r) => (r as { family: string | null }).family === familyFilter
          )
        : repositories
    )
      .filter((r) => (r as { archived: boolean }).archived === archivedOnly)
      .filter((r) => {
        if (!q) return true;
        const row = r as { id: { owner: string; name: string }; description?: string | null };
        return `${row.id.owner}/${row.id.name} ${row.description ?? ''}`.toLowerCase().includes(q);
      });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generated_at: '2026-05-26T00:00:00Z',
        total: filtered.length,
        repositories: filtered,
        facets: {
          hosts,
          owners: Array.from(new Set(repos.map((r) => r.id.owner))),
          families,
          languages: [],
        },
      }),
    });
  });
}

export interface MockSearchHit {
  kind: 'repository' | 'pull_request' | 'issue' | 'todo' | 'activity';
  id: string;
  title: string;
  context?: string;
  snippet?: string;
  path: string;
}

/**
 * Mock `GET /api/v1/search` (`jeryu-deploy/docs/search.md`). `hits` is the
 * whole corpus; the mock matches `?q=` against every hit's title, context and
 * snippet the way the server matches a name or a body, resolves a `name#12` reference against
 * the hit ids, and answers with the kinds it searched so the page renders one
 * section per kind.
 */
export async function mockSearch(
  page: Page,
  hits: MockSearchHit[],
  options: { kinds?: MockSearchHit['kind'][] } = {}
): Promise<void> {
  const kinds = options.kinds ?? ['repository', 'pull_request', 'issue', 'todo'];
  await page.route('**/api/v1/search**', async (route: Route, request) => {
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    const url = new URL(request.url());
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const reference = /^([\w./-]+)#(\d+)$/.exec(q);
    const results = hits
      .filter((hit) => kinds.includes(hit.kind))
      .filter((hit) =>
        reference
          ? hit.id.toLowerCase().endsWith(`${reference[1]}#${reference[2]}`)
          : `${hit.title} ${hit.context ?? ''} ${hit.snippet ?? ''}`
              .toLowerCase()
              .includes(q)
      );
    const counts: Record<string, number> = {};
    for (const hit of results) counts[hit.kind] = (counts[hit.kind] ?? 0) + 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generated_at: '2026-05-26T00:00:00Z',
        query: url.searchParams.get('q') ?? '',
        kinds,
        counts,
        limit: 10,
        results,
        problems: [],
      }),
    });
  });
}

/**
 * Mock `GET /api/v1/repos/{id}` so the SPA's `useResolveRepo` returns a
 * fully populated `RepositorySummary` without touching the live forge.
 */
export async function mockRepoLookup(
  page: Page,
  repo: MockRepoSummary
): Promise<void> {
  const summary = normalizeRepo(repo);
  await mockRepoList(page, [repo]);
  await page.route('**/api/v1/repos/*', async (route: Route, request) => {
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    // Sub-paths like /repos/{id}/refs must not be swallowed here.
    const url = new URL(request.url());
    if (url.pathname.split('/').length > 4) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: summary.id, summary }),
    });
  });
}

export interface MockDeleteRepoError {
  status: number;
  code: string;
  message: string;
}

export interface CapturedArchiveRequest {
  url: string;
  body: Record<string, unknown>;
}

/**
 * Mock `PATCH /api/v1/repos/{id}` (archive / unarchive) and capture each
 * request body. Register it AFTER `mockRepoList`, like `mockDeleteRepo`.
 */
export async function mockArchiveRepo(
  page: Page,
  opts: { error?: MockDeleteRepoError } = {}
): Promise<CapturedArchiveRequest[]> {
  const captured: CapturedArchiveRequest[] = [];
  await page.route('**/api/v1/repos/*', async (route: Route, request) => {
    if (request.method() !== 'PATCH') {
      await route.fallback();
      return;
    }
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
    } catch {
      // keep {}
    }
    captured.push({ url: request.url(), body });
    if (opts.error) {
      await route.fulfill({
        status: opts.error.status,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: opts.error.code,
            message: opts.error.message,
            request_id: 'mock-archive-error',
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
  return captured;
}

export interface CapturedDeleteRequest {
  url: string;
  idempotencyKey: string | null;
  body: Record<string, unknown>;
}

/**
 * Mock the `DELETE`-method removal of `/api/v1/repos/{id}` — the two-tier repo removal. Captures every
 * removal request (URL, `Idempotency-Key`, parsed JSON body) into the returned
 * array so specs can assert the confirmation contract. Serves either a
 * `DeleteRepositoryReceipt` (200) or the provided error envelope (e.g. 422
 * `confirm_mismatch`, 403 `permission_denied`). GET and sub-resource traffic
 * falls through untouched.
 *
 * Registration order matters: Playwright runs route handlers LIFO. Register
 * this mock after repo lookup/list mocks so the removal call is intercepted
 * first; non-removal traffic falls back to the earlier handlers.
 */
export async function mockDeleteRepo(
  page: Page,
  repo: { host: string; owner: string; name: string },
  opts: { error?: MockDeleteRepoError; storageDeleted?: boolean } = {}
): Promise<CapturedDeleteRequest[]> {
  const captured: CapturedDeleteRequest[] = [];
  const receipt = {
    repo: {
      id: `${repo.host}:${repo.owner}/${repo.name}`,
      host: repo.host,
      owner: repo.owner,
      name: repo.name,
    },
    registry_deleted: true,
    deleted_counts: [{ collection: 'web_repositories', removed: 1 }],
    storage_deleted: opts.storageDeleted ?? false,
    storage_path: opts.storageDeleted
      ? `/srv/jeryu/${repo.owner}/${repo.name}.git`
      : null,
    audit_id: 'mock-audit-0001',
  };
  await page.route('**/api/v1/repos/*', async (route: Route, request) => {
    if (request.method() !== 'DELETE') {
      await route.fallback();
      return;
    }
    const url = new URL(request.url());
    // Single path segment after /repos/ only (UUID or percent-encoded
    // owner/name) — never sub-resources.
    if (url.pathname.split('/').filter(Boolean).length !== 4) {
      await route.fallback();
      return;
    }
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
    } catch {
      // keep {}
    }
    captured.push({
      url: request.url(),
      idempotencyKey: request.headers()['idempotency-key'] ?? null,
      body,
    });
    if (opts.error) {
      await route.fulfill({
        status: opts.error.status,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: opts.error.code,
            message: opts.error.message,
            request_id: 'mock-delete-error',
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(receipt),
    });
  });
  return captured;
}

export interface MockPullRequest {
  number: string;
  title: string;
  state: 'open' | 'merged' | 'closed';
  head_sha: string;
  base_sha?: string;
  author?: { login: string; display_name?: string | null };
  approvals?: number;
  approvals_required?: number;
}

/**
 * Mock `GET /api/v1/repos/{id}/pulls/{number}`. The Phase-3 PR
 * cockpit consumes the `PullRequestDetail` shape; we serve the minimum
 * surface and add extension fields the SPA's selectors look at.
 */
export async function mockPullRequest(
  page: Page,
  pr: MockPullRequest
): Promise<void> {
  const body = {
    summary: {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      head_sha: pr.head_sha,
      base_sha: pr.base_sha ?? 'base000000000000000000000000000000000000',
      author: pr.author ?? {
        login: '@author',
        display_name: 'PR Author',
      },
      approvals: pr.approvals ?? 0,
      approvals_required: pr.approvals_required ?? 1,
      created_at: '2026-05-26T00:00:00Z',
      updated_at: '2026-05-26T00:00:00Z',
    },
    threads: [],
    review_verdicts: [],
    passport: {
      status: pr.state === 'merged' ? 'merged' : 'open',
      blockers: [],
    },
  };
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+$/,
    async (route: Route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
}

export interface MockPullRequestDetail {
  repoId: string;
  number: string;
  title?: string;
  state?: 'open' | 'merged' | 'closed';
  /** Forge handle of the PR author, for the self-approval check. */
  author?: string;
  draft?: boolean;
  head_sha: string;
  base_sha?: string;
  head_ref?: string;
  base_ref?: string;
  /** Passport verdict — controls whether the Merge button renders. */
  passport?: 'pass' | 'blocked';
  blockers?: Array<{ code: string; message: string; details?: string | null }>;
  /** ReviewPosture overrides. */
  approvals?: number;
  required_approvals?: number;
  unresolved_threads?: number;
  /** When true, `mergeable.can_merge` is set so the merge CTA enables. */
  can_merge?: boolean;
  passport_hash?: string | null;
  /** The pull request's own description, shown on the Conversation tab. */
  description?: string | null;
  /** Reviewers whose approval the detail reports against this head. */
  reviews?: Array<Record<string, unknown>>;
}

/**
 * Mock `GET /api/v1/repos/{id}/pulls/{number}` with the *full*
 * `PullRequestDetail` wire shape (`contracts/generated/PullRequestDetail`) so
 * the real `PullRequestPage` cockpit hydrates and paints the live Review
 * sidebar — including the "Approve exact SHA <sha>" button. Unlike the
 * thinner `mockPullRequest`, this fixture mirrors every field the SPA's
 * selectors read (`summary.review`, `summary.mergeable`, `merge_passport`,
 * `passport_hash`) so specs can drive *real clicks* instead of
 * `page.evaluate(fetch)`.
 */
export async function mockPullRequestDetail(
  page: Page,
  pr: MockPullRequestDetail
): Promise<Record<string, unknown>> {
  const status = pr.passport ?? 'blocked';
  const canMerge = pr.can_merge ?? status === 'pass';
  const detail = {
    summary: {
      repo: { id: pr.repoId, host: 'jeryu', owner: 'neverhuman', name: 'jeryu' },
      number: Number(pr.number),
      entity: { kind: 'pull_request', id: `${pr.repoId}#${pr.number}` },
      title: pr.title ?? `PR #${pr.number}`,
      author: pr.author ?? '@author',
      head_ref: pr.head_ref ?? 'feature/x',
      base_ref: pr.base_ref ?? 'main',
      head_sha: pr.head_sha,
      base_sha: pr.base_sha ?? 'base000000000000000000000000000000000000',
      state: pr.state ?? 'open',
      draft: pr.draft ?? false,
      mergeable: {
        level: canMerge ? 'mergeable' : 'blocked',
        can_merge: canMerge,
        reason: canMerge ? null : 'Passport blocked',
        exact_head_sha: pr.head_sha,
        required_gate: canMerge ? null : 'passport',
      },
      review: {
        required_approvals: pr.required_approvals ?? 1,
        approvals: pr.approvals ?? 0,
        changes_requested: 0,
        unresolved_threads: pr.unresolved_threads ?? 0,
        user_review_state: null,
      },
      checks: { total: 2, passing: 2, failing: 0, pending: 0, skipped: 0 },
      agents: {
        active_sessions: 0,
        proposed_patches: 0,
        evidence_packets: 0,
        blockers: 0,
      },
      labels: [],
      updated_at: '2026-05-26T00:00:00Z',
      passport_hash: pr.passport_hash ?? 'passport-hash-0001',
      available_actions: [
        { action_id: 'pull.approve', label: 'Approve', risk: null },
        { action_id: 'pull.merge', label: 'Merge', risk: 'medium' },
      ],
    },
    description: pr.description ?? pr.title ?? null,
    reviews: pr.reviews ?? [],
    merge_passport: {
      status,
      head_sha: pr.head_sha,
      blockers:
        status === 'blocked'
          ? (pr.blockers ?? [
              {
                code: 'passport_blocked_approvals',
                message: 'Required approver count not satisfied.',
                details: null,
              },
            ]).map((b) => ({ ...b, details: b.details ?? null }))
          : [],
      evaluated_at: '2026-05-26T00:00:00Z',
    },
    passport_hash: pr.passport_hash ?? 'passport-hash-0001',
  };
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+$/,
    async (route: Route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detail),
      });
    }
  );
  return detail;
}

/** One changed file of `GET /pulls/{n}/diff`. */
export interface MockDiffFile {
  path: string;
  status?: 'added' | 'modified' | 'removed' | 'renamed';
  additions?: number;
  deletions?: number;
  risk?: 'low' | 'medium' | 'high' | 'critical' | null;
  /** Unified-diff body lines of the single hunk this file carries. */
  lines?: string[];
}

/**
 * Mock `GET /api/v1/repos/{id}/pulls/{number}/diff`. Pass `status` (or an
 * `error`) to rehearse the failure the Files tab must report as an alert
 * rather than as a pull request that changes nothing.
 */
export async function mockPullRequestDiff(
  page: Page,
  options: {
    headSha: string;
    files?: MockDiffFile[];
    status?: number;
  }
): Promise<void> {
  const files = (options.files ?? []).map((file) => {
    const lines = file.lines ?? ['+ added a line', '- removed a line'];
    return {
      path: file.path,
      old_path: null,
      status: file.status ?? 'modified',
      additions: file.additions ?? lines.filter((line) => line.startsWith('+')).length,
      deletions: file.deletions ?? lines.filter((line) => line.startsWith('-')).length,
      risk: file.risk ?? null,
      is_binary: false,
      hunks: [
        {
          header: `@@ -1,${lines.length} +1,${lines.length} @@`,
          old_start: 1,
          old_lines: lines.length,
          new_start: 1,
          new_lines: lines.length,
          lines,
        },
      ],
    };
  });
  const status = options.status ?? 200;
  await page.route(/\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/diff$/, (route: Route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(
        status === 200
          ? {
              head_sha: options.headSha,
              base_sha: options.headSha,
              files,
              truncated: false,
            }
          : {
              error: {
                code: 'diff_unavailable',
                message: 'the diff of this head could not be read',
                details: {},
              },
            }
      ),
    })
  );
}

/** One review thread of `GET /pulls/{n}/threads`. */
export interface MockReviewThread {
  id: string;
  resolved?: boolean;
  file_path?: string | null;
  line?: number | null;
  author?: string;
  body: string;
}

/** Mock `GET /api/v1/repos/{id}/pulls/{number}/threads`. */
export async function mockPullRequestThreads(
  page: Page,
  threads: MockReviewThread[],
  repo: { host: string; owner: string; name: string } = {
    host: 'jeryu',
    owner: 'neverhuman',
    name: 'jeryu',
  }
): Promise<void> {
  const body = {
    threads: threads.map((thread, index) => ({
      id: thread.id,
      repo: { id: `${repo.host}:${repo.owner}/${repo.name}`, ...repo },
      pr_number: index + 1,
      resolved: thread.resolved ?? false,
      file_path: thread.file_path ?? null,
      line: thread.line ?? null,
      anchor_sha: null,
      comments: [
        {
          id: `${thread.id}-c1`,
          author: thread.author ?? '@red-team',
          body_markdown: thread.body,
          body_html: null,
          created_at: '2026-05-26T00:00:00Z',
          edited_at: null,
          suggestion: null,
          evidence: null,
        },
      ],
      created_at: '2026-05-26T00:00:00Z',
      updated_at: '2026-05-26T00:00:00Z',
    })),
  };
  await page.route(/\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/threads$/, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  );
}

/** One commit of the GitHub-shaped `pulls/{n}/commits` list. */
export interface MockPullCommit {
  sha: string;
  message: string;
  date: string;
  author?: string;
}

/**
 * Mock the commits of a pull request (`GET /api/v3/.../pulls/{n}/commits`).
 * Pass `status` to rehearse the failure the Commits section must survive.
 */
export async function mockPullRequestCommits(
  page: Page,
  commits: MockPullCommit[],
  status = 200
): Promise<void> {
  const body = commits.map((commit) => ({
    sha: commit.sha,
    url: `/repos/neverhuman/jeryu/commits/${commit.sha}`,
    html_url: `/repos/jeryu/neverhuman/jeryu/commit/${commit.sha}`,
    commit: {
      message: commit.message,
      author: {
        name: commit.author ?? 'Shift Worker',
        email: 'worker@example.invalid',
        date: commit.date,
      },
      committer: {
        name: commit.author ?? 'Shift Worker',
        email: 'worker@example.invalid',
        date: commit.date,
      },
    },
    parents: [{ sha: 'parent000000000000000000000000000000000' }],
  }));
  await page.route(
    /\/api\/v3\/repos\/[^/]+\/[^/]+\/pulls\/[^/]+\/commits(\?.*)?$/,
    async (route: Route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(
          status === 200 ? body : { message: 'Not Found' }
        ),
      });
    }
  );
}

/**
 * Mock the PR list endpoint with a single PR so list-driven UIs can hydrate.
 */
export async function mockPullRequestList(
  page: Page,
  prs: MockPullRequest[]
): Promise<void> {
  const items = prs.map((pr) => ({
    repo: {
      id: 'jeryu:neverhuman/jeryu',
      host: 'jeryu',
      owner: 'neverhuman',
      name: 'jeryu',
    },
    number: Number(pr.number),
    entity: {
      kind: 'pull_request',
      id: `jeryu:neverhuman/jeryu#${pr.number}`,
    },
    title: pr.title,
    state: pr.state,
    draft: false,
    head_ref: 'feature/x',
    head_sha: pr.head_sha,
    base_ref: 'main',
    base_sha: pr.base_sha ?? 'base000000000000000000000000000000000000',
    author: pr.author?.login ?? '@author',
    mergeable: {
      level: 'blocked',
      can_merge: false,
      reason: 'fixture',
      exact_head_sha: pr.head_sha,
      required_gate: 'merge_passport',
    },
    review: {
      required_approvals: pr.approvals_required ?? 1,
      approvals: pr.approvals ?? 0,
      changes_requested: 0,
      unresolved_threads: 0,
      user_review_state: null,
    },
    checks: { total: 0, passing: 0, failing: 0, pending: 0, skipped: 0 },
    agents: {
      active_sessions: 0,
      proposed_patches: 0,
      evidence_packets: 0,
      blockers: 0,
    },
    labels: [],
    updated_at: '2026-05-26T00:00:00Z',
    passport_hash: null,
    available_actions: [],
  }));
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/pulls(\?.*)?$/,
    async (route: Route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items, total: items.length }),
      });
    }
  );
}

/**
 * Force `POST /api/v1/repos/{id}/pulls/{number}/approve` to return
 * the `merge_sha_stale` error envelope so specs can drive the "your view is
 * out of date" UI branch. The server includes both `expected_sha` (what the
 * client sent) and `current_sha` (latest head); we mirror those keys.
 */
export async function forceDriftSha(
  page: Page,
  oldSha: string,
  newSha: string
): Promise<void> {
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/pulls\/[^/]+\/approve$/,
    async (route: Route, request) => {
      if (request.method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'merge_sha_stale',
            message: 'Head SHA changed since you loaded this PR.',
            details: {
              expected_sha: oldSha,
              current_sha: newSha,
            },
            request_id: 'mock-sha-drift',
          },
        }),
      });
    }
  );
}

/**
 * Mock `GET /api/v1/repos/{id}/refs` so the BranchSelector + code browser
 * resolve `default_branch` without hitting the live forge.
 */
export async function mockRefs(
  page: Page,
  refs: Array<{ name: string; kind?: 'branch' | 'tag'; default?: boolean }> = []
): Promise<void> {
  const items = refs.length
    ? refs
    : [
        { name: 'main', kind: 'branch' as const, default: true },
        { name: 'develop', kind: 'branch' as const, default: false },
      ];
  const body = items.map((r) => ({
    name: r.name,
    kind: r.kind ?? 'branch',
    sha: '0'.repeat(40),
    protected: r.default ?? false,
  }));
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/refs(\?.*)?$/,
    async (route: Route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
}

export interface MockCommit {
  sha?: string;
  summary: string;
  author?: string;
  committed_at?: string;
}

/**
 * Mock `GET /api/v1/repos/{id}/commits` so the repository page's commit
 * summary has a history to name. `total` is the whole history of the ref, of
 * which only the newest commits are listed, as the real endpoint pages them.
 */
export async function mockCommits(
  page: Page,
  commits: MockCommit[],
  options: { total?: number; ref?: string } = {}
): Promise<void> {
  const listed = commits.map((commit, index) => ({
    sha: commit.sha ?? `${index}`.repeat(40).slice(0, 40),
    summary: commit.summary,
    author: commit.author ?? 'Ada Lovelace',
    committed_at: commit.committed_at ?? '2026-05-25T09:00:00Z',
  }));
  const total = options.total ?? listed.length;
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/commits(\?.*)?$/,
    async (route: Route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      const url = new URL(request.url());
      const limit = Number(url.searchParams.get('limit') ?? listed.length);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: options.ref ?? url.searchParams.get('ref') ?? 'main',
          sha: listed[0]?.sha ?? '0'.repeat(40),
          commits: listed.slice(0, limit),
          page: { limit, page: 1, total, has_more: total > limit },
        }),
      });
    }
  );
}

/**
 * Mock `GET /api/v1/repos/{id}/tree` with a small file-tree payload.
 */
export async function mockTree(
  page: Page,
  entries: Array<{ path: string; kind: 'file' | 'dir' | 'directory' }> = []
): Promise<void> {
  const items = entries.length
    ? entries
    : [
        { path: 'README.md', kind: 'file' as const },
        { path: 'src', kind: 'directory' as const },
        { path: 'package.json', kind: 'file' as const },
      ];
  const body = items.map((entry) => ({
    path: entry.path,
    name: entry.path.split('/').pop() ?? entry.path,
    kind: entry.kind === 'dir' ? 'directory' : entry.kind,
    size_bytes: entry.kind === 'file' ? 1024 : null,
    sha: '0'.repeat(40),
    last_commit_sha: null,
    last_commit_message: null,
    last_commit_at: null,
  }));
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/tree(\?.*)?$/,
    async (route: Route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
}

/**
 * Mock the tree per directory: `{ '': [...root], 'src': [...] }`. A directory
 * that is not listed answers an empty listing.
 */
export async function mockTreeByPath(
  page: Page,
  listings: Record<string, Array<{ path: string; kind: 'file' | 'directory' }>>
): Promise<void> {
  await page.route(/\/api\/v1\/repos\/[^/]+\/tree(\?.*)?$/, async (route: Route, request) => {
    if (request.method() !== 'GET') {
      await route.continue();
      return;
    }
    const dir = new URL(request.url()).searchParams.get('path') ?? '';
    const body = (listings[dir] ?? []).map((entry) => ({
      path: entry.path,
      name: entry.path.split('/').pop() ?? entry.path,
      kind: entry.kind,
      size_bytes: entry.kind === 'file' ? 1024 : null,
      sha: '0'.repeat(40),
      last_commit_sha: null,
      last_commit_message: null,
      last_commit_at: null,
    }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

export interface MockRenderedReadme {
  html: string;
  toc?: Array<{ depth: number; id: string; text: string }>;
  links?: Array<Record<string, unknown>>;
}

/**
 * Mock `GET /api/v1/repos/{id}/readme` with a `RenderedMarkdown`-shaped
 * payload. Used by the README rendering smoke (W-T-11) to feed a fixed HTML
 * blob into the ReadmePanel so the test can assert sanitization invariants
 * without depending on a live forge repo.
 */
export async function mockReadme(
  page: Page,
  rendered: MockRenderedReadme
): Promise<void> {
  const body = {
    html: rendered.html,
    toc: rendered.toc ?? [],
    links: rendered.links ?? [],
    renderer_version: 'jeryu-md-renderer.v1',
    sanitizer_version: 'jeryu-md-sanitizer.v1',
    rendered_at: '2026-05-26T00:00:00Z',
  };
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/readme(\?.*)?$/,
    async (route: Route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
}

export interface MockBlobOptions {
  path?: string;
  text?: string;
  html?: string;
  mime?: string;
  sha?: string;
}

export async function mockBlob(
  page: Page,
  options: MockBlobOptions = {}
): Promise<void> {
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/blob(\?.*)?$/,
    async (route: Route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      const url = new URL(request.url());
      const path = url.searchParams.get('path') ?? options.path ?? 'README.md';
      const text = options.text ?? '# Selected file proof.';
      const html = options.html ?? '<h1>Selected file proof.</h1>';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          repo: {
            id: 'jeryu:neverhuman/jeryu',
            host: 'jeryu',
            owner: 'neverhuman',
            name: 'jeryu',
          },
          path,
          ref_name: url.searchParams.get('ref') ?? 'main',
          sha: options.sha ?? '0'.repeat(40),
          size_bytes: text.length,
          mime: options.mime ?? 'text/markdown',
          encoding: 'utf8',
          text,
          base64: null,
          rendered_markdown: {
            html,
            toc: [],
            links: [],
            renderer_version: 'jeryu-md-renderer.v1',
            sanitizer_version: 'jeryu-md-sanitizer.v1',
            rendered_at: '2026-05-26T00:00:00Z',
          },
          is_binary: false,
        }),
      });
    }
  );
}

/**
 * Mock `GET /api/v1/repos/{id}/settings` with a minimal RepositorySettings
 * envelope so the settings page can render values.
 */
export async function mockSettings(
  page: Page,
  overrides: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const settings = {
    repo: {
      id: 'jeryu:neverhuman/jeryu',
      host: 'jeryu',
      owner: 'neverhuman',
      name: 'jeryu',
    },
    general: {
      name: 'jeryu',
      description: 'mocked',
      homepage: null,
      visibility: 'internal',
      default_branch: 'main',
      topics: [],
      archived: false,
    },
    features: {
      issues: true,
      pull_requests: true,
      wiki: false,
      discussions: false,
      projects: false,
      packages: false,
      releases: true,
      ci: true,
      security_advisories: true,
      pages: false,
    },
    access: {
      collaborators_count: 2,
      teams_count: 1,
      deploy_keys_count: 1,
      app_installations_count: 1,
    },
    branch_protection: [],
    merge: {
      allow_merge_commit: true,
      allow_squash_merge: true,
      allow_rebase_merge: false,
      allow_auto_merge: false,
      delete_branch_on_merge: true,
      require_linear_history: false,
      required_approvals: 1,
      dismiss_stale_approvals: true,
      require_codeowners: false,
      require_exact_sha_approval: true,
      require_jeryu_merge_passport: true,
    },
    security: {
      secret_scanning: true,
      dependency_scanning: true,
      license_policy_enabled: true,
      agent_sandbox_required: true,
    },
    notifications: {
      watch_default: 'participating',
      notify_on_ci_failure: true,
      notify_on_agent_completion: true,
      notify_on_release: false,
    },
    retention: {
      audit_days: 365,
      evidence_days: 90,
      workflow_run_days: 30,
      log_days: 14,
    },
    ci: {
      default_runner_pool: 'default',
      concurrency_limit: 4,
      artifact_retention_days: 30,
      log_retention_days: 14,
      cache_retention_days: 7,
      vti_enabled: true,
    },
    agents: {
      autonomous_coding_enabled: false,
      max_concurrent_sessions: 2,
      require_human_approval_for_writes: true,
      allowed_agents: ['editbot'],
      allowed_tools: ['jeryu.control_plane.status'],
      evidence_required: true,
      budget_daily_usd: null,
    },
    audit: {
      version: null,
      minimum_score: 85,
      tool_modes: {},
      enforce_commit: true,
      enforce_merge: null,
    },
    ...overrides,
  };
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/settings(\?.*)?$/,
    async (route: Route, request) => {
      if (request.method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(settings),
      });
    }
  );
  return settings;
}

/**
 * Force `GET /api/v1/repos/{id}/settings` to return a `permission_denied`
 * envelope (403). The settings studio propagates this through `ApiError` and
 * renders the real `<PermissionDeniedState>` surface (role="alert") — letting
 * specs assert the perm-denied UI via navigation alone, with no synthetic
 * fetch. `missing` defaults to `settings.read` (the read gate the page checks).
 */
export async function forceSettingsForbidden(
  page: Page,
  missing = 'settings.read'
): Promise<void> {
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/settings(\?.*)?$/,
    async (route: Route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'permission_denied',
            message: 'You need settings.read to view this repository.',
            details: { missing },
            request_id: 'mock-settings-forbidden',
          },
        }),
      });
    }
  );
}

/**
 * Mock `POST /api/v1/repos/{id}/settings/preview` so the SPA can render the
 * diff card without hitting the live forge. Returns a fixed receipt + warnings list.
 */
export async function mockSettingsPreview(
  page: Page,
  warnings: string[] = []
): Promise<void> {
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/settings\/preview$/,
    async (route: Route, request) => {
      if (request.method() !== 'POST') {
        await route.continue();
        return;
      }
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const diffs = Object.entries(body)
        .filter(([, value]) => value !== null)
        .map(([field, value]) => ({
          field,
          before: field === 'description' ? 'mocked' : null,
          after: String(value),
        }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          repo: {
            id: 'jeryu:neverhuman/jeryu',
            host: 'jeryu',
            owner: 'neverhuman',
            name: 'jeryu',
          },
          current_hash: 'settings-hash-1',
          diffs,
          side_effects: ['Repository settings preview computed.'],
          warnings,
          reversible: true,
        }),
      });
    }
  );
}

export interface MockAgentRun {
  run_id: string;
  branch: string;
  runner: string;
  status: string;
  tty_live?: boolean;
  agent?: string;
  workcell_id?: string;
}

/**
 * Mock `GET /api/v1/repos/{id}/agent-runs` — the active-agents list backing
 * `RepositoryAgentsPage`. NOTE (per the task brief): this backend route is a
 * separate workstream and may not exist live yet, so the e2e suite mocks it
 * here. Matches the `{ items: RepoAgentSummary[] }` wire shape.
 */
export async function mockRepoAgentRuns(
  page: Page,
  runs: MockAgentRun[]
): Promise<void> {
  const items = runs.map((r) => ({
    run_id: r.run_id,
    branch: r.branch,
    runner: r.runner,
    status: r.status,
    tty_live: r.tty_live ?? false,
    agent: r.agent ?? null,
    shell_run_id: r.shell_run_id ?? null,
    workcell_id: r.workcell_id ?? null,
    updated_at: '2026-05-26T00:00:00Z',
  }));
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/agent-runs(\?.*)?$/,
    async (route: Route, request) => {
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items }),
      });
    }
  );
}

export interface MockCreatedSession {
  run_id: string;
  branch?: string;
}

/**
 * Mock `POST /api/v1/repos/{id}/sessions` — the "New Session" creation route
 * backing the Agents lens button (a separate backend workstream). Returns the
 * `{ run_id, branch, base_oid, ws_scope, tty_topic, control_url, status_url }`
 * wire shape the SPA deep-links to and mounts the live terminal on.
 */
export async function mockCreateSession(
  page: Page,
  session: MockCreatedSession
): Promise<void> {
  const runId = session.run_id;
  const branch = session.branch ?? `agent/${runId}`;
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/sessions(\?.*)?$/,
    async (route: Route, request) => {
      if (request.method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          run_id: runId,
          branch,
          base_oid: 'b'.repeat(40),
          ws_scope: `agent_run.${runId}`,
          tty_topic: `agent_run.${runId}.tty`,
          control_url: `/api/v1/agent-runs/${runId}/control`,
          status_url: `/api/v1/agent-runs/${runId}/status`,
          shell_run_id: `shell-${runId}`,
        }),
      });
    }
  );
}

function normalizeRepo(repo: MockRepoSummary): Record<string, unknown> {
  // Per §35.1.2 the canonical `RepositoryId.id` is the opaque UUID-shaped
  // key used in `/api/v1/repos/{id}/...` sub-paths. The SPA's
  // `useResolveRepo` reads `summary.id.id` and feeds it into `endpoints.*`,
  // so the fixture must supply a stable string here. We use a
  // deterministic host:owner/name composite so the same input produces the
  // same URL across test runs (handy for cross-mock regex matching).
  const stableId = `${repo.id.host}:${repo.id.owner}/${repo.id.name}`;
  return {
    id: {
      id: stableId,
      host: repo.id.host,
      owner: repo.id.owner,
      name: repo.id.name,
    },
    entity: {
      kind: 'repository',
      id: stableId,
    },
    description: repo.description ?? null,
    visibility: repo.visibility ?? 'private',
    default_branch: repo.default_branch ?? 'main',
    family: repo.family ?? null,
    archived: repo.archived ?? false,
    repo_role: repo.repo_role ?? null,
    topics: repo.topics ?? [],
    language: null,
    health: repo.health ?? (repo.failing_checks ? 'warning' : 'healthy'),
    open_pull_requests: repo.open_pull_requests ?? 0,
    failing_checks: repo.failing_checks ?? 0,
    running_jobs: repo.running_jobs ?? 0,
    active_agents: repo.active_agents ?? 0,
    blocked_agents: 0,
    updated_at: '2026-05-26T00:00:00Z',
    jankurai_score: repo.jankurai_score ?? null,
    jankurai_decision: repo.jankurai_decision ?? null,
    jankurai_scored_at: repo.jankurai_scored_at ?? null,
    mirror: repo.mirror
      ? {
          configured: repo.mirror.configured,
          last_attempt_at: repo.mirror.last_attempt_at ?? null,
          last_attempt_ok: repo.mirror.last_attempt_ok ?? true,
          last_attempt_conclusion: repo.mirror.last_attempt_conclusion ?? null,
          last_success_at: repo.mirror.last_success_at ?? null,
        }
      : null,
    clone_http_url: `https://example.com/${repo.id.owner}/${repo.id.name}.git`,
    clone_ssh_url: `git@example.com:${repo.id.owner}/${repo.id.name}.git`,
    available_actions: repo.available_actions ?? [],
  };
}

/**
 * Mock the SSE TTY stream endpoint. Returns a minimal stream so the terminal
 * component initializes without errors.
 */
export async function mockTtyStream(
  page: Page,
  events?: Array<{ seq: number; stream: string; text: string }>,
): Promise<void> {
  await page.route("**/api/v1/agent-runs/*/tty/stream*", async (route: Route) => {
    const items = events ?? [
      { seq: 1, stream: "stdout", text: "$ ready\r\n" },
    ];
    const body = items
      .map(
        (evt) =>
          `data: ${JSON.stringify({
            seq: evt.seq,
            stream: evt.stream,
            text: evt.text,
            bytes_b64: null,
            exit_code: null,
          })}\n\n`,
      )
      .join("");
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body,
    });
  });
}

/**
 * Mock the REST control endpoint. Captures posted commands into the returned
 * array for assertion.
 */
export async function mockAgentControl(
  page: Page,
): Promise<Array<Record<string, unknown>>> {
  const controls: Array<Record<string, unknown>> = [];
  await page.route("**/api/v1/agent-runs/*/control", async (route: Route, request) => {
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }
    try {
      const body = JSON.parse(request.postData() ?? "{}");
      controls.push(body);
    } catch {
      // ignore
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accepted: true, control_seq: controls.length }),
    });
  });
  return controls;
}

/**
 * Mock the companion shell endpoint `POST /api/v1/agent-runs/:id/shell`.
 * Returns a stable `shell_run_id` so the split terminal test can assert
 * that both panes are mounted.
 */
export async function mockCompanionShell(
  page: Page,
  shellRunId = 'shell-001',
): Promise<void> {
  await page.route('**/api/v1/agent-runs/*/shell', async (route: Route, request) => {
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        shell_run_id: shellRunId,
        status_url: `/api/v1/agent-runs/${shellRunId}`,
        tty_stream_url: `/api/v1/agent-runs/${shellRunId}/tty/stream`,
        control_url: `/api/v1/agent-runs/${shellRunId}/control`,
      }),
    });
  });
}

/**
 * Mock `GET /api/v1/repos/{id}/automation` — what acts on the repository and
 * where it is mirrored to. The default is a repository whose merge identity
 * holds no grant, because that is the case the page exists to make visible;
 * pass an override for any other shape.
 */
export async function mockRepoAutomation(
  page: Page,
  view: Record<string, unknown> = {}
): Promise<void> {
  const body = {
    repo: 'acme/widget-www',
    defaultBranch: 'main',
    checks: [],
    requiredContexts: [],
    actors: [],
    mirrors: [],
    grants: [],
    grantsVisible: false,
    warnings: [],
    ...view,
  };
  await page.route(
    /\/api\/v1\/repos\/[^/]+\/automation(\?.*)?$/,
    async (route: Route, request) => {
      if (request.method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
}
