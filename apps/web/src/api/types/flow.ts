// flow.ts — wire types for the delivery line:
//
//   GET /api/v1/flow?family=&days=7|28|90   (admin-only)
//       [&station=<id>&lots_offset=<n>&lots_limit=1..100&lots_order=oldest|newest]
//
// One station per step of the route, in route order, with what is at it now,
// how long it waits there against how long the step takes, where it loops back
// and which station holds the most waiting. Every number the ledger cannot
// support is `null` and named in the station's `unknown` list with a reason
// (`no_events`, `too_few_samples`, `no_heartbeat`), never a zero.
// Contract: jeryu-deploy `docs/flow.md`, ADR 0004.

export interface FlowQuery {
  repo?: string;
  family?: string;
  /** The window in days: 7, 28 or 90. */
  days?: number;
  /** List only this station's lots: one page of it. */
  station?: string;
  /** Skip this many of the station's lots. */
  lotsOffset?: number;
  /** At most this many lots per station, 1 to 100 (the server's default is 20). */
  lotsLimit?: number;
  /** Which end of the station's line the page starts from (oldest by default). */
  lotsOrder?: 'oldest' | 'newest';
}

/** Seconds at the median and the 90th percentile. */
export interface FlowPair {
  p50: number;
  p90: number;
}

/** Lots at a station now, split by what they are doing. */
export interface FlowWip {
  waiting: number;
  active: number;
  held: number;
}

/** Lots a station sent back, and to which station. */
export interface FlowRework {
  to: string;
  count: number;
  /** The share of the lots that left the station in the window. */
  rate: number;
}

/** A number the ledger cannot support, and why. */
export interface FlowUnknown {
  metric: string;
  reason: string;
}

/** The tools serving a station; `GET /api/v1/flow/layout` fills this in. */
export interface FlowCapacity {
  tools?: string[];
  reporting?: number | null;
  busy?: number | null;
  expected?: number | null;
}

/**
 * The unheld claims at Work, read from the shift heartbeats: `live` when a
 * healthy slot names the todo, `no_live_worker` when the family's slots report
 * and none of them works it, `unknown` when nothing of the family reports.
 */
export type FlowClaim = 'live' | 'no_live_worker' | 'unknown';

export type FlowClaims = Record<FlowClaim, number>;

export interface FlowStation {
  id: string;
  label: string;
  /** Its place on the route, 1 for the first station. */
  order: number;
  wip: FlowWip;
  oldest_wait_s: number | null;
  queue_s: FlowPair | null;
  process_s: FlowPair | null;
  throughput_per_hour: number | null;
  first_pass_rate: number | null;
  rework: FlowRework[];
  capacity: FlowCapacity | null;
  utilization: number | null;
  bottleneck: boolean;
  unknown: FlowUnknown[];
  /** Every unheld claim at Work, listed or not; null at the other stations. */
  claims?: FlowClaims | null;
  /** How many of this station's lots this answer lists. */
  lots_listed?: number;
}

export interface FlowLine {
  cycle_s: FlowPair | null;
  x_factor: { p50: number; p90: number } | null;
  wip: number;
  finished: number;
}

/** Why a lot is held where it stopped. Absent on a server that predates holds. */
export interface FlowHold {
  /** `review_hold`, `gate_red`, `queue_conflict`, `queue_failed` or `superseded`. */
  reason: string;
  /** The reviewer's login, the check's name, `merge-queue`, or the replacing pull request. */
  by: string;
  /** The oldest event on the current head that caused the hold. */
  since: string;
  age_s: number;
  /** The head is unchanged since the hold and no fix has been claimed. */
  nobody_acting: boolean;
  /** The pull request's review, for a review hold. */
  review_href: string | null;
}

export interface FlowLot {
  lot_id: string;
  station: string;
  /** `waiting`, `active` or `held`. */
  state: string;
  since: string;
  /** The remaining time over the stations ahead that have an estimate. */
  eta_s: FlowPair | null;
  /** True when `eta_s` leaves stations out: it is a lower bound, not the whole. */
  eta_partial: boolean;
  eta_unknown_stations: string[];
  slowest_ahead: string | null;
  href: string;
  /** The pull request page, when the lot is bound to a pull request. */
  pr_href?: string | null;
  hold?: FlowHold | null;
  /** Set on an unheld Work lot; null everywhere else. */
  claim?: FlowClaim | null;
}

export interface FlowWindow {
  since: string;
  until: string;
}

export interface FlowClosure {
  lot_id: string; repo: string | null; station: string; href: string; title: string;
  kind: 'pull_request' | 'todo'; disposition: string; explanation: string;
  replacement: { href: string; label: string; state: string } | null;
  needs_attention: boolean;
}
/** A repository's configured review and check requirements. */
export interface FlowRoute {
  /** `automated`, `human_only`, `no_gate` or `unknown`. */
  kind: string;
  /** `branch_protection`, `no_protection_rule` or `unreadable`. */
  source: string;
  approvals: number | null;
  required_checks: string[] | null;
}

/** One contributing repository of a product. */
export interface FlowRepoNode {
  repo: string;
  /** `source` or `integration`. */
  role: string;
  /** True when more than one product of the family delivers it. */
  shared: boolean;
  pins_into: string[];
  /** `pin_lock`, `declared`, `recorded_pin_events`, `none` or `unknown`. */
  pin_source: string;
  route: FlowRoute;
  active_lots: number;
  no_current_work: boolean;
}

/** Distinct work, one bucket per lot by its furthest recorded evidence. */
export interface FlowWork {
  active_lots: number;
  changes: number;
  pull_requests: number;
  pin_pull_requests: number;
  release_artifacts: number;
}

export interface FlowProduct {
  id: string;
  label: string;
  family: string;
  /** `declared` or `family_default`. */
  source: string;
  repos: FlowRepoNode[];
  integration: string | null;
  release: { repo: string; source: string; stations: string[] } | null;
  work: FlowWork;
}

export interface FlowTopology {
  families: { family: string; products: number; repos: number; work: FlowWork }[];
  products: FlowProduct[];
  unscoped_active_lots: number;
  unknown: { scope: string; field: string; reason: string }[];
  /** Always false on a server that sends `families_total`. */
  families_truncated: boolean;
  /** How many families the forge hosts; `families` describes every one. */
  families_total?: number;
}

/** The page of lots an answer lists. */
export interface FlowLotsPage {
  station: string | null;
  offset: number;
  limit: number;
  order?: 'oldest' | 'newest';
}

export interface FlowReport {
  /** Dated external-origin and execution-plan observations, independent of native events. */
  external_work?: import('./externalWork').ExternalWorkReport;
  /** The configured family/product/repository delivery topology. Absent on a
   * server that predates it, which leaves the map on recorded visits only. */
  topology?: FlowTopology;
  closures?: FlowClosure[];
  lifecycle_problems?: string[];
  repo?: string | null;
  repository_wip?: FlowRepositoryWip[];
  schema_version: string;
  generated_at: string;
  family: string | null;
  days: number;
  window: FlowWindow;
  stations: FlowStation[];
  line: FlowLine;
  /** One page of lots per station: by default the oldest 20 of each. */
  lots: FlowLot[];
  /** The stations' in-progress counts added up; never shrinks to the page. */
  lots_total?: number;
  /** A paged station has more lots past this page. */
  lots_truncated?: boolean;
  lots_page?: FlowLotsPage;
}

export interface FlowRepositoryWip extends FlowWip { repo: string; station: string }
export interface FlowHistoryItem {
  event_seq: number; lot_id: string; station: string; state: string; ts: string;
  repo: string | null; pr: number | null; sha: string | null; title?: string | null; summary: string | null;
  runner: string | null; log_url: string | null; href: string;
}
export interface FlowHistory {
  daily: Record<string, Record<string, number>>;
  items: FlowHistoryItem[]; total: number; offset: number; detailed_since: string; timezone: string;
  related_items?: { lot_id: string; href: string }[];
  deliveries: { repo: string; revision: string; release: string | null; kind: string; ts: string }[];
}
export interface FlowHistoryQuery {
  family?: string; repo?: string; station?: string; days: number; day?: string;
  state?: string; lot?: string; offset?: number;
}
/** One runner serving a station, from its latest heartbeat. */
export interface FlowLayoutTool {
  runnerId: string;
  host: string;
  online: 'online' | 'offline' | string;
  load: 'busy' | 'idle' | string;
  lastSeen: string;
  code: { repo?: string | null; commit?: string | null; version?: string | null; installedAt?: string | null } | null;
  /** True when the runner's last beat shows it failing. */
  failing?: boolean;
  failureReason?: string | null;
}

/** `GET /api/v1/flow/layout` (admin-only): the tools behind each station. */
export interface FlowLayoutStation {
  id: string;
  label?: string;
  order?: number;
  tools: FlowLayoutTool[];
  /** Reporting is the online tools; `expected` is site configuration, null when unset. */
  capacity?: { reporting: number; busy: number; expected: number | null };
  flagged?: boolean;
  /** `no_reporting_tool`, `fewer_than_expected`, `tool_failing`, `expected_capacity_invalid`. */
  warnings?: string[];
  /** `no_heartbeat`, `expected_capacity`. */
  unknown?: string[];
}

export interface FlowLayout {
  schema_version?: string;
  generated_at?: string;
  stations: FlowLayoutStation[];
}
