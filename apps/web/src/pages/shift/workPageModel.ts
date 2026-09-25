// workPageModel.ts — pure helpers for the one-page Work view: family counts and
// filtering across every queue, the one-line workers summary and its sparkline.

import type { ShiftCapacityPoint, ShiftTodo, ShiftWorker } from '../../api/types';
import { familyName } from '../needsYou/needsYouModel';
import { isFinishedTodo, isLongStale } from './shiftModel';
import { isSupervisor } from './workersModel';

/** The name a reader sees: `jeryu-split` and `jeryu` are one family. */
export function todoFamily(todo: Pick<ShiftTodo, 'family'>): string {
  return familyName(todo.family) ?? 'unknown';
}

export interface FamilyCount {
  family: string;
  count: number;
}

/** Live (not finished) todos per family, busiest first. */
export function liveFamilyCounts(todos: ShiftTodo[]): FamilyCount[] {
  const counts = new Map<string, number>();
  for (const todo of todos) {
    if (isFinishedTodo(todo)) continue;
    const family = todoFamily(todo);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return [...counts]
    .map(([family, count]) => ({ family, count }))
    .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
}

/** Keep one family's todos; an empty family keeps them all. */
export function todosOfFamily(todos: ShiftTodo[], family: string): ShiftTodo[] {
  return family ? todos.filter((todo) => todoFamily(todo) === family) : todos;
}

export interface WorkingSlot {
  family: string;
  slot: string;
  todoId: string;
  /** The todo's title when the queue knows it, else its id. */
  title: string;
  stage: string | null;
}

export interface WorkersLine {
  total: number;
  healthy: number;
  paused: number;
  working: WorkingSlot[];
  /** A slot seen within the hour that stopped answering: someone should look. */
  unhealthy: number;
  text: string;
}

const TITLE_CHARS = 48;

function clip(text: string): string {
  return text.length > TITLE_CHARS ? `${text.slice(0, TITLE_CHARS - 1)}…` : text;
}

/**
 * The workers block in one line. Supervisors (they carry no work) and slots
 * unseen for over an hour (ghosts of old runs) are left out of the counts.
 */
export function workersLine(workers: ShiftWorker[], todos: ShiftTodo[], now: Date): WorkersLine {
  const slots = workers.filter((w) => !isSupervisor(w) && !isLongStale(w, now));
  const titles = new Map(todos.map((todo) => [todo.id, todo.title]));
  const working = slots
    .filter((w) => w.state === 'working' && w.todo_id)
    .map((w) => ({
      family: familyName(w.family) ?? 'unknown',
      slot: w.slot,
      todoId: w.todo_id ?? '',
      title: clip(titles.get(w.todo_id ?? '') ?? w.todo_id ?? ''),
      stage: w.stage ?? null,
    }));
  const healthy = slots.filter((w) => w.healthy).length;
  const paused = slots.filter((w) => w.state === 'paused').length;
  const parts = [
    slots.length === 0
      ? 'No worker slot seen in the last hour'
      : `${healthy} of ${slots.length} slot${slots.length === 1 ? '' : 's'} healthy`,
    `${working.length} working`,
    `${paused} paused`,
  ];
  return {
    total: slots.length,
    healthy,
    paused,
    working,
    unhealthy: slots.length - healthy,
    text: parts.join(' · '),
  };
}

/** `points` attribute of a polyline tracing busy slots; '' when there is nothing to draw. */
export function busySparkline(points: ShiftCapacityPoint[], width: number, height: number): string {
  if (points.length < 2) return '';
  const peak = Math.max(1, ...points.map((p) => Math.max(p.busy, p.planned)));
  const step = width / (points.length - 1);
  return points
    .map((p, i) => `${(i * step).toFixed(1)},${(height - (p.busy / peak) * height).toFixed(1)}`)
    .join(' ');
}

export interface NightWindow {
  open: boolean;
  /** `22:00–07:00 America/Los_Angeles`. */
  span: string;
  /** Night-mode todos still open: they wait for the window while it is closed. */
  waiting: number;
  text: string;
}

function clockMinutes(part: string): number | null {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(part.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  return h <= 24 && min < 60 ? (h % 24) * 60 + min : null;
}

function clockText(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Minutes past midnight of `at` in `tz`, or null when the zone is unknown. */
export function minutesInTz(at: Date, tz: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value);
    return Number.isNaN(hour) || Number.isNaN(minute) ? null : hour * 60 + minute;
  } catch {
    return null;
  }
}

/**
 * Whether the night window the workers report (`schedule.night.hours`, e.g.
 * `22:00-07:00`, in `schedule.tz`) is open now, so a quiet strip can say why
 * nothing runs. Null when no worker reports a schedule.
 */
export function nightWindow(workers: ShiftWorker[], todos: ShiftTodo[], now: Date): NightWindow | null {
  const schedule = workers.find((w) => w.schedule?.night?.hours && w.schedule.tz)?.schedule;
  if (!schedule) return null;
  const [from, to] = schedule.night.hours.split(/\s*[-–—]\s*/).map(clockMinutes);
  const at = minutesInTz(now, schedule.tz);
  if (from === null || from === undefined || to === null || to === undefined || at === null) return null;
  const open = from <= to ? at >= from && at < to : at >= from || at < to;
  const span = `${clockText(from)}–${clockText(to)} ${schedule.tz}`;
  const waiting = todos.filter((t) => t.mode === 'night' && t.status === 'open').length;
  const text = open
    ? `night window open (${span})`
    : `night window closed (${span})${waiting > 0 ? ` · ${waiting} night todo${waiting === 1 ? '' : 's'} wait for it` : ''}`;
  return { open, span, waiting, text };
}

export type LiveGroupKey = 'progress' | 'human' | 'queued';

export interface LiveGroup {
  key: LiveGroupKey;
  title: string;
  todos: ShiftTodo[];
}

/**
 * Live todos by where they stand, in the queue's order: waiting on a
 * person (on top, as before), being worked (claimed or holding a live
 * lease), or queued (open, nobody on it). Empty groups
 * are left out.
 */
export function groupLive(todos: ShiftTodo[]): LiveGroup[] {
  const groups: LiveGroup[] = [
    { key: 'human', title: 'Waiting on a human', todos: [] },
    { key: 'progress', title: 'In progress', todos: [] },
    { key: 'queued', title: 'Queued', todos: [] },
  ];
  for (const todo of todos) {
    const key: LiveGroupKey =
      todo.status === 'claimed' || todo.lease_live
        ? 'progress'
        : todo.status === 'blocked' || todo.status === 'handoff'
          ? 'human'
          : 'queued';
    groups.find((g) => g.key === key)?.todos.push(todo);
  }
  return groups.filter((g) => g.todos.length > 0);
}
