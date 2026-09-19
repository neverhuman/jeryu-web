// pipelineTestData.ts — fixtures in the exact shape of the pipeline
// visibility contract v1 (attention items and events).

import type { AttentionItem, AttentionResponse, Pin, PinsResponse, PipelineEvent } from '../../api/types';

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
      action: { label: 'Deploy', command: DEPLOY_COMMAND },
    }),
    attentionItem({
      id: 'todo-blocked:jeryu:20260919-130515-f8cc66',
      kind: 'todo_blocked',
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
    actor: 'xbabe2/slot0',
    outcome: 'failure',
    seconds: 114,
    summary: 'Gate failed on jeryu/jeryu-web#35',
    log_tail: 'error[E0432]: unresolved import\ngate: FAILED',
  }),
  pipelineEvent({
    seq: 9,
    ts: '2026-09-19T12:50:00Z',
    source: 'todoq',
    kind: 'todo.attempt_finished',
    family: 'jeryu',
    todo_id: '20260919-121041-9d0b27',
    actor: 'alton@xbabe0/w1',
    outcome: 'done',
    cost_usd: 0.33,
    seconds: 240,
    summary: 'w1 finished 20260919-121041-9d0b27: done',
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
