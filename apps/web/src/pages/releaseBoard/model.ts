// model.ts — pure projection behind the family release board on /releases.
//
// The board is one snapshot per family (`jeryu.release_board.v1`): lanes of
// stages, each stage with its targets, plus how far the family's work has got.
// Everything here is a pure function of that snapshot, the clock and, for the
// live overlay, the forge's environments read, so it is unit-tested without a
// page.

import type { EnvironmentSummary } from '../../api/types/deployments';
import { relativeText } from '../../format/when';
import type {
  BoardColumn,
  BoardLane,
  BoardPins,
  BoardStage,
  BoardState,
  BoardWork,
  KnownBy,
  ReleaseBoard,
  ReleaseBoardListEntry,
  WorkPartKey,
} from '../../api/types/releaseBoard';

/** A snapshot older than this is flagged: the collector runs every 5 minutes. */
export const BOARD_STALE_AFTER_MS = 15 * 60_000;

/** How often the page rereads the board (the socket nudges it sooner). */
export const BOARD_REFETCH_MS = 30_000;

/** Where the last family the operator picked is remembered. */
export const BOARD_FAMILY_STORAGE_KEY = 'jeryu.releases.board-family';

/** The note a stage carries when the forge reported a newer deployment. */
export const OVERLAY_NOTE = 'reported after this snapshot';

export type Tone = 'success' | 'warning' | 'danger' | 'neutral';

const TONE: Record<BoardState, Tone> = {
  ok: 'success',
  warn: 'warning',
  bad: 'danger',
  none: 'neutral',
};

export function stateTone(state: BoardState): Tone {
  return TONE[state];
}

/** The `page__pill` modifier for a state; neutral is the plain pill. */
export function pillClass(state: BoardState): string {
  const tone = stateTone(state);
  return tone === 'neutral' ? 'page__pill' : `page__pill page__pill--${tone}`;
}

const TARGET_WORD: Record<BoardState, string> = {
  ok: 'agrees',
  warn: 'behind',
  bad: 'behind',
  none: 'unknown',
};

/** The chip text of one target row. */
export function targetStateText(state: BoardState): string {
  return TARGET_WORD[state];
}

const KNOWN_BY_TEXT: Record<KnownBy, string> = {
  reported: 'reported',
  host: 'read from host',
  derived: 'derived',
  unverified: 'unverified',
};

export function knownByText(knownBy: KnownBy): string {
  return KNOWN_BY_TEXT[knownBy];
}

/**
 * What sits between a stage and the one before it: an arrow when it follows,
 * a double bar when it runs beside it (`parallel`), nothing for the first.
 */
export function stageConnector(stage: BoardStage, index: number): '→' | '‖' | null {
  if (index === 0) return null;
  return stage.parallel ? '‖' : '→';
}

/** Words for the connector, for assistive tech. */
export function connectorLabel(connector: '→' | '‖'): string {
  return connector === '‖' ? 'runs beside the previous stage' : 'then';
}

/**
 * True for a stage the lane declares but nothing was ever deployed to. The
 * only read of that wire flag, whose name the contract fixes.
 */
export function neverDeployed(stage: BoardStage): boolean {
  return stage.never_deployed === true;
}

/** The CSS modifiers of a stage cell. */
export function stageCellClass(stage: BoardStage, open: boolean): string {
  const classes = ['release-board__cell', `release-board__cell--${stateTone(stage.state)}`];
  if (neverDeployed(stage)) classes.push('release-board__cell--never-deployed');
  if (open) classes.push('release-board__cell--open');
  return classes.join(' ');
}

/** What the detail panel says when no promote command is recorded. */
export function noPromoteText(stage: BoardStage): string {
  if (neverDeployed(stage)) return 'Declared but never deployed to, so there is nothing to promote.';
  if (stage.status === 'source') return "This is the lane's source; nothing promotes into it.";
  return 'No promote command is recorded for this stage.';
}

/** Who runs a stage's promote command, one line above it. */
export function promoteWho(promote: NonNullable<BoardStage['promote']>): string {
  if (promote.automatic) return 'Happens by itself. To do it by hand:';
  if (promote.human_only) return 'A person runs this; nothing does it automatically:';
  return 'Anyone with push can run this:';
}

// ── Columns and groups ───────────────────────────────────────────────────

/** What an empty column cell says: the lane skips that stage. */
export const NOT_USED_TEXT = 'not used';

/** The board's fixed columns; empty when the board draws free tracks. */
export function boardColumns(board: ReleaseBoard): BoardColumn[] {
  return board.columns ?? [];
}

export interface LaneCell {
  column: BoardColumn;
  /** In lane order; empty when the lane does not use this column. */
  stages: BoardStage[];
}

export interface LaneLayout {
  cells: LaneCell[];
  /** Stages that name no declared column, shown after the grid. */
  unplaced: BoardStage[];
}

/** A lane laid out on the board's columns: every column once, in order. */
export function laneLayout(lane: BoardLane, columns: readonly BoardColumn[]): LaneLayout {
  const known = new Set(columns.map((column) => column.id));
  return {
    cells: columns.map((column) => ({
      column,
      stages: lane.stages.filter((stage) => stage.column === column.id),
    })),
    unplaced: lane.stages.filter((stage) => !stage.column || !known.has(stage.column)),
  };
}

export interface LaneGroup {
  /** The shared group name, or null for lanes outside any group. */
  name: string | null;
  lanes: BoardLane[];
}

/** Lanes in board order, neighbours with the same group gathered under it. */
export function laneGroups(lanes: readonly BoardLane[]): LaneGroup[] {
  const groups: LaneGroup[] = [];
  for (const lane of lanes) {
    const name = lane.group?.trim() || null;
    const last = groups[groups.length - 1];
    if (last && name !== null && last.name === name) last.lanes.push(lane);
    else groups.push({ name, lanes: [lane] });
  }
  return groups;
}

// ── Freshness ────────────────────────────────────────────────────────────

export interface Freshness {
  /** Milliseconds between the snapshot and `nowMs`; null when unparseable. */
  ageMs: number | null;
  stale: boolean;
  /** "12 min ago", "just now", "3 h ago" — `relativeText` of the snapshot. */
  ago: string;
}

export function boardFreshness(observedAt: string, nowMs: number): Freshness {
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return { ageMs: null, stale: false, ago: observedAt };
  const ageMs = Math.max(0, nowMs - observed);
  return { ageMs, stale: ageMs > BOARD_STALE_AFTER_MS, ago: relativeText(observed, nowMs) };
}

const TRIGGER_TEXT: Record<ReleaseBoard['collector']['trigger'], string> = {
  timer: 'timer run',
  release: 'release push',
  manual: 'manual run',
};

/** "observed 12 min ago · timer run on collector-1". */
export function observedLine(board: ReleaseBoard, nowMs: number): string {
  const { ago } = boardFreshness(board.observed_at, nowMs);
  const trigger = TRIGGER_TEXT[board.collector.trigger] ?? board.collector.trigger;
  return `observed ${ago} · ${trigger} on ${board.collector.host}`;
}

// ── Family choice ────────────────────────────────────────────────────────

/**
 * Which family the board shows: the one the URL names, else the one the
 * operator last picked, else the first reported. A family the list does not
 * carry is still honoured when the URL names it, so a link to a family whose
 * board has not arrived yet says so instead of silently showing another.
 */
export function pickFamily(
  boards: readonly ReleaseBoardListEntry[],
  requested: string | null,
  remembered: string | null
): string | null {
  if (requested) return requested;
  if (remembered && boards.some((b) => b.family === remembered)) return remembered;
  return boards[0]?.family ?? null;
}

// ── Work bar ─────────────────────────────────────────────────────────────

export interface WorkShare {
  key: WorkPartKey;
  label: string;
  count: number;
  /** Rounded whole percent of the total, for the legend. */
  percent: number;
  /** Unrounded share of the bar, 0..100. */
  width: number;
}

/** Each part's share of the total. A zero total gives zero everywhere. */
export function workShares(work: BoardWork): WorkShare[] {
  const total = work.total > 0 ? work.total : 0;
  return work.parts.map((part) => {
    const width = total > 0 ? (Math.max(0, part.count) / total) * 100 : 0;
    return { ...part, percent: Math.round(width), width };
  });
}

/** The legend line of one part: "Live 3 (43%)". */
export function workShareText(share: WorkShare): string {
  return `${share.label} ${share.count} (${share.percent}%)`;
}

/** The bar's text alternative: every part with its count, zeros included. */
export function workSummary(work: BoardWork): string {
  const parts = workShares(work).map((share) => `${share.label}: ${share.count}`);
  return `${work.total} todo${work.total === 1 ? '' : 's'}. ${parts.join(', ')}.`;
}

// ── Pins ─────────────────────────────────────────────────────────────────

/** How far behind a pin is, as a state: 0 agrees, over 20 is bad, unknown is neutral. */
export function pinBehindState(behind: number | null): BoardState {
  if (behind === null) return 'none';
  if (behind === 0) return 'ok';
  return behind > 20 ? 'bad' : 'warn';
}

/**
 * The pins table's header split into its parts. The collector sends the whole
 * header row (repo column, one per cell, the behind column); a short or long
 * header is padded or trimmed so every row still lines up.
 */
export function pinColumns(pins: BoardPins): { repo: string; cells: string[]; behind: string } {
  const width = pins.rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
  const [repo = 'Repo', ...rest] = pins.columns;
  const behind = rest.length > width ? (rest[rest.length - 1] ?? 'Behind') : 'Behind';
  const cells = Array.from({ length: width }, (_, i) => rest[i] ?? '');
  return { repo, cells, behind };
}

// ── Not shipped yet ──────────────────────────────────────────────────────

/** One stage the collector itself marked as needing attention. */
export interface UnshippedStage {
  laneId: string;
  lane: string;
  stage: string;
  status: string;
  state: 'warn' | 'bad';
}

export interface UnshippedPin {
  repo: string;
  behind: number;
}

/**
 * Everything on a board that says work has not got where it should: stages
 * marked warn or bad, pin rows that are not level, and done work that merged
 * but shipped nowhere or never reached main. Read-only lanes belong to another
 * family's board and are left to it.
 */
export interface Unshipped {
  stages: UnshippedStage[];
  /** Pin rows that are behind, most behind first. */
  pins: UnshippedPin[];
  pinRows: number;
  /** The pins table's behind column, e.g. "Main ahead". */
  pinLabel: string;
  merged: number;
  stranded: number;
  /** The worst state among everything listed. */
  state: 'warn' | 'bad';
}

/** What waits to ship on this board, or null when nothing does. */
export function unshipped(board: ReleaseBoard): Unshipped | null {
  const stages: UnshippedStage[] = [];
  for (const lane of board.lanes) {
    if (lane.read_only) continue;
    for (const stage of lane.stages) {
      if (stage.state !== 'warn' && stage.state !== 'bad') continue;
      stages.push({
        laneId: lane.id,
        lane: lane.name,
        stage: stage.name,
        status: stage.status,
        state: stage.state,
      });
    }
  }
  const pins: UnshippedPin[] = [];
  for (const row of board.pins?.rows ?? []) {
    if (row.behind !== null && row.behind > 0) pins.push({ repo: row.repo, behind: row.behind });
  }
  pins.sort((a, b) => b.behind - a.behind || a.repo.localeCompare(b.repo));
  const count = (key: WorkPartKey): number =>
    Math.max(0, board.work?.parts.find((part) => part.key === key)?.count ?? 0);
  const merged = count('merged');
  const stranded = count('stranded');
  if (stages.length === 0 && pins.length === 0 && merged === 0 && stranded === 0) return null;
  const bad =
    stages.some((stage) => stage.state === 'bad') ||
    pins.some((pin) => pinBehindState(pin.behind) === 'bad');
  return {
    stages,
    pins,
    pinRows: board.pins?.rows.length ?? 0,
    pinLabel: board.pins ? pinColumns(board.pins).behind : 'Behind',
    merged,
    stranded,
    state: bad ? 'bad' : 'warn',
  };
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The banner's headline: everything that waits, in one line. */
export function unshippedHeadline(found: Unshipped): string {
  const parts: string[] = [];
  if (found.stages.length > 0) {
    parts.push(`${plural(found.stages.length, 'stage')} marked for attention`);
  }
  if (found.pins.length > 0) {
    parts.push(`${found.pins.length} of ${found.pinRows} pinned repos not level`);
  }
  if (found.merged > 0) parts.push(`${plural(found.merged, 'done todo')} merged, not released`);
  if (found.stranded > 0) parts.push(`${plural(found.stranded, 'done todo')} stranded on a branch`);
  return `Not shipped yet: ${parts.join(' · ')}.`;
}

/** The most-behind pins in a few words: "repo-a 112, repo-b 59 and 3 more". */
export function unshippedPinsText(pins: readonly UnshippedPin[], shown = 5): string {
  const head = pins.slice(0, shown).map((pin) => `${pin.repo} ${pin.behind}`);
  const rest = pins.length - head.length;
  return rest > 0 ? `${head.join(', ')} and ${rest} more` : head.join(', ');
}

// ── Live overlay ─────────────────────────────────────────────────────────

export interface StageOverlay {
  /** What the forge reports now, e.g. "v0.8.13 · 1a2b3c4". */
  version: string;
  sha: string;
  ref: string;
  reportedAt: string;
  knownBy: 'reported';
  note: typeof OVERLAY_NOTE;
}

const SHA_TOKEN = /\b[0-9a-f]{7,40}\b/gi;

/** True when `version` names `sha` (any abbreviation of at least 7 characters). */
export function versionNamesSha(version: string | null, sha: string): boolean {
  if (!version) return false;
  const full = sha.toLowerCase();
  const tokens = version.toLowerCase().match(SHA_TOKEN) ?? [];
  return tokens.some((token) => full.startsWith(token));
}

/**
 * The forge's newer word on a stage, or null. A stage linked to a forge
 * environment shows the environment's current deployment instead of the
 * snapshot when that deployment was created after the snapshot was observed
 * AND runs a commit the snapshot's version text does not name. Older reports,
 * and newer ones of the same commit, leave the snapshot alone.
 */
export function stageOverlay(
  stage: BoardStage,
  observedAt: string,
  environments: readonly EnvironmentSummary[] | undefined
): StageOverlay | null {
  if (!stage.forge || !environments) return null;
  const env = environments.find((e) => e.name === stage.forge?.environment);
  const deployment = env?.current?.deployment;
  if (!deployment) return null;
  const reported = Date.parse(deployment.created_at);
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(reported) || !Number.isFinite(observed) || reported <= observed) return null;
  if (versionNamesSha(stage.version, deployment.sha)) return null;
  const short = deployment.sha.slice(0, 7);
  const ref = deployment.ref;
  const namesSha = ref === '' || deployment.sha.startsWith(ref) || ref.startsWith(short);
  return {
    version: namesSha ? short : `${ref} · ${short}`,
    sha: deployment.sha,
    ref,
    reportedAt: deployment.created_at,
    knownBy: 'reported',
    note: OVERLAY_NOTE,
  };
}

/** The distinct forge repositories a board's stages link to, sorted. */
export function forgeRepos(board: ReleaseBoard): string[] {
  const repos = new Set<string>();
  for (const lane of board.lanes) {
    for (const stage of lane.stages) {
      if (stage.forge && stage.forge.repo.includes('/')) repos.add(stage.forge.repo);
    }
  }
  return Array.from(repos).sort();
}
