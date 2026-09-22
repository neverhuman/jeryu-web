// shiftModel.ts — pure helpers for the Work page: the queue, the composer and the workers.
//
// Everything here is deterministic given its inputs (including `now`) so the
// filters, shift dating and chart geometry are unit-tested without a DOM.

import type {
  ShiftBranch,
  ShiftBranchKind,
  ShiftBranchKindInput,
  ShiftBranchRepo,
  ShiftCapacityPoint,
  ShiftFamily,
  ShiftSegment,
  ShiftTodo,
  ShiftWorker,
} from '../../api/types';

export const SHIFT_STATUSES = ['open', 'claimed', 'done', 'blocked', 'handoff'] as const;
export const SHIFT_MODES = ['now', 'night'] as const;
export const SHIFT_PRIORITIES = [1, 2, 3, 4] as const;

export interface QueueFilters {
  status: string;
  mode: string;
  repo: string;
  requested_by: string;
  worked_by: string;
  shift: string;
  /** `human`: only todos where a person is the next step (see `needsHuman`). */
  attention: string;
}

export const DEFAULT_QUEUE_FILTERS: QueueFilters = {
  status: 'all',
  mode: 'all',
  repo: 'all',
  requested_by: 'all',
  worked_by: 'all',
  shift: 'all',
  attention: 'all',
};

/** Every operator that attempted the todo, plus a live claimant. */
export function todoWorkers(todo: ShiftTodo): string[] {
  const names = todo.worked_by.map((attempt) => attempt.by);
  if (todo.claim_by) names.push(todo.claim_by);
  return uniqueSorted(names.map(operatorOf));
}

/** `alton@xbabe0/w2` and `alton/w2` style claimants reduce to the operator. */
export function operatorOf(claim: string): string {
  return claim.split(/[@/]/)[0] ?? claim;
}

/** Who most recently worked the todo, as `by/slot (model)` when known. */
export function latestWorker(todo: ShiftTodo): string | null {
  const last = todo.worked_by[todo.worked_by.length - 1];
  if (todo.lease_live && todo.claim_by) return todo.claim_by;
  if (last) return last.slot ? `${last.by}/${last.slot}` : last.by;
  return todo.claim_by;
}

export function filterShiftTodos(todos: ShiftTodo[], filters: QueueFilters): ShiftTodo[] {
  const keep = (value: string, wanted: string): boolean =>
    wanted === 'all' || value === wanted;
  return todos
    .filter(
      (todo) =>
        keep(todo.status, filters.status) &&
        keep(todo.mode, filters.mode) &&
        keep(todo.requested_by, filters.requested_by) &&
        keep(todo.shift ?? '', filters.shift) &&
        (filters.attention !== 'human' || needsHuman(todo)) &&
        (filters.repo === 'all' || todo.repos.includes(filters.repo)) &&
        (filters.worked_by === 'all' || todoWorkers(todo).includes(filters.worked_by))
    )
    .sort(compareTodos);
}

const STATUS_RANK: Record<string, number> = {
  blocked: 0,
  handoff: 1,
  claimed: 2,
  open: 3,
  done: 4,
};

/**
 * A person is the next step: the todo is blocked or handed off, or it is
 * still waiting for triage. Matches the attention kinds `todo_blocked`,
 * `todo_handoff` and `todo_untriaged`.
 */
export function needsHuman(todo: Pick<ShiftTodo, 'status' | 'triaged'>): boolean {
  if (todo.status === 'blocked' || todo.status === 'handoff') return true;
  return !todo.triaged && todo.status !== 'done';
}

export function countNeedsHuman(todos: ShiftTodo[]): number {
  return todos.filter(needsHuman).length;
}

/**
 * Todos waiting on a person first (blocked, then handoff), then live work,
 * then by priority (1 is highest), then oldest filed.
 */
export function compareTodos(a: ShiftTodo, b: ShiftTodo): number {
  return (
    (STATUS_RANK[a.status] ?? 5) - (STATUS_RANK[b.status] ?? 5) ||
    a.priority - b.priority ||
    a.filed_at.localeCompare(b.filed_at) ||
    a.id.localeCompare(b.id)
  );
}

export interface QueueOptions {
  repos: string[];
  requesters: string[];
  workers: string[];
  shifts: string[];
}

export function queueOptions(todos: ShiftTodo[]): QueueOptions {
  return {
    repos: uniqueSorted(todos.flatMap((todo) => todo.repos)),
    requesters: uniqueSorted(todos.map((todo) => todo.requested_by)),
    workers: uniqueSorted(todos.flatMap(todoWorkers)),
    shifts: uniqueSorted(todos.map((todo) => todo.shift ?? '')).reverse(),
  };
}

export function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'done') return 'success';
  if (status === 'blocked') return 'danger';
  if (status === 'claimed' || status === 'handoff') return 'warning';
  return 'info';
}

/** "Paste many": one todo per blank-line-separated paragraph. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Comma / whitespace separated list input → trimmed, de-duplicated values. */
export function parseList(value: string): string[] {
  return [...new Set(value.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean))];
}

/** `YYYY-MM-DD` of `at` in the IANA zone `tz` (falls back to UTC). */
export function dateInTz(at: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/**
 * The date of "last night" in `tz`. A night is dated by the evening it
 * started, so both at 02:00 and at 15:00 the most recent completed-or-running
 * night began yesterday.
 */
export function lastNightDate(now: Date, tz: string): string {
  const today = dateInTz(now, tz);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The canonical kind of a shift. `bulletshift` is the legacy name of
 * `dayshift`: branches cut before the rename, and older servers, still say it,
 * and both must keep rendering as one kind.
 */
export function normalizeShiftKind(kind: ShiftBranchKindInput | string): ShiftBranchKind {
  return kind === 'nightshift' ? 'nightshift' : 'dayshift';
}

export function isLastNight(shift: ShiftBranch, now: Date, tz: string): boolean {
  return shift.kind === 'nightshift' && shift.date === lastNightDate(now, tz);
}

/** Newest shifts first; a nightshift sorts after the dayshift of its date. */
export function sortShifts(shifts: ShiftBranch[]): ShiftBranch[] {
  return [...shifts].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      normalizeShiftKind(a.kind).localeCompare(normalizeShiftKind(b.kind))
  );
}

/** Owner half of `owner/name`: the queue repo's owner, the fallback host of family repos. */
export function ownerOf(queueRepo: string | undefined): string {
  return queueRepo?.split('/')[0] || 'jeryu';
}

/** Owner a family repo is hosted under, or null when it is not on this forge. */
export type RepoOwners = (repo: string) => string | null;

/**
 * A family's code may live under another owner than its queue (the jain queue
 * is jain-split/jain-todo, its repos are veox/*). The server says which; an
 * older server says nothing and the queue's owner is the best guess.
 */
export function repoOwners(
  family: Pick<ShiftFamily, 'queue_repo' | 'repos'> | undefined
): RepoOwners {
  const fallback = ownerOf(family?.queue_repo);
  const known = new Map<string, string | null>();
  for (const repo of family?.repos ?? []) {
    if (repo.owner !== undefined) known.set(repo.name, repo.owner);
  }
  return (repo) => {
    if (repo.includes('/')) return repo.split('/')[0] ?? fallback;
    return known.has(repo) ? (known.get(repo) ?? null) : fallback;
  };
}

/** SPA path of a family repo's code, or null when the repo is not hosted here. */
export function repoCodeHref(owners: RepoOwners, repo: string): string | null {
  const owner = owners(repo);
  // The repository front page is where its code is read (README + Files panel).
  return owner === null ? null : repoPath(owner, repo);
}

/** SPA path for a family repo; repos may come bare (`jeryu-web`) or qualified. */
export function repoPath(owner: string, repo: string): string {
  const full = repo.includes('/') ? repo : `${owner}/${repo}`;
  return `/repos/jeryu/${full}`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 8);
}

export function formatAgo(iso: string | null | undefined, now: Date): string {
  if (!iso) return '—';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  const secs = Math.round((now.getTime() - at) / 1000);
  const future = secs < 0;
  const abs = Math.abs(secs);
  const text =
    abs < 60
      ? `${abs}s`
      : abs < 3600
        ? `${Math.round(abs / 60)}m`
        : abs < 86_400
          ? `${Math.round(abs / 3600)}h`
          : `${Math.round(abs / 86_400)}d`;
  return future ? `in ${text}` : `${text} ago`;
}

/**
 * What a todo has cost so far: the server's `cost_usd` when it sends one,
 * else the sum of its attempts' costs, or null when none reported one.
 */
export function todoCost(todo: Pick<ShiftTodo, 'worked_by' | 'cost_usd'>): number | null {
  if (typeof todo.cost_usd === 'number') return todo.cost_usd;
  const costs = todo.worked_by.map((a) => a.cost_usd).filter((c): c is number => typeof c === 'number');
  return costs.length === 0 ? null : costs.reduce((sum, c) => sum + c, 0);
}

export function formatCost(cost: number | null | undefined): string {
  return cost === null || cost === undefined ? '—' : `$${cost.toFixed(2)}`;
}

// ------------------------------------------------------------- lifecycle

export type TraceState = 'done' | 'current' | 'failed' | 'pending' | 'unknown';

export interface TraceStep {
  key: 'queued' | 'claimed' | 'done' | 'pr' | 'merged' | 'released';
  label: string;
  state: TraceState;
}

/**
 * Queued > Claimed > Done > PR > Merged > Released for one todo. `pr` and
 * `released` come from the pipeline visibility contract; on a server that does
 * not send them those steps read `unknown` rather than "not yet".
 */
export function todoTrace(todo: ShiftTodo): TraceStep[] {
  const stuck = todo.status === 'blocked' || todo.status === 'handoff';
  const done = todo.status === 'done';
  const claimed = done || todo.status === 'claimed' || todo.worked_by.length > 0 || todo.attempts > 0;
  const merged = todo.merged || todo.pr?.state === 'merged';
  const hasPr = Boolean(todo.pr) || merged;
  const landed = done && Object.keys(todo.commits).length > 0;
  const step = (key: TraceStep['key'], label: string, state: TraceState): TraceStep => ({ key, label, state });
  // An older server sends neither `pr` nor `released`: say "unknown", not "not yet".
  const prState: TraceState = hasPr ? 'done' : landed && todo.pr === undefined ? 'unknown' : 'pending';
  const releasedState: TraceState =
    todo.released === true ? 'done' : merged && (todo.released === null || todo.released === undefined) ? 'unknown' : 'pending';
  return [
    step('queued', 'Queued', 'done'),
    step('claimed', 'Claimed', todo.status === 'claimed' ? 'current' : claimed ? 'done' : 'pending'),
    step('done', stuck ? todo.status : 'Done', stuck ? 'failed' : done ? 'done' : 'pending'),
    step('pr', todo.pr ? `PR #${todo.pr.number}` : 'PR', prState),
    step('merged', 'Merged', merged ? 'done' : 'pending'),
    step('released', 'Released', releasedState),
  ];
}

/** One line for the trace's accessible name, e.g. "Queued, Claimed, Done, PR #35, Merged; Released not yet". */
export function traceSummary(steps: TraceStep[]): string {
  const word: Record<TraceState, string> = {
    done: '',
    current: ' in progress',
    failed: ' — needs a human',
    pending: ' not yet',
    unknown: ' unknown',
  };
  return steps.map((s) => `${s.label}${word[s.state]}`).join(', ');
}

export interface AttemptSummary {
  text: string;
  /** True when the last attempt did not finish the todo. */
  failing: boolean;
}

/**
 * "2 attempts · last: retry" — failed attempts are visible on the row, not only
 * inside the expanded history. Null when nothing has been attempted.
 */
export function attemptSummary(todo: Pick<ShiftTodo, 'attempts' | 'worked_by'>): AttemptSummary | null {
  const count = Math.max(todo.attempts, todo.worked_by.length);
  if (count === 0) return null;
  const last = todo.worked_by[todo.worked_by.length - 1];
  const outcome = last?.outcome ?? '';
  const text = `${count} attempt${count === 1 ? '' : 's'}${outcome ? ` · last: ${outcome}` : ''}`;
  return { text, failing: outcome !== '' && outcome !== 'done' };
}

/** Where a commit chip leads: the PR that carries it, else the repo's code, else nowhere. */
export function commitHref(
  todo: Pick<ShiftTodo, 'pr'>,
  owners: RepoOwners,
  repo: string
): string | null {
  const pr = todo.pr;
  if (pr && bareRepo(pr.repo) === bareRepo(repo)) return todoPrHref(todo, owners);
  return repoCodeHref(owners, repo);
}

/** SPA path of the todo's shift PR (the server's `url` is already an app path). */
export function todoPrHref(todo: Pick<ShiftTodo, 'pr'>, owners: RepoOwners): string | null {
  const pr = todo.pr;
  if (!pr) return null;
  if (pr.url && pr.url.startsWith('/') && !pr.url.startsWith('//')) return pr.url;
  const owner = owners(pr.repo);
  return owner === null ? null : `${repoPath(owner, pr.repo)}/pulls/${pr.number}`;
}

/** A todo nobody has to think about any more: it is done. */
export function isFinishedTodo(todo: Pick<ShiftTodo, 'status'>): boolean {
  return todo.status === 'done';
}

/** Live todos first in their own list, finished ones apart. */
export function splitFinished(todos: ShiftTodo[]): { live: ShiftTodo[]; finished: ShiftTodo[] } {
  return {
    live: todos.filter((t) => !isFinishedTodo(t)),
    finished: todos.filter(isFinishedTodo),
  };
}

function prIsOpen(pr: ShiftBranchRepo['pr']): boolean {
  return Boolean(pr) && pr?.state !== 'merged' && pr?.state !== 'closed';
}

/**
 * Work on the branch that no pull request is carrying to the base. With the
 * server's `unmerged_todos` this is exact; without it (older server) the best
 * available signal is commits ahead and no pull request at all.
 */
export function repoNeedsReviewPr(repo: ShiftBranchRepo): boolean {
  if (prIsOpen(repo.pr)) return false;
  if (repo.unmerged_todos !== undefined) return repo.unmerged_todos.length > 0;
  return repo.ahead > 0 && !repo.pr;
}

/** Offer "Open review PR" only when it would carry something. */
export function canOpenReviewPr(shift: Pick<ShiftBranch, 'repos'>): boolean {
  return shift.repos.some(repoNeedsReviewPr);
}

/** A shift still in play: a pull request is open, or work waits for one. */
export function shiftIsLive(shift: Pick<ShiftBranch, 'repos'>): boolean {
  return shift.repos.some((repo) => prIsOpen(repo.pr) || repoNeedsReviewPr(repo));
}

/** Live shifts to show, finished ones to fold away. */
export function splitShifts(shifts: ShiftBranch[]): { live: ShiftBranch[]; finished: ShiftBranch[] } {
  return { live: shifts.filter(shiftIsLive), finished: shifts.filter((s) => !shiftIsLive(s)) };
}

function bareRepo(repo: string): string {
  return repo.split('/').pop() ?? repo;
}

// --------------------------------------------------------------- workers

export const STALE_HIDE_MS = 60 * 60 * 1000;

/** A slot that has not been seen for over an hour: a ghost, hidden by default. */
export function isLongStale(worker: Pick<ShiftWorker, 'healthy' | 'last_seen'>, now: Date): boolean {
  if (worker.healthy) return false;
  const seen = Date.parse(worker.last_seen);
  return Number.isNaN(seen) ? false : now.getTime() - seen > STALE_HIDE_MS;
}

export function splitWorkers(
  workers: ShiftWorker[],
  now: Date
): { shown: ShiftWorker[]; hidden: ShiftWorker[] } {
  return {
    shown: workers.filter((w) => !isLongStale(w, now)),
    hidden: workers.filter((w) => isLongStale(w, now)),
  };
}

// ---------------------------------------------------------------- charts

export interface TimelineBar {
  x: number;
  width: number;
  state: string;
  label: string;
  title: string;
}

/** Place swim-lane segments on `[0, width]` for the window `[from, to]`. */
export function layoutSegments(
  segments: ShiftSegment[],
  from: string,
  to: string,
  width: number
): TimelineBar[] {
  const start = Date.parse(from);
  const end = Date.parse(to);
  const span = end - start;
  if (!(span > 0)) return [];
  const scale = (t: number): number =>
    (Math.min(Math.max(t, start), end) - start) * (width / span);
  const bars: TimelineBar[] = [];
  for (const segment of segments) {
    const x0 = scale(Date.parse(segment.from));
    const x1 = scale(Date.parse(segment.to));
    if (!(x1 > x0)) continue;
    const label = segment.todo_id ?? '';
    const stage = segment.stage ? ` · ${segment.stage}` : '';
    bars.push({
      x: round(x0),
      width: round(Math.max(x1 - x0, 1)),
      state: segment.state,
      label,
      title: `${segment.state}${stage}${label ? ` · ${label}` : ''} (${segment.from} → ${segment.to})`,
    });
  }
  return bars;
}

export interface CapacityGeometry {
  max: number;
  /** Step line of planned slots. */
  plannedPath: string;
  /** Polyline points of queue depth, empty when the server omits it. */
  queuePoints: string;
  bars: Array<{ x: number; y: number; width: number; height: number; busy: number; at: string }>;
}

export function capacityGeometry(
  points: ShiftCapacityPoint[],
  width: number,
  height: number
): CapacityGeometry {
  const max = Math.max(
    1,
    ...points.map((p) => Math.max(p.planned, p.busy, p.queue_depth ?? 0))
  );
  if (points.length === 0) return { max, plannedPath: '', queuePoints: '', bars: [] };
  const step = width / points.length;
  const y = (value: number): number => round(height - (value / max) * height);
  const bars = points.map((p, i) => {
    const top = y(p.busy);
    return {
      x: round(i * step + step * 0.15),
      y: top,
      width: round(step * 0.7),
      height: round(height - top),
      busy: p.busy,
      at: p.at,
    };
  });
  let plannedPath = '';
  points.forEach((p, i) => {
    const x0 = round(i * step);
    const x1 = round((i + 1) * step);
    plannedPath += `${i === 0 ? 'M' : 'L'}${x0},${y(p.planned)} L${x1},${y(p.planned)} `;
  });
  const hasQueue = points.some((p) => p.queue_depth !== null && p.queue_depth !== undefined);
  const queuePoints = hasQueue
    ? points
        .map((p, i) => `${round(i * step + step / 2)},${y(p.queue_depth ?? 0)}`)
        .join(' ')
    : '';
  return { max, plannedPath: plannedPath.trim(), queuePoints, bars };
}

/** Tick labels for a time axis: `count + 1` evenly spaced instants. */
export function timeTicks(from: string, to: string, count: number): Array<{ at: Date; frac: number }> {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!(end > start) || count < 1) return [];
  return Array.from({ length: count + 1 }, (_, i) => ({
    at: new Date(start + ((end - start) * i) / count),
    frac: i / count,
  }));
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** `operator/slot`, adding `@host` only when the operator name does not already carry it. */
export function slotLabel(operator: string, host: string, slot: string): string {
  const who = host && !operator.endsWith(`@${host}`) ? `${operator}@${host}` : operator;
  return `${who}/${slot}`;
}

/** Lines of a blocked note shown inline before the rest folds away. */
export const NOTE_CLAMP_LINES = 4;

/**
 * True when a note will not fit the inline clamp, so a "Show full note" control
 * is worth a tab stop. A short note never gets one.
 */
export function isLongNote(note: string): boolean {
  const lines = note.split('\n');
  if (lines.length > NOTE_CLAMP_LINES) return true;
  // ~72ch per line in the queue's first column.
  return note.length > NOTE_CLAMP_LINES * 72;
}

