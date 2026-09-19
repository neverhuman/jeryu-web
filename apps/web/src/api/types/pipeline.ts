// pipeline.ts — hand-written wire types for the pipeline visibility contract v1
// (`/api/v1/events`, `/api/v1/attention`, and the derived Shift todo fields).
//
// JSON is snake_case like the Shift API. Both reads are admin-only in v1. A
// server that predates the contract answers these paths with a 404 or the SPA
// shell; `isPipelineUnavailable` in `hooks/usePipeline.ts` turns that into a
// plain "not available on this server version" state.

export type AttentionSeverity = 'critical' | 'action' | 'watch';

export interface AttentionAction {
  label: string;
  /** A copyable shell line when the act happens off-site. */
  command: string | null;
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
