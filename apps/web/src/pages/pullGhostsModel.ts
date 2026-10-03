// pullGhostsModel.ts — shift work that has not opened a pull request yet.
//
// The In flight timeline reads future → present → past: these "ghost" rows
// sit above the real PR rows, so incoming work is visible before it exists as a
// PR. Everything is pure and deterministic given `options.now`; the lifecycle
// itself is `todoTrace` from the Work page — this module only admits, groups and
// words the rows.

import type { ShiftTodo } from '../api/types';
import { relativeText, shiftDayKey } from '../format/when';
import {
  compareTodos,
  dateInTz,
  latestWorker,
  normalizeShiftKind,
  todoTrace,
  type TraceStep,
} from './shift/shiftModel';

export type { TraceStep };

/**
 * `dayshift` is canonical; `bulletshift` is its legacy name and is normalised
 * away on the way in, so in-flight branches and older servers still group and
 * date correctly.
 */
export type ShiftKind = 'dayshift' | 'nightshift' | 'unscheduled';

export interface GhostRow {
  todoId: string;
  title: string;
  family: string;
  repos: string[];
  /** The todo's status, so a reader of the rows can tell live work from queued. */
  status: string;
  kind: ShiftKind;
  /** YYYY-MM-DD of the shift, null when unscheduled. */
  date: string | null;
  steps: TraceStep[];
  /** Short truthful "when": never an invented ETA. */
  when: string;
  /** A person is the next step: this todo is on the Needs you list. */
  attention: boolean;
  /** Worker holding it, e.g. `alton/w2`, else null. */
  worker: string | null;
}

export interface GhostGroup {
  key: string;
  label: string;
  /** Second line, e.g. '3 in flight · 12 queued'. */
  hint: string;
  rows: GhostRow[];
  /** Admitted-but-not-shown open todos, for a "+N queued" link. */
  queued: number;
}

export interface GhostOptions {
  now: Date;
  /** IANA zone for the nightshift window; default 'America/Denver'. */
  tz?: string;
  /** Keep only todos touching one of these repos (bare or owner/name); null = all. */
  repos?: ReadonlySet<string> | null;
  /** Family to keep; '' or undefined = all. */
  family?: string;
  /** Open todos shown per group before the rest collapse into `queued`. Default 3. */
  openLimit?: number;
  /**
   * Todo ids the Needs you list is waiting on a person for. A ghost row wears
   * red when its todo is one of them, so the row and that list agree instead of
   * this module deciding from the todo's status. Unknown (the list is not
   * readable, or has not arrived) marks no row.
   */
  attentionTodoIds?: ReadonlySet<string>;
}

const DEFAULT_TZ = 'America/Denver';
const DEFAULT_OPEN_LIMIT = 3;
const STALE_DONE_MS = 7 * 24 * 60 * 60 * 1000;
const NO_ATTENTION: ReadonlySet<string> = new Set<string>();

/** Key `repo#number` → todo id, so a real PR row can link back to its todo. */
export function todoByPr(todos: readonly ShiftTodo[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const todo of todos) {
    const pr = todo.pr;
    if (!pr) continue;
    map.set(`${bareRepo(pr.repo)}#${pr.number}`, todo.id);
  }
  return map;
}

export function pullGhostGroups(
  todos: readonly ShiftTodo[],
  options: GhostOptions
): GhostGroup[] {
  const tz = options.tz ?? DEFAULT_TZ;
  const openLimit = options.openLimit ?? DEFAULT_OPEN_LIMIT;
  const family = options.family ?? '';
  const wanted = options.repos ?? null;

  const candidates = todos
    .filter((todo) => (family === '' || todo.family === family))
    .filter((todo) => matchesRepos(todo, wanted))
    .filter((todo) => isIncoming(todo, options.now));

  const buckets = new Map<string, ShiftTodo[]>();
  for (const todo of candidates) {
    const key = groupKeyOf(todo);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(todo);
    else buckets.set(key, [todo]);
  }

  const groups: GhostGroup[] = [];
  for (const [key, bucket] of buckets) {
    const sorted = [...bucket].sort(compareTodos);
    const opens = sorted.filter((todo) => todo.status === 'open');
    const shownOpens = new Set(opens.slice(0, openLimit).map((todo) => todo.id));
    const queued = Math.max(0, opens.length - shownOpens.size);
    const queuePosition = new Map<string, number>();
    opens.forEach((todo, index) => queuePosition.set(todo.id, index + 1));

    const { kind, date } = partsOf(key);
    const rows = sorted
      .filter((todo) => todo.status !== 'open' || shownOpens.has(todo.id))
      .map((todo) =>
        row(
          todo,
          kind,
          date,
          options.now,
          queuePosition.get(todo.id) ?? 0,
          options.attentionTodoIds ?? NO_ATTENTION
        )
      );
    if (rows.length === 0 && queued === 0) continue;
    groups.push({
      key,
      label: labelOf(key, kind),
      hint: hintOf(rows, queued, kind, date, options.now, tz),
      rows,
      queued,
    });
  }
  return groups.sort(compareGroups);
}

// ------------------------------------------------------------- admission

/** Work that will plausibly become a pull request soon. */
function isIncoming(todo: ShiftTodo, now: Date): boolean {
  // Already a real PR row (or landed): not a ghost.
  if (todo.pr) return false;
  if (todo.merged) return false;
  if (todo.status === 'claimed') return true;
  if (todo.status === 'blocked' || todo.status === 'handoff') return true;
  if (todo.status === 'done') return !isStaleDone(todo, now);
  // `open` todos are admitted, then cut to `openLimit` inside their group.
  return todo.status === 'open';
}

/** Done, but nothing to show for it and long past: stale, not incoming. */
function isStaleDone(todo: ShiftTodo, now: Date): boolean {
  if (Object.keys(todo.commits).length > 0) return false;
  const at = Date.parse(lastActivity(todo));
  if (Number.isNaN(at)) return false;
  return now.getTime() - at > STALE_DONE_MS;
}

function lastActivity(todo: ShiftTodo): string {
  const last = todo.worked_by[todo.worked_by.length - 1];
  return last?.ended ?? last?.started ?? todo.filed_at;
}

function matchesRepos(todo: ShiftTodo, wanted: ReadonlySet<string> | null): boolean {
  if (!wanted || wanted.size === 0) return wanted === null;
  const bare = new Set([...wanted].map(bareRepo));
  return todo.repos.some((repo) => bare.has(bareRepo(repo)));
}

function bareRepo(repo: string): string {
  return repo.split('/').pop() ?? repo;
}

// ------------------------------------------------------------------ rows

function row(
  todo: ShiftTodo,
  kind: ShiftKind,
  date: string | null,
  now: Date,
  queuePosition: number,
  attentionTodoIds: ReadonlySet<string>
): GhostRow {
  return {
    todoId: todo.id,
    title: todo.title,
    family: todo.family,
    repos: todo.repos,
    status: todo.status,
    kind,
    date,
    steps: todoTrace(todo),
    when: whenOf(todo, now, queuePosition),
    attention: attentionTodoIds.has(todo.id),
    worker: latestWorker(todo),
  };
}

/** Truthful "when": there is no ETA field, so never a countdown to PR open. */
export function whenOf(todo: ShiftTodo, now: Date, queuePosition = 0): string {
  if (todo.status === 'claimed') {
    const until = todo.lease_until ? Date.parse(todo.lease_until) : NaN;
    const live = todo.lease_live && !Number.isNaN(until) && until > now.getTime();
    return live
      ? `hands off ${relativeText(todo.lease_until, now)}`
      : 'lease expired — stalled';
  }
  if (todo.status === 'blocked') return 'blocked — needs a human';
  if (todo.status === 'handoff') return 'handed off — needs a human';
  if (todo.status === 'done' && !todo.pr) return 'Pull request pending';
  if (todo.status === 'open') {
    if (todo.mode === 'night') return 'tonight';
    if (todo.mode === 'now' && queuePosition > 0) return queueWord(queuePosition);
  }
  return 'queued';
}

function queueWord(position: number): string {
  return position === 1 ? 'next up' : `${ordinal(position)} in queue`;
}

function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

// -------------------------------------------------------------- grouping

const SHIFT_HEADS = new Set(['dayshift', 'bulletshift', 'nightshift']);

function groupKeyOf(todo: ShiftTodo): string {
  const shift = todo.shift ?? '';
  if (shift.includes('/')) {
    const { kind, date } = partsOf(shift);
    // A legacy `bulletshift/<date>` groups with the dayshift of that date.
    return kind === 'unscheduled' ? shift : `${kind}/${date ?? ''}`;
  }
  return `unscheduled/${todo.mode}`;
}

function partsOf(key: string): { kind: ShiftKind; date: string | null } {
  const [head, tail] = key.split('/');
  if (SHIFT_HEADS.has(head)) {
    return { kind: normalizeShiftKind(head), date: tail ?? null };
  }
  return { kind: 'unscheduled', date: null };
}

function labelOf(key: string, kind: ShiftKind): string {
  if (kind === 'unscheduled') {
    return key === 'unscheduled/night' ? 'nightshift (unscheduled)' : 'unscheduled';
  }
  return key.replace('/', ' ');
}

function compareGroups(a: GhostGroup, b: GhostGroup): number {
  const ua = a.key.startsWith('unscheduled/') ? 1 : 0;
  const ub = b.key.startsWith('unscheduled/') ? 1 : 0;
  if (ua !== ub) return ua - ub;
  const da = partsOf(a.key).date ?? '';
  const db = partsOf(b.key).date ?? '';
  // Newest date first; a nightshift sorts after the dayshift of its date.
  return db.localeCompare(da) || a.key.localeCompare(b.key);
}

function hintOf(
  rows: GhostRow[],
  queued: number,
  kind: ShiftKind,
  date: string | null,
  now: Date,
  tz: string
): string {
  const parts: string[] = [];
  const inFlight = rows.filter((r) => isClaimed(r)).length;
  const onlyOpen = rows.length > 0 && rows.every((r) => !isClaimed(r) && !r.attention && r.when === 'tonight');
  if (kind === 'nightshift' && date !== null && onlyOpen && isTonightish(date, now, tz)) {
    parts.push('opens tonight');
  }
  if (inFlight > 0) parts.push(`${inFlight} in flight`);
  if (queued > 0) parts.push(`${queued} queued`);
  return parts.join(' · ');
}

/** A claimed row: its trace has `claimed` in progress. */
function isClaimed(row: GhostRow): boolean {
  return row.steps.some((step) => step.key === 'claimed' && step.state === 'current');
}

function isTonightish(date: string, now: Date, tz: string): boolean {
  const today = dateInTz(now, tz);
  return date === today || date === nextDay(today);
}

function nextDay(date: string): string {
  return shiftDayKey(date, 1);
}
