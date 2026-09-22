// shiftMocks.ts — browser-boundary mocks for the Shift API (`/api/v1/shift/*`),
// shaped exactly like the Phase 2 contract in the shiftwork plan.

import type { Page, Route } from '@playwright/test';

const TZ = 'America/Los_Angeles';

/** Yesterday in the shift zone — the date "last night" carries. */
export function lastNightDate(now = new Date()): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const NIGHT = `nightshift/${lastNightDate()}`;

function iso(offsetMinutes: number): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

function todo(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'x',
    family: 'jeryu',
    title: 'x',
    body: '',
    repos: ['jeryu-web'],
    mode: 'now',
    priority: 3,
    blocked_by: [],
    status: 'open',
    attempts: 0,
    requested_by: 'alton',
    filed_at: iso(-600),
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

export const SHIFT_TODOS = [
  todo({ id: '20260919-0800-aaa', title: 'Fix cache key', body: 'Cache key ignores the ref.' }),
  todo({
    id: '20260918-2200-bbb',
    title: 'Ship heartbeats',
    body: 'Slots POST heartbeats every 30 s.',
    repos: ['jeryu-deploy'],
    mode: 'night',
    status: 'done',
    attempts: 1,
    requested_by: 'jeryu',
    shift: NIGHT,
    commits: { 'jeryu-deploy': 'abcdef1234567890abcdef1234567890abcdef12' },
    // Pipeline visibility contract v1: server-derived lifecycle fields.
    pr: { repo: 'jeryu-deploy', number: 41, state: 'merged', url: '/repos/jeryu/jeryu/jeryu-deploy/pulls/41' },
    merged: true,
    released: false,
    note: 'landed clean',
    worked_by: [
      {
        by: 'alton',
        host: 'xbabe0',
        slot: 'w1',
        model: 'opus',
        session: 's-1',
        started: iso(-500),
        ended: iso(-470),
        outcome: 'done',
        cost_usd: 1.5,
        note: 'gate green',
        shift: NIGHT,
      },
    ],
  }),
  todo({
    id: '20260919-0900-ccc',
    title: 'Claimed refactor',
    status: 'claimed',
    claim_by: 'bob@xbabe1/w2',
    lease_until: iso(30),
    lease_live: true,
  }),
  todo({
    id: '20260919-0930-ddd',
    title: 'Cut the core tag',
    status: 'blocked',
    attempts: 2,
    priority: 4,
    note: 'The jeryu-core tag split.7 does not exist.',
    worked_by: [
      {
        by: 'alton',
        host: 'xbabe0',
        slot: 'w1',
        model: 'opus',
        session: 's-2',
        started: iso(-90),
        ended: iso(-80),
        outcome: 'blocked',
        cost_usd: 0.21,
        note: 'tag must be cut first',
        shift: null,
      },
    ],
  }),
  // A second family, so the one Work page shows every family and a pill filters it.
  todo({
    id: '20260919-0940-eee',
    family: 'jain',
    title: 'Tighten the release notes',
    repos: ['jain-web'],
    mode: 'night',
  }),
];

export interface ShiftMockLog {
  posts: Array<{ path: string; body: unknown }>;
}

async function fulfill(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

export async function mockShiftApi(page: Page): Promise<ShiftMockLog> {
  const log: ShiftMockLog = { posts: [] };
  await page.route('**/api/v1/shift/**', async (route, request) => {
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      log.posts.push({ path, body });
      if (path === '/api/v1/shift/todos') {
        if (Array.isArray(body.texts)) {
          return fulfill(route, {
            todos: (body.texts as string[]).map((text, i) =>
              todo({ id: `20260919-1000-n${i}`, family: body.family, title: text, mode: body.mode, triaged: false })
            ),
          });
        }
        return fulfill(route, todo({ id: '20260919-1000-new', family: body.family, title: body.text, mode: body.mode }));
      }
      if (path.endsWith('/pr')) {
        return fulfill(route, {
          prs: [{ repo: 'jeryu-deploy', number: 41, url: 'https://git.example/jeryu/jeryu-deploy/pulls/41', created: true }],
        });
      }
      return fulfill(route, SHIFT_TODOS[0]);
    }
    switch (path) {
      case '/api/v1/shift/families':
        return fulfill(route, {
          families: [
            {
              name: 'jeryu',
              queue_repo: 'jeryu/jeryu-todo',
              repos: [
                { name: 'jeryu-deploy', order: 1 },
                { name: 'jeryu-web', order: 2 },
              ],
              shift_tz: TZ,
              landing: 'shifts',
            },
            {
              name: 'jain',
              queue_repo: 'veox/jain-todo',
              repos: [{ name: 'jain-web', order: 1 }],
              shift_tz: TZ,
              landing: 'shifts',
            },
          ],
        });
      case '/api/v1/shift/todos': {
        // No `family` means every family, as the server answers it.
        const wanted = url.searchParams.get('family');
        return fulfill(route, {
          generated_at: iso(0),
          todos: wanted ? SHIFT_TODOS.filter((entry) => entry.family === wanted) : SHIFT_TODOS,
        });
      }
      case '/api/v1/shift/shifts':
        // A shift branch carries no family: the page asks once per family.
        if (url.searchParams.get('family') !== 'jeryu') return fulfill(route, { shifts: [] });
        return fulfill(route, {
          shifts: [
            {
              branch: NIGHT,
              kind: 'nightshift',
              date: lastNightDate(),
              repos: [{ repo: 'jeryu-deploy', head: 'abcdef1', ahead: 1, behind: 0 }],
              todo_ids: ['20260918-2200-bbb'],
            },
            {
              branch: 'dayshift/2026-09-01',
              kind: 'dayshift',
              date: '2026-09-01',
              repos: [
                {
                  repo: 'jeryu-web',
                  head: '1234567',
                  ahead: 2,
                  behind: 5,
                  pr: { number: 9, state: 'merged', url: 'https://git.example/jeryu/jeryu-web/pulls/9' },
                },
              ],
              todo_ids: ['a', 'b'],
            },
          ],
        });
      case '/api/v1/shift/workers':
        return fulfill(route, {
          generated_at: iso(0),
          workers: [
            {
              operator: 'alton',
              host: 'xbabe0',
              slot: 'w1',
              family: 'jeryu',
              state: 'working',
              stage: 'agent',
              todo_id: '20260919-0900-ccc',
              lease_until: iso(30),
              last_seen: iso(0),
              healthy: true,
            },
            {
              operator: 'alton',
              host: 'xbabe1',
              slot: 'w2',
              family: 'jeryu',
              state: 'idle',
              last_seen: iso(-30),
              healthy: false,
            },
          ],
        });
      case '/api/v1/shift/workers/history': {
        const hours = Number(url.searchParams.get('hours') ?? '24');
        const from = iso(-hours * 60);
        return fulfill(route, {
          from,
          to: iso(0),
          slots: [
            {
              operator: 'alton',
              host: 'xbabe0',
              slot: 'w1',
              family: 'jeryu',
              segments: [
                { from, to: iso(-hours * 30), state: 'idle' },
                { from: iso(-hours * 30), to: iso(0), state: 'working', todo_id: '20260918-2200-bbb', stage: 'agent' },
              ],
            },
          ],
          capacity: Array.from({ length: Math.min(hours, 24) }, (_, i) => ({
            at: iso(-(24 - i) * 60),
            planned: i < 12 ? 3 : 6,
            busy: i % 4,
            queue_depth: 24 - i,
          })),
        });
      }
      default:
        return fulfill(route, { error: { code: 'unmocked', message: path } }, 404);
    }
  });
  return log;
}
