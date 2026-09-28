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
  lanes: BoardLane[];
  work?: BoardWork;
  pins?: BoardPins;
  notes?: BoardNotes;
  /** Sources the collector could not read on this run. */
  problems: BoardProblem[];
}

export interface BoardLane {
  id: string;
  name: string;
  /** One line: repo(s), and where it is built. */
  source: string;
  owner_family: string;
  /** True when shown on a family that does not own the lane. */
  read_only?: boolean;
  stages: BoardStage[];
}

export interface BoardPromote {
  command: string;
  human_only: boolean;
  automatic: boolean;
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
  targets: BoardTarget[];
  promote?: BoardPromote;
  /** What promoting into this stage would ship. */
  ships?: string[];
  rollback?: string;
  forge?: BoardForgeLink;
}

export interface BoardTarget {
  name: string;
  running: string | null;
  state: BoardState;
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
