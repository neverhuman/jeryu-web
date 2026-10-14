// flow.ts — wire types for the delivery line:
//
//   GET /api/v1/flow?family=&days=7|28|90   (admin-only)
//
// One station per step of the route, in route order, with what is at it now,
// how long it waits there against how long the step takes, where it loops back
// and which station holds the most waiting. Every number the ledger cannot
// support is `null` and named in the station's `unknown` list with a reason
// (`no_events`, `too_few_samples`, `no_heartbeat`), never a zero.
// Contract: jeryu-deploy `docs/flow.md`, ADR 0004.

export interface FlowQuery {
  family?: string;
  /** The window in days: 7, 28 or 90. */
  days?: number;
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
}

export interface FlowLine {
  cycle_s: FlowPair | null;
  x_factor: { p50: number; p90: number } | null;
  wip: number;
  finished: number;
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
}

export interface FlowWindow {
  since: string;
  until: string;
}

export interface FlowReport {
  schema_version: string;
  generated_at: string;
  family: string | null;
  days: number;
  window: FlowWindow;
  stations: FlowStation[];
  line: FlowLine;
  /** The oldest lots at each station, 20 per station at most. */
  lots: FlowLot[];
}
