// shift.ts — hand-written wire types for the Shift API (`/api/v1/shift/*`).
//
// These mirror the fixed contract in the shiftwork plan (Phase 2). The server
// side is being built in parallel in jeryu-deploy; once it generates
// `contracts/generated/Shift*.ts`, swap these for re-exports in
// `./generated` and delete this module.

import type { ShiftTodoPr } from './pipeline';

export type ShiftMode = 'now' | 'night';
export type ShiftTodoStatus = 'open' | 'claimed' | 'done' | 'blocked' | 'handoff' | 'closed';
export type ShiftLandingKind = 'landed' | 'gate_failed' | 'conflict' | 'push_race' | 'kept' | 'pending';
export interface ShiftTodoLanding {
  repo: string;
  status: ShiftLandingKind | string;
  sha?: string | null;
  pr?: number | null;
  target?: string | null;
  rescue_branch?: string | null;
  rescue_sha?: string | null;
  commits_not_on_main?: number | null;
  tests?: string[];
  check?: string | null;
}
/**
 * Who the todo waits on. `worker_task` is the default: a worker picks it up.
 * `owner_task` is a person's own job, so marking it done is the first thing
 * offered and releasing it to a worker is not offered at all. Absent on
 * servers that predate the field, which means `worker_task`.
 */
export type ShiftBlockKind = 'worker_task' | 'owner_task';
export type ShiftLanding = 'shifts' | 'batch' | string;

export interface ShiftFamilyRepo {
  name: string;
  order: number;
  /**
   * Owner the repo is hosted under on this forge, which may differ from the
   * queue repo's owner (the jain queue is jain-split/jain-todo, its code is
   * veox/*). `null`: not hosted here. Absent on older servers.
   */
  owner?: string | null;
}

export interface ShiftFamily {
  name: string;
  queue_repo: string;
  repos: ShiftFamilyRepo[];
  shift_tz: string;
  landing: ShiftLanding;
}

export interface ShiftFamiliesResponse {
  families: ShiftFamily[];
}

export interface ShiftAttempt {
  by: string;
  host: string;
  slot: string;
  model: string;
  session: string | null;
  started: string;
  ended: string | null;
  outcome: string;
  cost_usd: number | null;
  note: string;
  shift: string | null;
}

/** One acceptance criterion: its box and the evidence/reason line under it. */
export interface ShiftCriterion {
  text: string;
  checked: boolean;
  evidence?: string | null;
}

/**
 * The body's `## Acceptance criteria` checklist. `state` is `set` when the body
 * has it, `none` when the filer recorded no criteria, `unknown` for a todo
 * filed before the block existed.
 */
export interface ShiftAcceptance {
  state: 'set' | 'none' | 'unknown' | string;
  total: number;
  met: number;
  items: ShiftCriterion[];
}

export interface ShiftTodo {
  hypothesis?: string;
  check_after?: string | number | null;
  outcome?: 'met' | 'not_met' | 'unclear' | 'not_checked';
  outcome_note?: string;
  id: string;
  family: string;
  title: string;
  reworks?: string[];
  body: string;
  repos: string[];
  mode: ShiftMode;
  priority: number;
  blocked_by: string[];
  status: ShiftTodoStatus | string;
  attempts: number;
  requested_by: string;
  filed_at: string;
  claim_by: string | null;
  lease_until: string | null;
  lease_live: boolean;
  shift: string | null;
  change_set: string | null;
  commits: Record<string, string>;
  /** Per-repository landing results; absent on older servers. */
  landing?: ShiftTodoLanding[];
  merged: boolean;
  /**
   * Pipeline visibility contract v1 (server-derived, absent on older servers):
   * whether production runs the change (null when no deployment is known),
   * the shift PR that carries it, and the summed attempt cost.
   */
  released?: boolean | null;
  pr?: ShiftTodoPr | null;
  cost_usd?: number | null;
  note: string;
  triaged: boolean;
  /** Who has to act on it (absent on older servers: a worker does). */
  block_kind?: ShiftBlockKind | string | null;
  /** While this instant is in the future the todo is parked: nothing claims it. */
  parked_until?: string | null;
  /**
   * The person who has taken the todo on (a forge login); null when nobody
   * has. Workers never claim a todo with an assignee. Absent on older servers.
   */
  assignee?: string | null;
  /**
   * When the attempt in progress began and which model runs it, as the
   * claiming worker wrote them. Null unless the todo is claimed; absent on
   * older servers and from older workers. (An attempt reaches `worked_by` only
   * once it ends.)
   */
  claimed_at?: string | null;
  claim_model?: string | null;
  worked_by: ShiftAttempt[];
  /** Absent on servers that predate the checklist. */
  acceptance?: ShiftAcceptance;
}

export interface ShiftTodosResponse {
  generated_at: string;
  todos: ShiftTodo[];
  /** Rows matching the request before paging. */
  total?: number;
  /** What the server applied; `has_more` says another page follows. */
  page?: { limit: number; page: number; total: number; has_more: boolean };
}

export interface ShiftTodoQuery {
  family?: string;
  status?: string;
  mode?: string;
  repo?: string;
  requested_by?: string;
  worked_by?: string;
  shift?: string;
}

export interface CreateShiftTodoRequest {
  family: string;
  text: string;
  mode: ShiftMode;
  repos?: string[];
  priority?: number;
  blocked_by?: string[];
  title?: string;
}

export interface CreateShiftTodosBulkRequest {
  family: string;
  texts: string[];
  mode: ShiftMode;
  repos?: string[];
  priority?: number;
  blocked_by?: string[];
}

export interface ShiftTodosBulkResponse {
  todos: ShiftTodo[];
}

export type ShiftTodoActionKind =
  | 'release'
  | 'block'
  | 'priority'
  | 'mode'
  | 'done'
  | 'close'
  | 'park'
  | 'edit'
  | 'claim'
  | 'assign'
  | 'unassign'
  | 'outcome_check';

export interface ShiftTodoActionRequest {
  action: ShiftTodoActionKind;
  /** `assign`: a login; `outcome_check`: the fields to change. */
  value?: string | number | {
    hypothesis?: string;
    check_after?: string | number | null;
    outcome?: ShiftTodo['outcome'];
    outcome_note?: string;
  };
  note?: string;
  /**
   * `release` only: take the todo back from a worker whose claim lease is
   * still live. Without it such a release answers `409 claim_live`, because a
   * second worker would otherwise claim work the first is still running.
   */
  force?: boolean;
  /**
   * `park` only: when the todo comes back, RFC 3339, UTC, to the second.
   * (Quieting a Needs-you row is `POST /api/v1/attention/acks`, not an action.)
   */
  until?: string;
  /** `edit` only, and only the parts being changed. */
  title?: string;
  body?: string;
  reworks?: string[];
}

/**
 * One comment on a todo. The thread is append-only: a comment is never edited
 * or removed, and posting one changes no status, note, lease or attempt.
 */
export interface ShiftTodoComment {
  /** The login that posted it. */
  author: string;
  /** When the server stored it, RFC 3339. */
  at: string;
  /** Markdown, as the author wrote it. */
  body: string;
}

export interface ShiftTodoCommentsResponse {
  family: string;
  todo_id: string;
  /** Oldest first: the order they were posted in. */
  comments: ShiftTodoComment[];
  total: number;
}

export interface CreateShiftTodoCommentRequest {
  /** Markdown; the server refuses an empty body. */
  body: string;
}

export type ShiftWorkerState = 'idle' | 'working' | 'stopping' | 'paused';

/**
 * What a slot is: one of the queue's own slots (the default, and what a
 * heartbeat without a `kind` means), or one member of an external worker pool
 * — an account, container or browser profile of a fleet the forge does not
 * run, which holds several jobs at once.
 */
export type ShiftWorkerKind = 'todoq' | 'pool';

export type ShiftWorkerStage = 'prepare' | 'agent' | 'gate' | 'land' | 'record';

export interface ShiftScheduleWindow {
  hours: string;
  slots: number;
}

export interface ShiftSchedule {
  always: number;
  day: ShiftScheduleWindow;
  night: ShiftScheduleWindow;
  tz: string;
}

export interface ShiftHeartbeat {
  operator: string;
  host: string;
  slot: string;
  family: string;
  state: ShiftWorkerState | string;
  todo_id?: string | null;
  stage?: ShiftWorkerStage | string | null;
  lease_until?: string | null;
  shift?: string | null;
  planned_slots?: number | null;
  schedule?: ShiftSchedule | null;
  version?: string | null;
  /** The Firecracker session the slot works in (`vm-…`), as it reported it. */
  session_id?: string | null;
  /** That session's agent run. */
  run_id?: string | null;
  kind?: ShiftWorkerKind | string | null;
  /** A few words behind `state`, e.g. why a pool member is paused. */
  detail?: string | null;
  /** Jobs this slot can hold at once, and holds now; pool members only. */
  capacity?: number | null;
  active?: number | null;
}

export interface ShiftWorker extends ShiftHeartbeat {
  last_seen: string;
  healthy: boolean;
}

export interface ShiftWorkersResponse {
  generated_at: string;
  workers: ShiftWorker[];
}

export interface ShiftSegment {
  from: string;
  to: string;
  state: ShiftWorkerState | string;
  todo_id?: string | null;
  stage?: ShiftWorkerStage | string | null;
}

export interface ShiftSlotHistory {
  operator: string;
  host: string;
  slot: string;
  family: string;
  segments: ShiftSegment[];
}

export interface ShiftCapacityPoint {
  at: string;
  planned: number;
  busy: number;
  queue_depth?: number | null;
}

export interface ShiftWorkersHistoryResponse {
  from: string;
  to: string;
  slots: ShiftSlotHistory[];
  capacity: ShiftCapacityPoint[];
}

export interface ShiftBranchPr {
  number: number;
  state: string;
  url: string;
}

export interface ShiftBranchRepo {
  repo: string;
  head: string;
  ahead: number;
  behind: number;
  pr?: ShiftBranchPr | null;
  /**
   * Todos whose commits are on the branch and on no base commit. `ahead` alone
   * cannot say this: a linear-history merge replays commits under new shas.
   * Absent on older servers.
   */
  unmerged_todos?: string[];
}

/**
 * Canonical shift kinds. `dayshift` is the current name of what the driver and
 * the server used to call `bulletshift`; see {@link ShiftBranchKindInput}.
 */
export type ShiftBranchKind = 'dayshift' | 'nightshift';

/**
 * What a server may send. Older servers — and branches created before the
 * rename — say `bulletshift`; normalise with `normalizeShiftKind`.
 */
export type ShiftBranchKindInput = ShiftBranchKind | 'bulletshift';

export interface ShiftBranch {
  branch: string;
  kind: ShiftBranchKindInput;
  date: string;
  repos: ShiftBranchRepo[];
  todo_ids: string[];
}

export interface ShiftShiftsResponse {
  shifts: ShiftBranch[];
}

export interface OpenShiftPrResponse {
  prs: Array<{ repo: string; number: number; url: string; created: boolean }>;
}
