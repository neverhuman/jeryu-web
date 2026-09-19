// shiftModel.test.ts — pure helpers behind the Work → Queue / Add / Workers tabs.

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_QUEUE_FILTERS,
  capacityGeometry,
  dateInTz,
  filterShiftTodos,
  formatAgo,
  isLastNight,
  lastNightDate,
  latestWorker,
  layoutSegments,
  parseList,
  queueOptions,
  repoPath,
  slotLabel,
  sortShifts,
  splitParagraphs,
  todoCost,
  todoWorkers,
} from '../shift/shiftModel';
import { SHIFTS, TODOS, attempt, todo } from './shiftTestData';

describe('shiftModel', () => {
  it('filters by status, mode, repo, requester, worker and shift', () => {
    const f = DEFAULT_QUEUE_FILTERS;
    expect(filterShiftTodos(TODOS, f).map((t) => t.status)).toEqual(['claimed', 'open', 'done']);
    expect(filterShiftTodos(TODOS, { ...f, mode: 'night' })).toHaveLength(1);
    expect(filterShiftTodos(TODOS, { ...f, repo: 'jeryu-deploy' })[0].id).toBe('20260918-2201-a9z');
    expect(filterShiftTodos(TODOS, { ...f, requested_by: 'jeryu' })).toHaveLength(1);
    expect(filterShiftTodos(TODOS, { ...f, worked_by: 'bob' })[0].status).toBe('claimed');
    expect(filterShiftTodos(TODOS, { ...f, shift: 'nightshift/2026-09-18' })).toHaveLength(1);
  });

  it('orders open work by priority then filed time', () => {
    const a = todo({ id: 'a', priority: 3, filed_at: '2026-01-01' });
    const b = todo({ id: 'b', priority: 1, filed_at: '2026-01-02' });
    const c = todo({ id: 'c', priority: 1, filed_at: '2026-01-01' });
    expect(filterShiftTodos([a, b, c], DEFAULT_QUEUE_FILTERS).map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });

  it('derives filter options and worker names', () => {
    const opts = queueOptions(TODOS);
    expect(opts.repos).toEqual(['jeryu-deploy', 'jeryu-web']);
    expect(opts.requesters).toEqual(['alton', 'jeryu']);
    expect(opts.workers).toEqual(['alton', 'bob']);
    expect(opts.shifts).toEqual(['nightshift/2026-09-18']);
    expect(todoWorkers(TODOS[2])).toEqual(['bob']);
  });

  it('names the latest worker', () => {
    expect(latestWorker(TODOS[1])).toBe('alton/w1');
    expect(latestWorker(TODOS[2])).toBe('bob@xbabe1/w2');
    expect(latestWorker(todo({ worked_by: [attempt(), attempt({ by: 'eve', slot: '' })] }))).toBe('eve');
    expect(latestWorker(TODOS[0])).toBeNull();
  });

  it('splits paste-many text on blank lines', () => {
    expect(splitParagraphs('one\nstill one\n\n  \ntwo\n\n\n')).toEqual(['one\nstill one', 'two']);
    expect(splitParagraphs('  ')).toEqual([]);
    expect(parseList('a, b  c,a')).toEqual(['a', 'b', 'c']);
  });

  it('dates last night in the shift time zone', () => {
    // 2026-09-19 03:00 UTC is 2026-09-18 20:00 in Los Angeles.
    const at = new Date('2026-09-19T03:00:00Z');
    expect(dateInTz(at, 'America/Los_Angeles')).toBe('2026-09-18');
    expect(lastNightDate(at, 'America/Los_Angeles')).toBe('2026-09-17');
    // 16:00 UTC is 09:00 LA on the 19th → last night began the 18th.
    const morning = new Date('2026-09-19T16:00:00Z');
    expect(lastNightDate(morning, 'America/Los_Angeles')).toBe('2026-09-18');
    expect(isLastNight(SHIFTS.shifts[0], morning, 'America/Los_Angeles')).toBe(true);
    expect(isLastNight(SHIFTS.shifts[1], morning, 'America/Los_Angeles')).toBe(false);
    expect(dateInTz(at, 'Not/AZone')).toBe('2026-09-19');
  });

  it('sorts shifts newest first', () => {
    expect(sortShifts([...SHIFTS.shifts].reverse()).map((s) => s.branch)).toEqual([
      'nightshift/2026-09-18',
      'bulletshift/2026-09-17',
    ]);
  });

  it('builds repo paths and relative times', () => {
    expect(repoPath('jeryu', 'jeryu-web')).toBe('/repos/jeryu/jeryu/jeryu-web');
    expect(repoPath('jeryu', 'other/x')).toBe('/repos/jeryu/other/x');
    const now = new Date('2026-09-19T09:00:00Z');
    expect(formatAgo('2026-09-19T08:59:50Z', now)).toBe('10s ago');
    expect(formatAgo('2026-09-19T10:00:00Z', now)).toBe('in 1h');
    expect(formatAgo(null, now)).toBe('—');
  });

  it('lays out timeline segments clipped to the window', () => {
    const bars = layoutSegments(
      [
        { from: '2026-09-18T00:00:00Z', to: '2026-09-18T06:00:00Z', state: 'idle' },
        { from: '2026-09-18T06:00:00Z', to: '2026-09-18T18:00:00Z', state: 'working', todo_id: 't1', stage: 'gate' },
        { from: '2026-09-19T00:00:00Z', to: '2026-09-19T01:00:00Z', state: 'idle' },
      ],
      '2026-09-18T00:00:00Z',
      '2026-09-19T00:00:00Z',
      240
    );
    expect(bars).toHaveLength(2);
    expect(bars[0]).toMatchObject({ x: 0, width: 60, state: 'idle' });
    expect(bars[1]).toMatchObject({ x: 60, width: 120, label: 't1' });
    expect(bars[1].title).toContain('working · gate · t1');
    expect(layoutSegments([], 'x', 'y', 10)).toEqual([]);
  });

  it('computes capacity geometry', () => {
    const geo = capacityGeometry(
      [
        { at: 'h0', planned: 2, busy: 1, queue_depth: 4 },
        { at: 'h1', planned: 4, busy: 4 },
      ],
      100,
      40
    );
    expect(geo.max).toBe(4);
    expect(geo.plannedPath).toBe('M0,20 L50,20 L50,0 L100,0');
    expect(geo.bars[0]).toMatchObject({ y: 30, height: 10 });
    expect(geo.queuePoints).toBe('25,0 75,40');
    expect(capacityGeometry([{ at: 'h', planned: 1, busy: 0 }], 10, 10).queuePoints).toBe('');
    expect(capacityGeometry([], 10, 10).bars).toEqual([]);
  });
});

describe('slotLabel', () => {
  it('does not repeat a host the operator name already carries', () => {
    expect(slotLabel('alton@xbabe0', 'xbabe0', 'w1')).toBe('alton@xbabe0/w1');
    expect(slotLabel('alton', 'xbabe0', 'w1')).toBe('alton@xbabe0/w1');
    expect(slotLabel('alton', '', 'w1')).toBe('alton/w1');
  });

  it('totals a todo cost across attempts, null when none reported one', () => {
    expect(todoCost(todo())).toBeNull();
    expect(todoCost(todo({ worked_by: [attempt({ cost_usd: null })] }))).toBeNull();
    expect(todoCost(todo({ worked_by: [attempt({ cost_usd: 1.25 }), attempt({ cost_usd: null }), attempt({ cost_usd: 0.5 })] }))).toBe(1.75);
  });
});
