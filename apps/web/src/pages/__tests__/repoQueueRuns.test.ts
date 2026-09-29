import { describe, expect, it } from 'vitest';

import type { ShiftAttempt, ShiftTodo } from '../../api/types';
import { repoQueueRuns } from '../repoQueueRuns';

describe('repoQueueRuns', () => {
  it('flattens the attempts of todos naming the repository, newest first', () => {
    const todos = [
      todo('t-1', ['jeryu-web'], [
        attempt({ started: '2026-09-20T10:00:00Z', ended: '2026-09-20T11:00:00Z', outcome: 'done' }),
        attempt({ started: '2026-09-21T09:00:00Z', ended: null, outcome: '' }),
      ]),
      todo('t-2', ['jeryu-deploy'], [attempt({ started: '2026-09-22T09:00:00Z' })]),
    ];

    const runs = repoQueueRuns(todos, 'jeryu-web');

    expect(runs.map((r) => r.key)).toEqual(['t-1#1', 't-1#0']);
    expect(runs[0]).toMatchObject({
      todoId: 't-1',
      family: 'jeryu',
      worker: 'xbabe2 · w3',
      model: 'opus',
      outcome: 'running',
      running: true,
    });
    expect(runs[1]).toMatchObject({ outcome: 'done', running: false });
  });

  it('reduces an owner/name repository to the bare name todos use', () => {
    const todos = [todo('t-1', ['jeryu-web'], [attempt({})])];

    expect(repoQueueRuns(todos, 'jeryu/jeryu-web')).toHaveLength(1);
  });

  it('is empty when no todo names the repository', () => {
    const todos = [todo('t-1', ['jeryu-core'], [attempt({})])];

    expect(repoQueueRuns(todos, 'jeryu-web')).toEqual([]);
  });

  it('falls back to the todo id when it carries no title', () => {
    const todos = [{ ...todo('t-1', ['jeryu-web'], [attempt({})]), title: '' }];

    expect(repoQueueRuns(todos, 'jeryu-web')[0].title).toBe('t-1');
  });
});

function attempt(over: Partial<ShiftAttempt>): ShiftAttempt {
  return {
    by: 'alton',
    host: 'xbabe2',
    slot: 'w3',
    model: 'opus',
    session: null,
    started: '2026-09-21T09:00:00Z',
    ended: null,
    outcome: '',
    cost_usd: null,
    note: '',
    shift: null,
    ...over,
  };
}

function todo(id: string, repos: string[], worked_by: ShiftAttempt[]): ShiftTodo {
  return {
    id,
    family: 'jeryu',
    title: `todo ${id}`,
    body: '',
    repos,
    mode: 'night',
    priority: 0,
    blocked_by: [],
    status: 'claimed',
    attempts: worked_by.length,
    requested_by: 'alton',
    filed_at: '2026-09-20T08:00:00Z',
    claim_by: null,
    lease_until: null,
    lease_live: false,
    shift: null,
    change_set: null,
    commits: {},
    merged: false,
    note: '',
    triaged: true,
    worked_by,
  };
}
