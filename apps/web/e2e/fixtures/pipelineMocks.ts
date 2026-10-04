// pipelineMocks.ts — browser-boundary mocks for the pipeline visibility
// contract v1: `GET /api/v1/attention`, `GET /api/v1/events` and `GET /api/v1/pins`.
//
// Register AFTER `mockBootstrap` (Playwright matches the newest route first).
// Without these mocks the shared 404 fallback answers, which is exactly what a
// server that predates the contract looks like to the SPA.

import type { Page, Route } from '@playwright/test';

export const DEPLOY_COMMAND =
  'scripts/release/deploy-release.sh prod-20260919T130210Z-01dfe68-unsigned';

/** Where the deploy command runs, as the server phrases it (`action.run_in`). */
export const DEPLOY_RUN_IN = 'runner-1.example, in a jeryu/jeryu-deploy checkout';

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function item(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    severity: 'action',
    reason: null,
    since: null,
    family: null,
    repo: null,
    pr: null,
    todo_id: null,
    sha: null,
    shift: null,
    href: null,
    action: null,
    ...overrides,
  };
}

export function attentionBody(): Record<string, unknown> {
  return {
    schema_version: 1,
    generated_at: minutesAgo(0),
    counts: { critical: 1, action: 2, watch: 1 },
    items: [
      item({
        id: 'workers_down:jain',
        kind: 'workers_down',
        severity: 'critical',
        title: 'No healthy worker slot for jain',
        reason: '2 open todos and no slot has sent a heartbeat for 10 minutes.',
        since: minutesAgo(30),
        family: 'jain',
        href: '/work/shift/workers',
      }),
      item({
        id: 'release_staged:jeryu/jeryu-deploy',
        kind: 'release_staged',
        title: 'Release prod-20260919T130210Z-01dfe68-unsigned is staged',
        reason: 'Production is 3 commits behind main.',
        since: minutesAgo(12),
        repo: 'jeryu/jeryu-deploy',
        href: '/releases',
        action: { label: 'Deploy', command: DEPLOY_COMMAND, run_in: DEPLOY_RUN_IN },
      }),
      item({
        id: 'todo-blocked:jeryu:20260919-130515-f8cc66',
        kind: 'todo_blocked',
        title: 'Allow PATCH of repo default_branch',
        reason: 'Both halves of this todo need jeryu-core changes.',
        since: minutesAgo(10),
        family: 'jeryu',
        todo_id: '20260919-130515-f8cc66',
        href: '/work/shift?family=jeryu&todo=20260919-130515-f8cc66',
      }),
      item({
        id: 'todo-stuck:jeryu:20260919-1',
        kind: 'todo_stuck_claim',
        severity: 'watch',
        title: 'Claim on 20260919-1 has a dead lease',
        family: 'jeryu',
      }),
    ],
  };
}

function event(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    source: 'forge',
    reporter: 'forge',
    actor: null,
    family: null,
    repo: null,
    pr: null,
    sha: null,
    todo_id: null,
    shift: null,
    outcome: null,
    needs_human: false,
    reason: null,
    cost_usd: null,
    seconds: null,
    log_tail: null,
    log_url: null,
    detail: null,
    ...overrides,
  };
}

/** Newest first, like `GET /api/v1/events` without `after_seq`. */
export function pipelineEvents(): Array<Record<string, unknown>> {
  return [
    event({
      seq: 12,
      ts: minutesAgo(12),
      source: 'auto-stage',
      kind: 'release.staged',
      repo: 'jeryu/jeryu-deploy',
      summary: 'Staged prod-20260919T130210Z-01dfe68-unsigned',
      needs_human: true,
      reason: 'Awaiting the deploy command.',
    }),
    event({
      seq: 11,
      ts: minutesAgo(15),
      kind: 'pr.merged',
      repo: 'neverhuman/jeryu',
      pr: 99,
      actor: 'jain-merge-bot',
      outcome: 'success',
      summary: 'Merged neverhuman/jeryu#99',
    }),
    event({
      seq: 10,
      ts: minutesAgo(20),
      source: 'pr-gate',
      kind: 'gate.log',
      repo: 'neverhuman/jeryu',
      pr: 99,
      sha: 'b761244b76371995527bfe7795e98492703553a8',
      actor: 'xbabe2/slot0',
      outcome: 'failure',
      seconds: 114,
      summary: 'Gate failed on neverhuman/jeryu#99',
      log_tail: 'error[E0432]: unresolved import\ngate: FAILED',
    }),
    event({
      seq: 9,
      ts: minutesAgo(30),
      source: 'todoq',
      kind: 'todo.attempt_finished',
      family: 'jeryu',
      todo_id: '20260919-0800-aaa',
      actor: 'alton@xbabe0/w1',
      outcome: 'done',
      cost_usd: 0.33,
      seconds: 240,
      summary: 'w1 finished 20260919-0800-aaa: done',
    }),
  ];
}

/** `GET /api/v1/pins`: jeryu-deploy's web pin is behind, a tag needs cutting, one pin is current. */
export function pinsBody(
  webBumpPr: { number: number; state: string; url: string } | null = null
): Record<string, unknown> {
  const pin = (partial: Record<string, unknown>): Record<string, unknown> => ({
    kind: 'commit',
    source: 'jeryu-split.lock.toml',
    pinned_ref: '8afe03c49bbdf1ad26d1282095561b50c840bf0e',
    pinned_sha: '8afe03c49bbdf1ad26d1282095561b50c840bf0e',
    latest_sha: '427bebecb848d7b7bb37ecc71521d7461072694d',
    behind: 0,
    latest_green: true,
    state: 'current',
    bump_pr: null,
    unreleased: [],
    ...partial,
  });
  return {
    schema_version: '1',
    generated_at: '2026-09-19T15:00:00Z',
    consumers: [
      {
        repo: 'jeryu/jeryu-deploy',
        family: 'jeryu',
        branch: 'main',
        pins: [
          pin({
            dependency: 'jeryu/jeryu-web',
            behind: 9,
            state: 'behind',
            bump_pr: webBumpPr,
            unreleased: [
              { sha: '427bebecb848d7b7bb37ecc71521d7461072694d', subject: 'test: the dock test brings its own Storage' },
            ],
          }),
          pin({
            dependency: 'jeryu/jeryu-core',
            kind: 'tag',
            source: 'crates/jeryu-api/Cargo.toml',
            pinned_ref: 'jeryu-core-v5.0.0-split.6',
            behind: 3,
            state: 'behind',
          }),
          pin({ dependency: 'jeryu/jeryu-cache', kind: 'tag', pinned_ref: 'jeryu-cache-v5.0.0-split.0' }),
        ],
      },
    ],
  };
}

export interface PipelineMockLog {
  eventQueries: string[];
}

export async function mockPipelineApi(
  page: Page,
  options: {
    attention?: Record<string, unknown>;
    events?: Array<Record<string, unknown>>;
    pins?: Record<string, unknown>;
  } = {}
): Promise<PipelineMockLog> {
  const log: PipelineMockLog = { eventQueries: [] };
  const events = options.events ?? pipelineEvents();
  const json = (route: Route, body: unknown): Promise<void> =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(/\/api\/v1\/attention(\?.*)?$/, (route) => json(route, options.attention ?? attentionBody()));
  await page.route(/\/api\/v1\/pins(\?.*)?$/, (route) => json(route, options.pins ?? pinsBody()));
  await page.route(/\/api\/v1\/events(\?.*)?$/, (route, request) => {
    const qs = new URL(request.url()).searchParams;
    log.eventQueries.push(qs.toString());
    let list = events;
    for (const key of ['family', 'repo', 'source', 'todo_id']) {
      const wanted = qs.get(key);
      if (wanted) list = list.filter((e) => e[key] === wanted);
    }
    const pr = qs.get('pr');
    if (pr) list = list.filter((e) => String(e.pr) === pr);
    const kind = qs.get('kind');
    if (kind) {
      list = list.filter((e) =>
        kind.endsWith('.') ? String(e.kind).startsWith(kind) : e.kind === kind
      );
    }
    if (qs.get('needs_human') === 'true') list = list.filter((e) => e.needs_human === true);
    const after = qs.get('after_seq');
    if (after) list = list.filter((e) => Number(e.seq) > Number(after)).reverse();
    const before = qs.get('before_seq');
    if (before) list = list.filter((e) => Number(e.seq) < Number(before));
    const limit = Number(qs.get('limit') ?? '100');
    return json(route, { schema_version: 1, events: list.slice(0, limit), latest_seq: 12 });
  });
  return log;
}
