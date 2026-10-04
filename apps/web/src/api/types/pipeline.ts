// pipeline.ts — hand-written wire types for the pipeline visibility contract v1
// (`/api/v1/events`, `/api/v1/attention`, and the derived Shift todo fields).
//
// JSON is snake_case like the Shift API. Both reads are admin-only in v1. A
// server that predates the contract answers these paths with a 404 or the SPA
// shell; `isPipelineUnavailable` in `hooks/usePipeline.ts` turns that into a
// plain "not available on this server version" state.

export type AttentionSeverity = 'critical' | 'action' | 'watch';

/**
 * An act the forge itself can carry out, so the row does not have to send
 * anybody to another page: one same-origin API call the button makes. Absent
 * from a server that predates it, and from every act that happens off-site.
 */
export interface AttentionApiAction {
  /** `POST` (the default) or `DELETE`; the web offers no other method. */
  method?: string | null;
  /** The call's own path, under `/api/v1/`. */
  path: string;
  /** The JSON body, when the call takes one. */
  body?: unknown;
  /** One sentence naming what the call does, shown before it is made. */
  confirm?: string | null;
}

export interface AttentionAction {
  label: string;
  /** A copyable shell line when the act happens off-site. */
  command: string | null;
  /**
   * Where `command` is run: a short phrase naming the machine and directory
   * ("xbabe0, any directory"). Absent from a server that predates it, and on
   * every action without a command.
   */
  run_in?: string | null;
  /** The call the row's own button makes, when the forge can act itself. */
  api?: AttentionApiAction | null;
}

export interface AttentionItem {
  id: string;
  kind: string;
  severity: AttentionSeverity | string;
  title: string;
  reason: string | null;
  since: string | null;
  family: string | null;
  repo: string | null;
  pr: number | null;
  todo_id: string | null;
  sha: string | null;
  shift: string | null;
  /** In-app path to the place to act. */
  href: string | null;
  action: AttentionAction | null;
  /**
   * The one next step as one sentence, with no other context ("Deploy: on
   * xbabe0, run `…`"). Absent from a server that predates it.
   */
  next_step?: string | null;
}

export interface AttentionCounts {
  critical: number;
  action: number;
  watch: number;
}

export interface AttentionResponse {
  /** Contract version. Unknown fields anywhere in these payloads are ignored. */
  schema_version?: string | number;
  generated_at: string;
  items: AttentionItem[];
  counts: AttentionCounts;
}

export interface PipelineEvent {
  seq: number;
  /** Optional stable id a reporter may attach; `seq` stays the list key. */
  event_id?: string | null;
  ts: string;
  source: string;
  kind: string;
  reporter: string;
  actor: string | null;
  family: string | null;
  repo: string | null;
  pr: number | null;
  sha: string | null;
  todo_id: string | null;
  shift: string | null;
  outcome: string | null;
  needs_human: boolean;
  summary: string;
  reason: string | null;
  cost_usd: number | null;
  seconds: number | null;
  log_tail: string | null;
  log_url: string | null;
  detail: Record<string, unknown> | null;
}

export interface PipelineEventsResponse {
  schema_version?: string | number;
  events: PipelineEvent[];
  latest_seq: number;
}

/** Query of `GET /api/v1/events`. `kind` ending in `.` is a prefix match. */
export interface PipelineEventsQuery {
  after_seq?: number;
  before_seq?: number;
  limit?: number;
  family?: string;
  repo?: string;
  pr?: number | string;
  todo_id?: string;
  source?: string;
  kind?: string;
  needs_human?: boolean;
}

/** The shift PR that carries a todo (same data as `ShiftBranchRepo.pr`). */
export interface ShiftTodoPr {
  repo: string;
  number: number;
  state: string;
  url: string;
}

// ---- Pins: what could be released (`GET /api/v1/pins`, admin-only) ---------

/** `commit`: a lock entry the release build uses. `tag`: a git dep in a Cargo manifest. */
export type PinKind = 'commit' | 'tag';

export type PinState = 'current' | 'behind' | 'behind_not_green' | 'diverged' | 'unknown';

export interface PinBumpPr {
  number: number;
  state: string;
  url: string;
}

export interface PinCommit {
  sha: string;
  subject: string;
}

/** One dependency a deploy repo pins, compared with that dependency's main. */
export interface Pin {
  /** `owner/name` of the hosted dependency. */
  dependency: string;
  kind: PinKind | string;
  /** The file that holds the pin. */
  source: string;
  /** The sha or tag as written. */
  pinned_ref: string;
  pinned_sha: string | null;
  latest_sha: string | null;
  /** Commits on the dependency's main the pin does not reach; 0 = current. */
  behind: number;
  latest_green: boolean | null;
  state: PinState | string;
  /** An open PR in the consumer that bumps this pin. */
  bump_pr: PinBumpPr | null;
  /** What a bump would ship, newest first (at most 20). */
  unreleased: PinCommit[];
}

export interface PinConsumer {
  /** `owner/name` of the deploy repo that holds the pins. */
  repo: string;
  family: string | null;
  branch: string;
  pins: Pin[];
}

export interface PinsResponse {
  schema_version?: string | number;
  generated_at: string;
  consumers: PinConsumer[];
}
