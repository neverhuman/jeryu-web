// releaseBoard.ts — wire shapes for the family release board
// (`jeryu.release_board.v1`): `GET /api/v1/release-board` lists the families
// that have reported, `GET /api/v1/release-board/{family}` returns one
// snapshot. A collector builds each snapshot and PUTs it; the
// server keeps the newest per family in memory. Both reads are admin-only.

/** `none` is neutral: unknown, or nothing to judge. */
export type BoardState = 'ok' | 'warn' | 'bad' | 'none';

/** How the collector knows what a stage runs. */
export type KnownBy = 'reported' | 'host' | 'derived' | 'unverified';

export type CollectorTrigger = 'timer' | 'release' | 'manual';

export interface BoardCollector {
  host: string;
  version: string;
  trigger: CollectorTrigger;
  duration_ms: number;
}

export interface ReleaseBoard {
  schema: 'jeryu.release_board.v1';
  family: string;
  /** RFC 3339: when the collector finished reading. */
  observed_at: string;
  /** Set by the server on a read. */
  accepted_at?: string;
  /** One line for the family header. */
  summary: string;
  collector: BoardCollector;
  /**
   * The family's fixed stage columns, left to right (e.g. main, dev, stage,
   * prod). When present every lane is drawn on the same grid, one cell per
   * column, and a column a lane does not use shows as "not used". Absent or
   * empty: each lane is its own track of stages, as before.
   */
  columns?: BoardColumn[];
  lanes: BoardLane[];
  work?: BoardWork;
  pins?: BoardPins;
  notes?: BoardNotes;
  /** Sources the collector could not read on this run. */
  problems: BoardProblem[];
}

export interface BoardColumn {
  id: string;
  name: string;
}

export interface BoardLane {
  id: string;
  name: string;
  /** Lanes that share a group sit together under its name, e.g. "Tools". */
  group?: string;
  /** One line: repo(s), and where it is built. */
  source: string;
  owner_family: string;
  /** True when shown on a family that does not own the lane. */
  read_only?: boolean;
  stages: BoardStage[];
}

export type PromoteActionState =
  | 'pending'
  | 'claimed'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'cancelled';

/** The newest deploy ask for a stage's staged release (release-actions queue). */
export interface BoardPromoteAction {
  id: string;
  state: PromoteActionState;
  requested_by: string;
  requested_at: string;
  finished_at?: string | null;
  message?: string | null;
  /** `GET` it for the ask with its redacted log tail. */
  log_href: string;
}

/** What Promote may do right now; the server fills it on a read. */
export interface BoardPromoteRun {
  available: boolean;
  /** Why Promote is disabled; null when it is available. */
  reason: string | null;
  /** The confirm text: names the release, the stage and the target. */
  confirm: string;
  action: BoardPromoteAction | null;
}

export interface BoardPromote {
  command: string;
  human_only: boolean;
  automatic: boolean;
  /** The staged release Promote deploys. Absent from an older collector. */
  deploy?: { repo: string; release: string };
  /** Absent from an older server. */
  run?: BoardPromoteRun;
}

/** `POST /api/v1/release-board/{family}/promote` answer. */
export interface PromoteResponse {
  created: boolean;
  action: BoardPromoteAction;
}

export interface BoardForgeLink {
  /** `owner/name` whose environments carry this stage's deployments. */
  repo: string;
  environment: string;
}

export interface BoardStage {
  id: string;
  name: string;
  /** Headline of what runs, e.g. "v0.8.12 · 96d8374". */
  version: string | null;
  state: BoardState;
  /** Short chip text: "in sync", "1 behind", "skew". */
  status: string;
  known_by: KnownBy;
  /** Runs beside the previous stage instead of after it. */
  parallel?: boolean;
  /** Declared but never deployed. */
  never_deployed?: boolean;
  /** The board column this stage sits in; several stages may share one. */
  column?: string;
  targets: BoardTarget[];
  promote?: BoardPromote;
  /** What promoting into this stage would ship. */
  ships?: string[];
  /**
   * What the stage named `from` (usually main) holds that this one does not:
   * what promoting would bring, and what testing here does not cover. Absent
   * from an older collector.
   */
  missing?: BoardStageChanges;
  /** This stage's recent moves, newest first: what each one brought here. */
  arrived?: BoardStageMove[];
  rollback?: string;
  forge?: BoardForgeLink;
}

/** One commit, with the work item (`Todo:` trailer) it belongs to. */
export interface BoardChange {
  sha: string;
  subject: string;
  todo?: string;
  todo_title?: string;
}

/** Commits one stage holds that another lacks, oldest first; `total` counts them all. */
export interface BoardStageChanges {
  from: string;
  /** `owner/name` on the forge. */
  repo: string;
  total: number;
  changes: BoardChange[];
}

/** One move of a stage: when the collector first saw it at `to`, and what it brought. */
export interface BoardStageMove {
  at: string;
  from: string;
  to: string;
  repo: string;
  total: number;
  changes: BoardChange[];
}

export interface BoardTarget {
  name: string;
  running: string | null;
  state: BoardState;
  /**
   * The runners this target covers, ids exactly as `runnerId` on
   * `GET /api/v1/control-plane/runners`. Absent from an older collector.
   */
  runners?: string[];
  /**
   * The shift slots (worker pools) that run this target, as they report to
   * `POST /api/v1/shift/heartbeat`. A pool has no `runnerId`, so these link to
   * /work rather than /runners. Absent from an older collector.
   */
  slots?: BoardTargetSlot[];
}

/** Every slot of `family` on `host`: one worker pool serving a target. */
export interface BoardTargetSlot {
  family: string;
  host: string;
}

export type WorkPartKey = 'live' | 'merged' | 'stranded' | 'untraceable' | 'blocked' | 'open';

export interface BoardWorkPart {
  key: WorkPartKey;
  label: string;
  count: number;
}

export interface BoardWork {
  total: number;
  /** How todos were matched, one sentence. */
  method: string;
  parts: BoardWorkPart[];
  /** Todo sources that cannot be matched, one sentence. */
  unlinked?: string;
}

export interface BoardPinRow {
  repo: string;
  cells: string[];
  behind: number | null;
  note?: string;
}

export interface BoardPins {
  note: string;
  /** Header row: the repo column, one per cell, then the behind column. */
  columns: string[];
  rows: BoardPinRow[];
}

export interface BoardNotes {
  title: string;
  items: string[];
  coverage: string;
}

export interface BoardProblem {
  source: string;
  message: string;
}

/** One row of `GET /api/v1/release-board`. */
export interface ReleaseBoardListEntry {
  family: string;
  observed_at: string;
  accepted_at: string;
  summary: string;
  collector: BoardCollector;
  problem_count: number;
}

export interface ReleaseBoardListResponse {
  boards: ReleaseBoardListEntry[];
}
