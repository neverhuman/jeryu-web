// pipelineTestData.ts — fixtures in the exact shape of the pipeline
// visibility contract v1 (attention items and events).

import type {
  AttentionItem,
  AttentionResponse,
  Pin,
  PinsResponse,
  PipelineEvent,
  PipelineHistogramResponse,
  UsageResponse,
} from '../../api/types';

export function attentionItem(partial: Partial<AttentionItem> & Pick<AttentionItem, 'id' | 'kind'>): AttentionItem {
  return {
    severity: 'action',
    title: partial.id,
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
    ...partial,
  };
}

/** Where the deploy command runs, as the server phrases it (`action.run_in`). */
export const DEPLOY_RUN_IN = 'node-0, in a jeryu/jeryu-deploy checkout';

export const DEPLOY_COMMAND =
  'scripts/release/deploy-release.sh prod-20260919T130210Z-01dfe68-unsigned';

export const ATTENTION: AttentionResponse = {
  generated_at: '2026-09-19T13:15:00Z',
  counts: { critical: 1, action: 2, watch: 1 },
  items: [
    attentionItem({
      id: 'release_staged:jeryu/jeryu-deploy',
      kind: 'release_staged',
      severity: 'action',
      title: 'Release prod-20260919T130210Z-01dfe68-unsigned is staged',
      reason: 'Production is 3 commits behind main.',
      since: '2026-09-19T13:03:26Z',
      repo: 'jeryu/jeryu-deploy',
      sha: '01dfe680a6de5e02da4e9aa7821534742aa46d7e',
      href: '/releases',
      action: { label: 'Deploy', command: DEPLOY_COMMAND, run_in: DEPLOY_RUN_IN },
    }),
    attentionItem({
      id: 'todo-blocked:jeryu:20260919-130515-f8cc66',
      kind: 'todo_blocked',
        requested_by: 'operator',
      severity: 'action',
      title: 'Allow PATCH of repo default_branch',
      reason: 'Both halves of this todo need jeryu-core changes.',
      since: '2026-09-19T13:05:15Z',
      family: 'jeryu',
      todo_id: '20260919-130515-f8cc66',
      href: '/work/shift?family=jeryu&todo=20260919-130515-f8cc66',
    }),
    attentionItem({
      id: 'workers_down:jain',
      kind: 'workers_down',
      severity: 'critical',
      title: 'No healthy worker slot for jain',
      reason: '2 open todos and no slot has sent a heartbeat for 10 minutes.',
      since: '2026-09-19T12:45:19Z',
      family: 'jain',
      href: '/work/shift/workers',
    }),
    attentionItem({
      id: 'todo-stuck:jeryu:20260919-1',
      kind: 'todo_stuck_claim',
      severity: 'watch',
      title: 'Claim on 20260919-1 has a dead lease',
      family: 'jeryu',
    }),
  ],
};

/**
 * A spent shift budget (`shift_budget_spent`), with the numbers the server
 * sends in `budget`. Kept out of [`ATTENTION`] so the pages that count its
 * rows stay as they were; the tests that want it add it themselves.
 */
export const BUDGET_SPENT: AttentionItem = attentionItem({
  id: 'shift-budget-spent:acme:nightshift/2026-10-03',
  kind: 'shift_budget_spent',
  severity: 'action',
  title: "acme's shift budget is spent and 3 todo(s) wait",
  reason: '$42.00 of the $40.00 shift budget is spent, so no acme worker claims another todo.',
  since: '2026-10-03T06:00:00Z',
  family: 'acme',
  shift: 'nightshift/2026-10-03',
  budget: { spent_usd: 42, budget_usd: 40, waiting: 3 },
  href: '/work?family=acme',
  action: { label: 'Raise the shift budget or let the next shift pick the work up', command: null },
});

/**
 * One review hold on acme/widgets#7, as the server reports it: three items
 * from one cause, each with its own act. A reader has one problem, so the page
 * owes them one row.
 */
export const REVIEW_HOLD: AttentionItem[] = [
  attentionItem({
    id: 'pr_changes_requested:acme/widgets:7',
    kind: 'pr_changes_requested',
    severity: 'action',
    title: 'acme/widgets#7 has changes requested',
    reason: 'pr-redteam asked for changes and nothing was pushed since.',
    next_step: 'Push a fix, or dismiss the review: open /repos/jeryu/acme/widgets/pulls/7',
    since: '2026-10-03T08:10:00Z',
    family: 'acme',
    repo: 'acme/widgets',
    pr: 7,
    href: '/repos/jeryu/acme/widgets/pulls/7',
    action: { label: 'Open the review', command: null },
  }),
  attentionItem({
    id: 'reviewer_stuck:acme/widgets:7',
    kind: 'reviewer_stuck',
    severity: 'critical',
    title: 'pr-redteam could not finish its review of acme/widgets#7',
    reason: 'The review worker gave up after three attempts on the same head.',
    next_step: 'Review by hand: open /repos/jeryu/acme/widgets/pulls/7',
    since: '2026-10-03T08:00:00Z',
    family: 'acme',
    repo: 'acme/widgets',
    pr: 7,
    href: '/repos/jeryu/acme/widgets/pulls/7',
    action: { label: 'Review by hand', command: null },
  }),
  attentionItem({
    id: 'queue_failed:acme/widgets:7',
    kind: 'queue_failed',
    severity: 'action',
    title: 'acme/widgets#7 failed in the merge queue',
    reason: 'The queue gate failed on the held head.',
    next_step: 'Queue again: open /repos/jeryu/acme/widgets/pulls/7',
    since: '2026-10-03T08:20:00Z',
    family: 'acme',
    repo: 'acme/widgets',
    pr: 7,
    href: '/repos/jeryu/acme/widgets/pulls/7',
    action: {
      label: 'Queue again',
      command: null,
      api: { path: '/api/v1/repos/jeryu:acme%2Fwidgets/pulls/7/queue' },
    },
  }),
];

export function pipelineEvent(partial: Partial<PipelineEvent> & Pick<PipelineEvent, 'seq' | 'kind'>): PipelineEvent {
  return {
    ts: '2026-09-19T13:00:00Z',
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
    summary: `${partial.kind} #${partial.seq}`,
    reason: null,
    cost_usd: null,
    seconds: null,
    log_tail: null,
    log_url: null,
    detail: null,
    ...partial,
  };
}

/**
 * A full page of events, newest first, as a test that walks pages needs one.
 * The kinds alternate so no run of them reads as a burst of identical reports
 * and folds into one row: a page-walking test is about the page, not the fold.
 */
export function eventPage(newestSeq: number, length: number): PipelineEvent[] {
  return Array.from({ length }, (_, i) =>
    pipelineEvent({ seq: newestSeq - i, kind: i % 2 === 0 ? 'todo.claimed' : 'gate.started' })
  );
}

/** Newest first, like `GET /api/v1/events` without `after_seq`. */
export const EVENTS: PipelineEvent[] = [
  pipelineEvent({
    seq: 12,
    ts: '2026-09-19T13:03:26Z',
    source: 'auto-stage',
    kind: 'release.staged',
    repo: 'jeryu/jeryu-deploy',
    sha: '01dfe680a6de5e02da4e9aa7821534742aa46d7e',
    summary: 'Staged prod-20260919T130210Z-01dfe68-unsigned',
    needs_human: true,
    reason: 'Awaiting the deploy command.',
    detail: {
      release: 'prod-20260919T130210Z-01dfe68-unsigned',
      head_sha: '01dfe680a6de5e02da4e9aa7821534742aa46d7e',
      deploy_command: 'jeryu deploy prod-20260919T130210Z-01dfe68-unsigned',
    },
  }),
  pipelineEvent({
    seq: 11,
    ts: '2026-09-19T13:01:00Z',
    kind: 'pr.merged',
    repo: 'jeryu/jeryu-web',
    pr: 35,
    actor: 'jain-merge-bot',
    outcome: 'success',
    summary: 'Merged jeryu/jeryu-web#35',
  }),
  pipelineEvent({
    seq: 10,
    ts: '2026-09-19T12:58:00Z',
    source: 'pr-gate',
    kind: 'gate.log',
    repo: 'jeryu/jeryu-web',
    pr: 35,
    sha: 'b761244b76371995527bfe7795e98492703553a8',
    actor: 'node-2/slot0',
    outcome: 'failure',
    seconds: 114,
    summary: 'Gate failed on jeryu/jeryu-web#35',
    log_tail: 'error[E0432]: unresolved import\ngate: FAILED',
    detail: { runner: 'node-2/slot0', recipe: 'just required', receipt: 'target/receipts/35.json' },
  }),
  pipelineEvent({
    seq: 9,
    ts: '2026-09-19T12:50:00Z',
    source: 'todoq',
    kind: 'todo.attempt_finished',
    family: 'jeryu',
    todo_id: '20260919-121041-9d0b27',
    actor: 'operator@node-0/w1',
    outcome: 'done',
    cost_usd: 0.33,
    seconds: 240,
    summary: 'w1 finished 20260919-121041-9d0b27: done',
    detail: {
      model: 'claude-opus-5',
      attempt: 2,
      shift: 'dayshift/2026-09-19',
      usage: {
        input_tokens: 18_000,
        output_tokens: 1_400,
        cache_read_tokens: 240_000,
        cache_write_tokens: 12_000,
      },
    },
  }),
  pipelineEvent({
    seq: 8,
    ts: '2026-09-19T12:48:00Z',
    source: 'todoq',
    kind: 'todo.attempt_finished',
    family: 'jeryu',
    todo_id: '20260919-124629-6fcc69',
    outcome: 'blocked',
    cost_usd: 0.21,
    needs_human: true,
    summary: 'w1 finished 20260919-124629-6fcc69: blocked',
    reason: 'The jeryu-core tag split.7 does not exist.',
  }),
  pipelineEvent({
    seq: 7,
    ts: '2026-09-19T12:29:36Z',
    source: 'deploy',
    kind: 'deploy.status',
    repo: 'jeryu/jeryu-deploy',
    outcome: 'success',
    summary: 'Production deploy of 283416e succeeded',
  }),
];

export function pin(partial: Partial<Pin> & Pick<Pin, 'dependency'>): Pin {
  return {
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
  };
}

export const PINS: PinsResponse = {
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
          unreleased: [
            { sha: '427bebecb848d7b7bb37ecc71521d7461072694d', subject: 'test: the dock test brings its own Storage' },
            { sha: '59dc41d000000000000000000000000000000000', subject: 'Land admins on a "Needs you" page' },
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
        pin({ dependency: 'jeryu/jeryu-jira', kind: 'tag', pinned_ref: 'jeryu-jira-v5.0.0-split.0' }),
      ],
    },
    {
      repo: 'veox/jain-deploy',
      family: 'jain',
      branch: 'main',
      pins: [pin({ dependency: 'veox/jain-web' })],
    },
  ],
};

/** `GET /api/v1/events/histogram`: three hourly buckets, newest last. */
export const HISTOGRAM: PipelineHistogramResponse = {
  schema_version: 1,
  from: '2026-10-04T10:00:00Z',
  to: '2026-10-04T13:00:00Z',
  bucket_seconds: 3600,
  buckets: [
    { start: '2026-10-04T10:00:00Z', by_group: { todos: 4, gates: 2 }, failures: 0, needs_human: 0 },
    {
      start: '2026-10-04T11:00:00Z',
      by_group: { todos: 2, gates: 6, reviews: 1, pulls: 1, merges: 1, releases: 1, deploys: 1 },
      failures: 2,
      needs_human: 1,
    },
    { start: '2026-10-04T12:00:00Z', by_group: { todos: 1, gates: 1 }, failures: 0, needs_human: 0 },
  ],
};

/**
 * `GET /api/v1/usage`: two slots working, one of them behind a producer that
 * reports no usage at all, today's totals, and 5-minute buckets.
 */
export const USAGE: UsageResponse = {
  schema_version: 1,
  generated_at: '2026-09-19T13:05:00Z',
  bucket_seconds: 300,
  slots: [
    {
      operator: 'operator',
      host: 'node-0',
      slot: 'w1',
      family: 'jeryu',
      todo_id: '20260919-121041-9d0b27',
      todo_title: 'Activity: realtime token usage panel',
      model: 'opus-5',
      attempt_started: '2026-09-19T12:55:00Z',
      input_tokens: 12_400,
      output_tokens: 3_100,
      cache_read_tokens: 240_000,
      cache_write_tokens: 8_000,
      tokens_per_min: 1_800,
      cost_usd: 1.42,
    },
    {
      operator: 'operator',
      host: 'node-1',
      slot: 'w3',
      family: 'jain',
      todo_id: '20260919-130515-f8cc66',
      reported: false,
    },
  ],
  totals_today: {
    input_tokens: 1_240_000,
    output_tokens: 96_500,
    cache_read_tokens: 3_600_000,
    cache_write_tokens: 120_000,
    cost_usd: 18.4,
  },
  buckets: [
    { at: '2026-09-19T12:50:00Z', tokens: 12_000 },
    { at: '2026-09-19T12:55:00Z', tokens: 48_000 },
    { at: '2026-09-19T13:00:00Z', input_tokens: 20_000, output_tokens: 4_000 },
  ],
};
