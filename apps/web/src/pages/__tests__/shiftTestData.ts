// shiftTestData.ts — contract-shaped Shift API fixtures for vitest.

import type {
  ShiftAttempt,
  ShiftFamiliesResponse,
  ShiftShiftsResponse,
  ShiftTodo,
  ShiftWorkersHistoryResponse,
  ShiftWorkersResponse,
} from '../../api/types';

export const FAMILIES: ShiftFamiliesResponse = {
  families: [
    {
      name: 'jeryu',
      queue_repo: 'jeryu/jeryu-todo',
      repos: [
        { name: 'jeryu-web', order: 2 },
        { name: 'jeryu-deploy', order: 1 },
      ],
      shift_tz: 'America/Los_Angeles',
      landing: 'shifts',
    },
  ],
};

export function attempt(overrides: Partial<ShiftAttempt> = {}): ShiftAttempt {
  return {
    by: 'alton',
    host: 'xbabe0',
    slot: 'w1',
    model: 'opus',
    session: 's-1',
    started: '2026-09-19T08:00:00Z',
    ended: '2026-09-19T08:30:00Z',
    outcome: 'done',
    cost_usd: 1.25,
    note: 'landed',
    shift: 'nightshift/2026-09-18',
    ...overrides,
  };
}

export function todo(overrides: Partial<ShiftTodo> = {}): ShiftTodo {
  return {
    id: '20260918-1832-k3f',
    family: 'jeryu',
    title: 'Fix the cache key',
    body: 'The cache key ignores the ref.',
    repos: ['jeryu-web'],
    mode: 'now',
    priority: 2,
    blocked_by: [],
    status: 'open',
    attempts: 0,
    requested_by: 'alton',
    filed_at: '2026-09-18T18:32:00Z',
    claim_by: null,
    lease_until: null,
    lease_live: false,
    shift: null,
    change_set: null,
    commits: {},
    merged: false,
    note: '',
    triaged: true,
    worked_by: [],
    ...overrides,
  };
}

export const TODOS: ShiftTodo[] = [
  todo(),
  todo({
    id: '20260918-2201-a9z',
    title: 'Add shift heartbeat',
    body: 'POST heartbeats every 30 s.',
    repos: ['jeryu-deploy'],
    mode: 'night',
    status: 'done',
    attempts: 1,
    requested_by: 'jeryu',
    shift: 'nightshift/2026-09-18',
    commits: { 'jeryu-deploy': 'abcdef1234567890' },
    note: 'green on first try',
    worked_by: [attempt()],
  }),
  todo({
    id: '20260919-0900-q1q',
    title: 'Claimed thing',
    status: 'claimed',
    claim_by: 'bob@xbabe1/w2',
    lease_until: '2026-09-19T10:00:00Z',
    lease_live: true,
  }),
];

export const SHIFTS: ShiftShiftsResponse = {
  shifts: [
    {
      branch: 'nightshift/2026-09-18',
      kind: 'nightshift',
      date: '2026-09-18',
      repos: [{ repo: 'jeryu-deploy', head: 'abcdef1', ahead: 1, behind: 0 }],
      todo_ids: ['20260918-2201-a9z'],
    },
    {
      branch: 'dayshift/2026-09-17',
      kind: 'dayshift',
      date: '2026-09-17',
      repos: [
        {
          repo: 'jeryu-web',
          head: '1234567',
          ahead: 3,
          behind: 2,
          pr: { number: 12, state: 'open', url: 'https://git.example/jeryu/jeryu-web/pulls/12' },
        },
      ],
      todo_ids: ['a', 'b'],
    },
  ],
};

export const WORKERS: ShiftWorkersResponse = {
  generated_at: '2026-09-19T09:00:00Z',
  workers: [
    {
      operator: 'alton',
      host: 'xbabe0',
      slot: 'w1',
      family: 'jeryu',
      state: 'working',
      stage: 'agent',
      todo_id: '20260919-0900-q1q',
      lease_until: '2026-09-19T10:00:00Z',
      last_seen: '2026-09-19T08:59:50Z',
      healthy: true,
    },
    {
      operator: 'alton',
      host: 'xbabe1',
      slot: 'w2',
      family: 'jeryu',
      state: 'idle',
      last_seen: '2026-09-19T08:00:00Z',
      healthy: false,
    },
  ],
};

export const HISTORY: ShiftWorkersHistoryResponse = {
  from: '2026-09-18T09:00:00Z',
  to: '2026-09-19T09:00:00Z',
  slots: [
    {
      operator: 'alton',
      host: 'xbabe0',
      slot: 'w1',
      family: 'jeryu',
      segments: [
        { from: '2026-09-18T09:00:00Z', to: '2026-09-18T21:00:00Z', state: 'idle' },
        {
          from: '2026-09-18T21:00:00Z',
          to: '2026-09-19T09:00:00Z',
          state: 'working',
          todo_id: '20260918-2201-a9z',
          stage: 'agent',
        },
      ],
    },
  ],
  capacity: [
    { at: '2026-09-19T07:00:00Z', planned: 3, busy: 1, queue_depth: 4 },
    { at: '2026-09-19T08:00:00Z', planned: 6, busy: 2, queue_depth: 2 },
  ],
};
