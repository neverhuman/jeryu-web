import { describe, expect, it } from 'vitest';

import {
  budgetSpentLines,
  busySparkline,
  groupLive,
  liveFamilyCounts,
  nightWindow,
  todoFamily,
  todosOfFamily,
  workersLine,
} from '../shift/workPageModel';
import { ATTENTION, BUDGET_SPENT, attentionItem } from './pipelineTestData';
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

  it('separates queued todos from those in progress and those waiting on a human', () => {
    const groups = groupLive([
      todo({ id: 'q', status: 'open', attempts: 0 }),
      todo({ id: 'c', status: 'claimed' }),
      todo({ id: 'l', status: 'open', lease_live: true }),
      todo({ id: 'b', status: 'blocked' }),
      todo({ id: 'h', status: 'handoff' }),
    ]);
    expect(groups.map((g) => [g.title, g.todos.map((t) => t.id)])).toEqual([
      ['Waiting on a human', ['b', 'h']],
      ['In progress', ['c', 'l']],
      ['Queued', ['q']],
    ]);
    expect(groupLive([todo({ id: 'q', status: 'open' })]).map((g) => g.key)).toEqual(['queued']);
  });

  it('says whether the night window is open, in the schedule zone', () => {
    const schedule = {
      always: 0,
      day: { hours: '07:00-22:00', slots: 1 },
      night: { hours: '22:00-07:00', slots: 4 },
      tz: 'America/Los_Angeles',
    };
    const workers = WORKERS.workers.map((w) => ({ ...w, schedule }));
    const todos = [
      todo({ id: 'n1', mode: 'night', status: 'open' }),
      todo({ id: 'n2', mode: 'night', status: 'open' }),
      todo({ id: 'n3', mode: 'now', status: 'open' }),
    ];
    // 16:00 in Los Angeles (PDT, UTC-7): closed, and two night todos wait for it.
    const closed = nightWindow(workers, todos, new Date('2026-09-21T23:00:00Z'));
    expect(closed).toMatchObject({ open: false, waiting: 2 });
    expect(closed?.text).toBe(
      'night window closed (22:00–07:00 America/Los_Angeles) · 2 night todos wait for it'
    );
    // 23:30 and 06:59 local are inside a window that crosses midnight; 07:00 is not.
    expect(nightWindow(workers, todos, new Date('2026-09-22T06:30:00Z'))?.open).toBe(true);
    expect(nightWindow(workers, todos, new Date('2026-09-22T13:59:00Z'))?.open).toBe(true);
    expect(nightWindow(workers, todos, new Date('2026-09-22T14:00:00Z'))?.open).toBe(false);
    expect(nightWindow(workers, [], new Date('2026-09-22T06:30:00Z'))?.text).toBe(
      'night window open (22:00–07:00 America/Los_Angeles)'
    );
    // No schedule reported, or one that cannot be read: say nothing rather than guess.
    expect(nightWindow(WORKERS.workers.map((w) => ({ ...w, schedule: null })), todos, new Date())).toBeNull();
    expect(
      nightWindow(workers.map((w) => ({ ...w, schedule: { ...schedule, night: { hours: 'nights', slots: 4 } } })), todos, new Date())
    ).toBeNull();
  });

  it('says what a spent shift budget left waiting, per family and filtered', () => {
    const data = {
      ...ATTENTION,
      items: [
        ...ATTENTION.items,
        BUDGET_SPENT,
        attentionItem({
          id: 'shift-budget-spent:globex:nightshift/2026-10-03',
          kind: 'shift_budget_spent',
          family: 'globex',
          budget: { spent_usd: 8.5, budget_usd: null, waiting: 1 },
        }),
      ],
    };
    expect(budgetSpentLines(data, '')).toEqual([
      { family: 'acme', text: 'spent $42.00 of $40.00 this shift · 3 todos waiting on budget' },
      { family: 'globex', text: 'spent $8.50 this shift · 1 todo waiting on budget' },
    ]);
    expect(budgetSpentLines(data, 'acme')).toHaveLength(1);
    // Nothing of the kind, no line at all; neither number read, no money.
    expect(budgetSpentLines(ATTENTION, '')).toEqual([]);
    expect(budgetSpentLines(undefined, '')).toEqual([]);
    expect(
      budgetSpentLines(
        { ...ATTENTION, items: [attentionItem({ id: 'x', kind: 'shift_budget_spent', family: 'initech' })] },
        ''
      )
    ).toEqual([{ family: 'initech', text: 'shift budget spent' }]);
  });
});
