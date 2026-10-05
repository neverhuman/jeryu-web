import { describe, expect, it } from 'vitest';

import type { ShiftTodo } from '../../api/types';
import { pullGhostGroups, todoByPr, type GhostGroup } from '../pullGhostsModel';

const NOW = new Date('2026-09-20T04:00:00Z');

function todo(id: string, extra: Partial<ShiftTodo> = {}): ShiftTodo {
  return {
    id,
    family: 'jeryu',
    title: `todo ${id}`,
    body: '',
    repos: ['jeryu-web'],
    mode: 'now',
    priority: 2,
    blocked_by: [],
    status: 'open',
    attempts: 0,
    requested_by: 'alton',
    filed_at: '2026-09-19T00:00:00Z',
    claim_by: null,
    lease_until: null,
    lease_live: false,
    shift: 'dayshift/2026-09-19',
    change_set: null,
    commits: {},
    merged: false,
    note: '',
    triaged: true,
    worked_by: [],
    ...extra,
  };
}

function groups(todos: ShiftTodo[], extra: Partial<Parameters<typeof pullGhostGroups>[1]> = {}): GhostGroup[] {
  return pullGhostGroups(todos, { now: NOW, ...extra });
}

const ids = (group: GhostGroup): string[] => group.rows.map((r) => r.todoId);
const whens = (group: GhostGroup): string[] => group.rows.map((r) => r.when);

describe('pullGhostGroups admission', () => {
  it('admits claimed, blocked and handoff todos', () => {
    const [group] = groups([
      todo('a', { status: 'claimed', lease_live: true, lease_until: '2026-09-20T04:14:00Z', claim_by: 'alton/w2' }),
      todo('b', { status: 'blocked' }),
      todo('c', { status: 'handoff' }),
    ]);
    expect(ids(group).sort()).toEqual(['a', 'b', 'c']);
  });

  it('admits a done todo with no PR yet', () => {
    const [group] = groups([todo('a', { status: 'done', commits: { 'jeryu-web': 'abc' } })]);
    expect(ids(group)).toEqual(['a']);
    expect(whens(group)).toEqual(['Pull request pending']);
  });

  it('excludes todos that already have a PR row, and merged ones', () => {
    const result = groups([
      todo('a', { status: 'done', pr: { repo: 'jeryu-web', number: 7, state: 'open', url: '/p/7' } }),
      todo('b', { status: 'claimed', pr: { repo: 'jeryu-web', number: 8, state: 'open', url: '/p/8' } }),
      todo('c', { status: 'done', merged: true }),
    ]);
    expect(result).toEqual([]);
  });

  it('drops a stale done todo with no PR and no commits', () => {
    const stale = todo('old', { status: 'done', filed_at: '2026-08-01T00:00:00Z' });
    const fresh = todo('new', { status: 'done', filed_at: '2026-09-18T00:00:00Z' });
    const [group] = groups([stale, fresh]);
    expect(ids(group)).toEqual(['new']);
  });

  it('keeps an old done todo that has commits', () => {
    const [group] = groups([
      todo('old', { status: 'done', filed_at: '2026-08-01T00:00:00Z', commits: { 'jeryu-web': 'abc' } }),
    ]);
    expect(ids(group)).toEqual(['old']);
  });

  it('ages a done todo from its last attempt, not only from filing', () => {
    const [group] = groups([
      todo('a', {
        status: 'done',
        filed_at: '2026-08-01T00:00:00Z',
        worked_by: [
          {
            by: 'alton', host: 'xbabe0', slot: 'w1', model: 'opus', session: null,
            started: '2026-09-19T00:00:00Z', ended: '2026-09-19T01:00:00Z',
            outcome: 'done', cost_usd: null, note: '', shift: null,
          },
        ],
      }),
    ]);
    expect(ids(group)).toEqual(['a']);
  });
});

describe('pullGhostGroups openLimit', () => {
  const opens = [1, 2, 3, 4, 5].map((n) =>
    todo(`o${n}`, { status: 'open', filed_at: `2026-09-19T0${n}:00:00Z` })
  );

  it('shows the first three open todos and counts the rest as queued', () => {
    const [group] = groups(opens);
    expect(ids(group)).toEqual(['o1', 'o2', 'o3']);
    expect(group.queued).toBe(2);
    expect(group.hint).toBe('2 queued');
  });

  it('honours a custom openLimit', () => {
    const [group] = groups(opens, { openLimit: 1 });
    expect(ids(group)).toEqual(['o1']);
    expect(group.queued).toBe(4);
  });

  it('never collapses non-open todos', () => {
    const [group] = groups([...opens, todo('c', { status: 'claimed' }), todo('b', { status: 'blocked' })]);
    expect(ids(group)).toEqual(['b', 'c', 'o1', 'o2', 'o3']);
    expect(group.queued).toBe(2);
    expect(group.hint).toBe('1 in flight · 2 queued');
  });
});

describe('pullGhostGroups when', () => {
  it('reports a live lease as a hand-off time', () => {
    const [group] = groups([
      todo('a', { status: 'claimed', lease_live: true, lease_until: '2026-09-20T04:14:00Z', claim_by: 'alton/w2' }),
    ]);
    expect(group.rows[0]?.when).toBe('hands off in 14 min');
    expect(group.rows[0]?.worker).toBe('alton/w2');
  });

  it('reports an expired lease as a stall', () => {
    const [group] = groups([
      todo('a', { status: 'claimed', lease_live: true, lease_until: '2026-09-20T03:00:00Z' }),
    ]);
    expect(group.rows[0]?.when).toBe('lease expired — stalled');
  });

  it('reports a dead lease as a stall even when it has not expired', () => {
    const [group] = groups([
      todo('a', { status: 'claimed', lease_live: false, lease_until: '2026-09-20T05:00:00Z' }),
    ]);
    expect(group.rows[0]?.when).toBe('lease expired — stalled');
  });

  it('words blocked and handoff for a human', () => {
    const [group] = groups([todo('a', { status: 'blocked' }), todo('b', { status: 'handoff' })]);
    expect(whens(group)).toEqual(['blocked — needs a human', 'handed off — needs a human']);
    expect(group.rows.map((r) => r.attention)).toEqual([true, true]);
  });

  it('says PR pending for done work with no PR', () => {
    const [group] = groups([todo('a', { status: 'done' })]);
    expect(group.rows[0]?.when).toBe('Pull request pending');
    expect(group.rows[0]?.attention).toBe(false);
  });

  it('says tonight for night-mode open todos', () => {
    const [group] = groups([todo('a', { status: 'open', mode: 'night' })]);
    expect(group.rows[0]?.when).toBe('tonight');
  });

  it('gives now-mode open todos their queue position', () => {
    const [group] = groups(
      [1, 2, 3].map((n) => todo(`o${n}`, { status: 'open', filed_at: `2026-09-19T0${n}:00:00Z` }))
    );
    expect(whens(group)).toEqual(['next up', '2nd in queue', '3rd in queue']);
  });

  it('numbers past third with th', () => {
    const [group] = groups(
      [1, 2, 3, 4].map((n) => todo(`o${n}`, { status: 'open', filed_at: `2026-09-19T0${n}:00:00Z` })),
      { openLimit: 4 }
    );
    expect(whens(group)[3]).toBe('4th in queue');
  });

  it('carries the todo lifecycle steps from todoTrace', () => {
    const [group] = groups([todo('a', { status: 'done', commits: { 'jeryu-web': 'abc' } })]);
    expect(group.rows[0]?.steps.map((s) => s.key)).toEqual([
      'queued', 'claimed', 'done', 'pr', 'merged', 'released',
    ]);
  });
});

describe('pullGhostGroups grouping', () => {
  it('orders newest date first, nightshift after the dayshift of its date, unscheduled last', () => {
    const result = groups([
      todo('a', { status: 'claimed', shift: 'nightshift/2026-09-19' }),
      todo('b', { status: 'claimed', shift: 'bulletshift/2026-09-19' }),
      todo('c', { status: 'claimed', shift: 'dayshift/2026-09-20' }),
      todo('d', { status: 'claimed', shift: null }),
      todo('e', { status: 'claimed', shift: null, mode: 'night' }),
    ]);
    expect(result.map((g) => g.key)).toEqual([
      'dayshift/2026-09-20',
      'dayshift/2026-09-19',
      'nightshift/2026-09-19',
      'unscheduled/night',
      'unscheduled/now',
    ]);
  });

  it('labels each group', () => {
    const result = groups([
      todo('a', { status: 'claimed', shift: 'nightshift/2026-09-20' }),
      todo('b', { status: 'claimed', shift: null }),
      todo('c', { status: 'claimed', shift: null, mode: 'night' }),
    ]);
    expect(result.map((g) => g.label)).toEqual([
      'nightshift 2026-09-20',
      'nightshift (unscheduled)',
      'unscheduled',
    ]);
  });

  it('parses a dayshift branch into kind and date', () => {
    const [group] = groups([todo('a', { status: 'claimed', shift: 'dayshift/2026-09-22' })]);
    expect(group?.key).toBe('dayshift/2026-09-22');
    expect(group?.label).toBe('dayshift 2026-09-22');
    expect(group?.rows[0]).toMatchObject({ kind: 'dayshift', date: '2026-09-22' });
  });

  it('reads the legacy bulletshift name as a dayshift, keeping its date', () => {
    const [group] = groups([todo('a', { status: 'claimed', shift: 'bulletshift/2026-09-22' })]);
    expect(group?.key).toBe('dayshift/2026-09-22');
    expect(group?.label).toBe('dayshift 2026-09-22');
    expect(group?.rows[0]).toMatchObject({ kind: 'dayshift', date: '2026-09-22' });
  });

  it('groups a legacy bulletshift branch with the dayshift of the same date', () => {
    const result = groups([
      todo('a', { status: 'claimed', shift: 'bulletshift/2026-09-22' }),
      todo('b', { status: 'claimed', shift: 'dayshift/2026-09-22' }),
    ]);
    expect(result.map((g) => g.key)).toEqual(['dayshift/2026-09-22']);
    expect(result[0]?.rows.map((r) => r.todoId)).toEqual(['a', 'b']);
  });

  it('exposes the kind and date on each row', () => {
    const [group] = groups([todo('a', { status: 'claimed', shift: 'nightshift/2026-09-20' })]);
    expect(group.rows[0]?.kind).toBe('nightshift');
    expect(group.rows[0]?.date).toBe('2026-09-20');
    const [ungrouped] = groups([todo('b', { status: 'claimed', shift: null })]);
    expect(ungrouped.rows[0]?.kind).toBe('unscheduled');
    expect(ungrouped.rows[0]?.date).toBeNull();
  });

  it('drops empty groups', () => {
    expect(groups([todo('a', { status: 'done', merged: true })])).toEqual([]);
  });

  it('says opens tonight for an all-open nightshift dated today or tomorrow', () => {
    const rows = [1, 2].map((n) =>
      todo(`o${n}`, { status: 'open', mode: 'night', shift: 'nightshift/2026-09-20', filed_at: `2026-09-19T0${n}:00:00Z` })
    );
    const [group] = groups(rows, { tz: 'UTC' });
    expect(group.hint).toBe('opens tonight');
    const [tomorrow] = groups(
      rows.map((r) => ({ ...r, shift: 'nightshift/2026-09-21' })),
      { tz: 'UTC' }
    );
    expect(tomorrow.hint).toBe('opens tonight');
  });

  it('does not say opens tonight for an old nightshift or one already in flight', () => {
    const [old] = groups(
      [todo('o1', { status: 'open', mode: 'night', shift: 'nightshift/2026-09-10' })],
      { tz: 'UTC' }
    );
    expect(old.hint).toBe('');
    const [live] = groups(
      [
        todo('o1', { status: 'open', mode: 'night', shift: 'nightshift/2026-09-20' }),
        todo('c', { status: 'claimed', mode: 'night', shift: 'nightshift/2026-09-20' }),
      ],
      { tz: 'UTC' }
    );
    expect(live.hint).toBe('1 in flight');
  });

  it('counts queued alongside opens tonight', () => {
    const rows = [1, 2, 3, 4, 5].map((n) =>
      todo(`o${n}`, { status: 'open', mode: 'night', shift: 'nightshift/2026-09-20', filed_at: `2026-09-19T0${n}:00:00Z` })
    );
    const [group] = groups(rows, { tz: 'UTC' });
    expect(group.hint).toBe('opens tonight · 2 queued');
  });
});

describe('pullGhostGroups filters', () => {
  const todos = [
    todo('a', { status: 'claimed', repos: ['jeryu-web'], family: 'jeryu' }),
    todo('b', { status: 'claimed', repos: ['jeryu/jeryu-api'], family: 'jeryu' }),
    todo('c', { status: 'claimed', repos: ['jain-web'], family: 'jain-split' }),
  ];

  it('keeps only todos touching the wanted repos, bare or qualified', () => {
    expect(groups(todos, { repos: new Set(['jeryu-web']) }).flatMap(ids)).toEqual(['a']);
    expect(groups(todos, { repos: new Set(['jeryu/jeryu-api']) }).flatMap(ids)).toEqual(['b']);
    expect(groups(todos, { repos: new Set(['jeryu-api']) }).flatMap(ids)).toEqual(['b']);
  });

  it('keeps everything when repos is null or absent', () => {
    expect(groups(todos, { repos: null }).flatMap(ids).sort()).toEqual(['a', 'b', 'c']);
    expect(groups(todos).flatMap(ids).sort()).toEqual(['a', 'b', 'c']);
  });

  it('filters by family, and an empty family keeps all', () => {
    expect(groups(todos, { family: 'jain-split' }).flatMap(ids)).toEqual(['c']);
    expect(groups(todos, { family: '' }).flatMap(ids).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('todoByPr', () => {
  it('maps repo#number to the todo id, ignoring todos with no PR', () => {
    const map = todoByPr([
      todo('a', { pr: { repo: 'jeryu/jeryu-web', number: 12, state: 'open', url: '/p/12' } }),
      todo('b', { pr: { repo: 'jeryu-api', number: 3, state: 'merged', url: '/p/3' } }),
      todo('c'),
      todo('d', { pr: null }),
    ]);
    expect(map.get('jeryu-web#12')).toBe('a');
    expect(map.get('jeryu-api#3')).toBe('b');
    expect(map.size).toBe(2);
  });
});
