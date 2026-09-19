// shiftModel.ts — pure helpers for the Work → Queue / Add / Workers tabs.
//
// Everything here is deterministic given its inputs (including `now`) so the
// filters, shift dating and chart geometry are unit-tested without a DOM.

import type {
  ShiftBranch,
  ShiftCapacityPoint,
  ShiftSegment,
  ShiftTodo,
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
        (filters.repo === 'all' || todo.repos.includes(filters.repo)) &&
        (filters.worked_by === 'all' || todoWorkers(todo).includes(filters.worked_by))
    )
    .sort(compareTodos);
}

const STATUS_RANK: Record<string, number> = {
  claimed: 0,
  open: 1,
  blocked: 2,
  handoff: 3,
  done: 4,
};

/** Live work first, then by priority (1 is highest), then oldest filed. */
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

export function isLastNight(shift: ShiftBranch, now: Date, tz: string): boolean {
  return shift.kind === 'nightshift' && shift.date === lastNightDate(now, tz);
}

/** Newest shifts first; a nightshift sorts after the bulletshift of its date. */
export function sortShifts(shifts: ShiftBranch[]): ShiftBranch[] {
  return [...shifts].sort(
    (a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind)
  );
}

/** Owner half of `owner/name` (the queue repo's owner hosts the family repos). */
export function ownerOf(queueRepo: string | undefined): string {
  return queueRepo?.split('/')[0] || 'jeryu';
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

export function formatCost(cost: number | null | undefined): string {
  return cost === null || cost === undefined ? '—' : `$${cost.toFixed(2)}`;
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
