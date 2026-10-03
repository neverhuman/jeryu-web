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
import { compareInstants, rfc3339Seconds, shiftDayKey, utcDayKey } from '../../format/when';
import { repoRefOf, repoUrl, type RepoRef } from '../repoBrowserModel';

export const SHIFT_STATUSES = ['open', 'claimed', 'done', 'blocked', 'handoff', 'closed'] as const;
export const SHIFT_MODES = ['now', 'night'] as const;
export const SHIFT_PRIORITIES = [1, 2, 3, 4] as const;

export interface QueueFilters {
  status: string;
  mode: string;
  repo: string;
  requested_by: string;
  worked_by: string;
  shift: string;
}

export const DEFAULT_QUEUE_FILTERS: QueueFilters = {
  status: 'all',
  mode: 'all',
  repo: 'all',
  requested_by: 'all',
  worked_by: 'all',
  shift: 'all',
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
        (filters.repo === 'all' || todo.repos.some((repo) => sameRepo(repo, filters.repo))) &&
        (filters.worked_by === 'all' || todoWorkers(todo).includes(filters.worked_by))
    )
    .sort(compareTodos);
}

/** A todo may name `owner/name` where the filter says `name`, or the reverse. */
function sameRepo(named: string, wanted: string): boolean {
  if (named === wanted) return true;
  const bare = (repo: string) => repo.split('/').pop() ?? repo;
  return (!named.includes('/') || !wanted.includes('/')) && bare(named) === bare(wanted);
}

const STATUS_RANK: Record<string, number> = {
  blocked: 0,
  handoff: 1,
  claimed: 2,
  open: 3,
  done: 4,
};

/**
 * Todos waiting on a person first (blocked, then handoff), then live work,
 * then by priority (1 is highest), then oldest filed.
 */
export function compareTodos(a: ShiftTodo, b: ShiftTodo): number {
  return (
    (STATUS_RANK[a.status] ?? 5) - (STATUS_RANK[b.status] ?? 5) ||
    a.priority - b.priority ||
    compareInstants(a.filed_at, b.filed_at) ||
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
    return utcDayKey(at);
  }
}

/**
 * The date of "last night" in `tz`. A night is dated by the evening it
 * started, so both at 02:00 and at 15:00 the most recent completed-or-running
 * night began yesterday.
 */
export function lastNightDate(now: Date, tz: string): string {
  return shiftDayKey(dateInTz(now, tz), -1);
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

/**
 * Owner half of `owner/name`: the queue repo's owner, the owner a family's
 * bare repo names are assumed to be under. `null` when the server named no
 * queue repository — then nothing is assumed and such a repo gets no link.
 */
export function ownerOf(queueRepo: string | undefined): string | null {
  return queueRepo?.split('/')[0] || null;
}

/** A family repo as a link needs it, or null when it is not on this forge. */
export type RepoRefs = (repo: string) => RepoRef | null;

/**
 * A family's code may live under another owner than its queue (a queue under
 * `acme-split/acme-todo` whose repositories are `globex/*`). The server says
 * which; an older server says nothing and the queue's owner is the best guess.
 * With no queue repository either, a bare repo name resolves to nothing and is
 * shown without a link rather than linked at a guessed owner. `host` is the
 * forge the family's repositories are on, so links name that one.
 */
export function repoRefs(
  family: Pick<ShiftFamily, 'queue_repo' | 'repos'> | undefined,
  host: string
): RepoRefs {
  const fallback = ownerOf(family?.queue_repo);
  const known = new Map<string, string | null>();
  for (const repo of family?.repos ?? []) {
    if (repo.owner !== undefined) known.set(repo.name, repo.owner);
  }
  return (repo) => {
    // Repos may come bare (`acme-web`) or already qualified (`globex/acme-web`).
    if (repo.includes('/')) return repoRefOf(host, repo);
    const owner = known.has(repo) ? (known.get(repo) ?? null) : fallback;
    return owner === null ? null : repoRefOf(host, `${owner}/${repo}`);
  };
}

/** SPA path of a family repo's code, or null when the repo is not hosted here. */
export function repoCodeHref(refs: RepoRefs, repo: string): string | null {
  const ref = refs(repo);
  // The repository front page is where its code is read (README + Files panel).
  return ref === null ? null : repoUrl(ref);
}

export function shortSha(sha: string): string {
  return sha.slice(0, 8);
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
    step('pr', todo.pr ? `Pull request #${todo.pr.number}` : 'Pull request', prState),
    step('merged', 'Merged', merged ? 'done' : 'pending'),
    step('released', 'Released', releasedState),
  ];
}

/** One line for the trace's accessible name, e.g. "Queued, Claimed, Done, Pull request #35, Merged; Released not yet". */
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
  refs: RepoRefs,
  repo: string
): string | null {
  const pr = todo.pr;
  if (pr && bareRepo(pr.repo) === bareRepo(repo)) return todoPrHref(todo, refs);
  return repoCodeHref(refs, repo);
}

/** SPA path of the todo's shift PR (the server's `url` is already an app path). */
export function todoPrHref(todo: Pick<ShiftTodo, 'pr'>, refs: RepoRefs): string | null {
  const pr = todo.pr;
  if (!pr) return null;
  if (pr.url && pr.url.startsWith('/') && !pr.url.startsWith('//')) return pr.url;
  const ref = refs(pr.repo);
  return ref === null ? null : repoUrl(ref, 'pulls', String(pr.number));
}

/** A todo nobody has to think about any more: it is done, or it was closed. */
export function isFinishedTodo(todo: Pick<ShiftTodo, 'status'>): boolean {
  return todo.status === 'done' || todo.status === 'closed';
}

/** The actions a todo offers, in the order they are offered. */
export type TodoActionId = 'release' | 'block' | 'done' | 'close' | 'park' | 'edit';

export interface TodoActionChoice {
  id: TodoActionId;
  /** The button's own words. */
  label: string;
  /** What the confirmation's button says once the action is spelled out. */
  confirm: string;
  /** Outlined or quiet: the page's one filled button belongs to the review PR. */
  variant: 'default' | 'ghost' | 'danger';
}

const TODO_ACTIONS: Record<TodoActionId, TodoActionChoice> = {
  release: { id: 'release', label: 'Release', confirm: 'Confirm release', variant: 'default' },
  block: { id: 'block', label: 'Block', confirm: 'Confirm block', variant: 'ghost' },
  done: { id: 'done', label: 'Mark done', confirm: 'Confirm done', variant: 'default' },
  close: { id: 'close', label: 'Close', confirm: 'Confirm close', variant: 'danger' },
  park: { id: 'park', label: 'Park until…', confirm: 'Confirm park', variant: 'ghost' },
  edit: { id: 'edit', label: 'Edit', confirm: 'Save changes', variant: 'ghost' },
};

/**
 * What to offer on a todo: the first thing to do, then the rest behind a menu.
 * An `owner_task` is the operator's own job, so marking it done leads and
 * handing it to a worker is not offered; every other todo still leads with
 * releasing what is stuck or blocking what should not run. A finished todo
 * offers nothing.
 */
export function todoActions(todo: Pick<ShiftTodo, 'status' | 'block_kind'>): {
  primary: TodoActionChoice | null;
  more: TodoActionChoice[];
} {
  if (isFinishedTodo(todo)) return { primary: null, more: [] };
  const releasable =
    todo.status === 'claimed' || todo.status === 'blocked' || todo.status === 'handoff';
  const release: TodoActionChoice = {
    ...TODO_ACTIONS.release,
    variant: todo.status === 'claimed' ? 'ghost' : 'default',
  };
  const offered: TodoActionChoice[] =
    todo.block_kind === 'owner_task'
      ? [TODO_ACTIONS.done, TODO_ACTIONS.close, TODO_ACTIONS.park, TODO_ACTIONS.edit]
      : [
          releasable ? release : TODO_ACTIONS.block,
          TODO_ACTIONS.done,
          TODO_ACTIONS.close,
          TODO_ACTIONS.park,
          TODO_ACTIONS.edit,
        ];
  return { primary: offered[0] ?? null, more: offered.slice(1) };
}

/**
 * An `<input type="datetime-local">` value, turned into the RFC 3339 instant the API
 * takes: UTC, to the second. An empty or unparsable value is no instant.
 */
export function untilRfc3339(local: string): string | null {
  return rfc3339Seconds(local.trim());
}

/** What the "until" input starts at: `days` from `now`, in the reader's zone. */
export function untilInputDefault(now: Date, days = 1): string {
  const at = new Date(now.getTime() + days * 86_400_000);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(
    at.getHours()
  )}:${pad(at.getMinutes())}`;
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

/**
 * What a repo's unmerged todos mean for whoever reads the card: with no pull
 * request carrying them, a review PR is the next step; with one open, the work
 * waits for that request to merge. Nothing to say when the base branch has it
 * all, or when an older server does not report todos at all.
 */
export function unmergedTodosNote(repo: ShiftBranchRepo): string | null {
  const count = repo.unmerged_todos?.length ?? 0;
  if (count === 0) return null;
  const todos = `${count} todo${count === 1 ? '' : 's'}`;
  return prIsOpen(repo.pr)
    ? `${todos} waiting for pull request #${repo.pr?.number} to merge into the base branch`
    : `${todos} ${count === 1 ? 'needs' : 'need'} a review pull request to reach the base branch`;
}

/** Offer "Open review pull request" only when it would carry something. */
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

