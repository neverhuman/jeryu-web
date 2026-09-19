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
