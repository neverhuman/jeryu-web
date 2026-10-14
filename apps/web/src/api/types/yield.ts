// yield.ts — wire types for the spend-against-merged read (admin-only):
//
//   GET /api/v1/yield?family=&since=&until=&by=
//
// The unit of work is a todo. Its spend is what its attempts cost (author),
// what triaging it cost, and its share of the reviews of the pull requests that
// carried it. Where the todo ended up splits that spend three ways: main
// (merged), scrap (blocked, closed or handed off without a merge) and pending
// (everything still moving). Money is USD, rates run 0..1, and a value the
// window cannot define (a rate over nothing) is null.

/** How the `groups` and `weekly` rows are cut. */
export type YieldBy = 'model' | 'agent' | 'experiment' | 'family' | 'repo' | 'requester' | 'week';

/** The query the page sends. Dates are `YYYY-MM-DD`, UTC. */
export interface YieldQuery {
  /** A family key, either spelling; omitted for every family. */
  family?: string;
  since?: string;
  until?: string;
  by?: YieldBy;
}

/** Spend and outcome of one set of todos: the totals, a group, an arm. */
export interface YieldRow {
  todos: number;
  attempts: number;
  merged: number;
  /** Merged todos that needed exactly one real attempt. */
  first_pass: number;
  /**
   * Merged todos that were themselves rework. Absent when the server predates
   * the field, which is unknown rather than zero.
   */
  reworked?: number;
  /** Spend of those reworked todos. Absent on a server that predates the field. */
  rework_usd?: number;
  spend_usd: number;
  author_usd: number;
  review_usd: number;
  triage_usd: number;
  main_usd: number;
  scrap_usd: number;
  pending_usd: number;
  /** Spend of attempts that were stopped mid-run. */
  killed_usd: number;
  /** Spend priced from a transcript rather than reported by the run. */
  estimated_usd: number;
  /** `main_usd / (main_usd + scrap_usd)`. */
  yield: number | null;
  /** `main_usd / merged`: the headline, cost per merged change. */
  usd_per_merged: number | null;
  /** 95% interval of the per-merged-todo spend; null under two merged todos. */
  usd_per_merged_ci95: [number, number] | null;
  first_pass_rate: number | null;
}

export interface YieldGroupRow extends YieldRow {
  group: string;
}

/** One group's week; `week` is the Monday (UTC) the week starts on. */
export interface YieldWeek {
  week: string;
  group: string;
  merged: number;
  main_usd: number;
  usd_per_merged: number | null;
}

/** One arm of a routing experiment: a harness and model drawn with `arm_p`. */
export interface YieldArm {
  agent: string;
  model: string;
  arm_p: number | null;
  /** Whether the arm has merged enough todos for its numbers to be read. */
  enough_data: boolean;
  row: YieldRow;
}

export interface YieldExperiment {
  experiment: string;
  arms: YieldArm[];
}

/** A todo named in the costliest and scrap lists. */
export interface YieldTodoRef {
  id: string;
  family: string;
  title: string;
  status: string;
  merged: boolean;
  /** True when this todo is a rework. Absent on a server that predates the field. */
  rework?: boolean;
  spend_usd: number;
  attempts: number;
  /** Harness and model of the landing attempt. */
  agent: string | null;
  model: string | null;
}

export interface YieldReport {
  schema_version: string;
  generated_at: string;
  window: { since: string; until: string };
  /** The canonical family asked for, or null for every family. */
  family: string | null;
  by: YieldBy;
  /** Every price source a usage record named, sorted. */
  price_sources: string[];
  totals: YieldRow;
  /** Sorted by spend, largest first. */
  groups: YieldGroupRow[];
  weekly: YieldWeek[];
  experiments: YieldExperiment[];
  /** The ten todos that cost most in the window. */
  costliest: YieldTodoRef[];
  /** The ten scrapped todos that cost most in the window. */
  scrap: YieldTodoRef[];
  /**
   * Spend of agent sessions people ran by hand, outside the todo queue. It is
   * never part of `totals`, `groups`, `weekly` or `experiments`. Absent on a
   * server that predates it; `useYield` drops a malformed one the same way.
   */
  adhoc?: YieldAdhoc;
}

/** One row of an ad-hoc cut: a family, a repository, a harness or a model. */
export interface YieldAdhocGroup {
  group: string;
  usd: number;
  /** Distinct sessions that spent in this group. */
  sessions: number;
  /** The repository's family; only the repository cut sends it. */
  family?: string | null;
}

/** One week of ad-hoc spend; `week` is keyed like the report's weekly rows. */
export interface YieldAdhocWeek {
  week: string;
  usd: number;
}

/** The cuts of the ad-hoc spend, keyed like the wire fields (`by_<cut>`). */
export type YieldAdhocBy = 'family' | 'repo' | 'agent' | 'model';

/** Ad-hoc agent spend in the report window. Groups are sorted by spend, largest first. */
export interface YieldAdhoc {
  total_usd: number;
  /** Distinct sessions in the window. */
  sessions: number;
  /** Spend that named neither a repository nor a family; it is in no group. */
  unattributed_usd: number;
  by_family: YieldAdhocGroup[];
  by_repo: YieldAdhocGroup[];
  by_agent: YieldAdhocGroup[];
  by_model: YieldAdhocGroup[];
  weekly: YieldAdhocWeek[];
}
