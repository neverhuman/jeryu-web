import { describe, expect, it } from 'vitest';

import {
  busySparkline,
  liveFamilyCounts,
  todoFamily,
  todosOfFamily,
  workersLine,
} from '../shift/workPageModel';
import { WORKERS, todo } from './shiftTestData';

describe('workPageModel', () => {
  it('counts live todos per family, busiest first, and filters to one', () => {
    const todos = [
      todo({ id: 'a', family: 'jain', status: 'open' }),
      todo({ id: 'b', family: 'jeryu', status: 'claimed' }),
      todo({ id: 'c', family: 'jeryu', status: 'blocked' }),
      todo({ id: 'd', family: 'jeryu', status: 'done' }),
      todo({ id: 'e', family: 'jeryu-split', status: 'open' }),
    ];
    // Finished work is not counted; `jeryu-split` and `jeryu` read as one family.
    expect(liveFamilyCounts(todos)).toEqual([
      { family: 'jeryu', count: 3 },
      { family: 'jain', count: 1 },
    ]);
    expect(todoFamily({ family: 'jeryu-split' })).toBe('jeryu');
    expect(todosOfFamily(todos, 'jain').map((t) => t.id)).toEqual(['a']);
    expect(todosOfFamily(todos, 'jeryu').map((t) => t.id)).toEqual(['b', 'c', 'd', 'e']);
    expect(todosOfFamily(todos, '')).toHaveLength(5);
  });

  it('says who is working in one line, without supervisors or hour-old ghosts', () => {
    const now = new Date('2026-09-19T09:05:00Z');
    const supervisor = { ...WORKERS.workers[0], slot: 'supervisor', state: 'idle', todo_id: null };
    const line = workersLine(
      [...WORKERS.workers, supervisor],
      [todo({ id: '20260919-0900-q1q', title: 'Claimed thing' })],
      now
    );
    // xbabe1/w2 was last seen an hour ago: a ghost, not an unhealthy slot.
    expect(line.text).toBe('1 of 1 slot healthy · 1 working · 0 paused');
    expect(line.unhealthy).toBe(0);
    expect(line.working).toEqual([
      { family: 'jeryu', slot: 'w1', todoId: '20260919-0900-q1q', title: 'Claimed thing', stage: 'agent' },
    ]);
  });

  it('warns about a slot that went quiet minutes ago, names an unknown todo by id, clips long titles', () => {
    const now = new Date('2026-09-19T09:00:00Z');
    const quiet = { ...WORKERS.workers[0], slot: 'w3', healthy: false, last_seen: '2026-09-19T08:50:00Z', state: 'paused', todo_id: null };
    const busy = { ...WORKERS.workers[0], todo_id: 'unknown-id' };
    const line = workersLine([busy, quiet], [], now);
    expect(line.text).toBe('1 of 2 slots healthy · 1 working · 1 paused');
    expect(line.unhealthy).toBe(1);
    expect(line.working[0]?.title).toBe('unknown-id');
    const long = workersLine([{ ...busy, todo_id: 't' }], [todo({ id: 't', title: 'x'.repeat(80) })], now);
    expect(long.working[0]?.title).toHaveLength(48);
    expect(workersLine([], [], now).text).toBe('No worker slot seen in the last hour · 0 working · 0 paused');
  });

  it('traces busy slots as a sparkline, and draws nothing from fewer than two samples', () => {
    const points = [
      { at: 'a', planned: 4, busy: 0 },
      { at: 'b', planned: 4, busy: 2 },
      { at: 'c', planned: 4, busy: 4 },
    ];
    expect(busySparkline(points, 100, 20)).toBe('0.0,20.0 50.0,10.0 100.0,0.0');
    expect(busySparkline(points.slice(0, 1), 100, 20)).toBe('');
    expect(busySparkline([], 100, 20)).toBe('');
  });
});
