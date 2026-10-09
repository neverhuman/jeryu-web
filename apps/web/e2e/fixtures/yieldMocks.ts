// yieldMocks.ts — browser-boundary mock for `GET /api/v1/yield`, the spend
// against what reached main. Invented data only: families acme and globex,
// models model-a and model-b, harnesses claude and codex.
//
// Register AFTER `mockBootstrap` (Playwright matches the newest route first).
// Without it the shared 404 fallback answers, which is what a server that
// predates the route looks like to the SPA.

import type { Page, Route } from '@playwright/test';

type Row = Record<string, unknown>;

function row(overrides: Row = {}): Row {
  return {
    todos: 0,
    attempts: 0,
    merged: 0,
    first_pass: 0,
    spend_usd: 0,
    author_usd: 0,
    review_usd: 0,
    triage_usd: 0,
    main_usd: 0,
    scrap_usd: 0,
    pending_usd: 0,
    killed_usd: 0,
    estimated_usd: 0,
    yield: null,
    usd_per_merged: null,
    usd_per_merged_ci95: null,
    first_pass_rate: null,
    ...overrides,
  };
}

const MODEL_A = row({
  todos: 25,
  attempts: 36,
  merged: 20,
  first_pass: 15,
  spend_usd: 130,
  author_usd: 100,
  review_usd: 25,
  triage_usd: 5,
  main_usd: 100,
  scrap_usd: 20,
  pending_usd: 10,
  killed_usd: 8,
  estimated_usd: 5,
  yield: 100 / 120,
  usd_per_merged: 5,
  usd_per_merged_ci95: [4, 6],
  first_pass_rate: 0.75,
});

const MODEL_B = row({
  todos: 15,
  attempts: 22,
  merged: 10,
  first_pass: 6,
  spend_usd: 70,
  author_usd: 50,
  review_usd: 15,
  triage_usd: 5,
  main_usd: 50,
  scrap_usd: 10,
  pending_usd: 10,
  killed_usd: 4.5,
  estimated_usd: 3,
  yield: 50 / 60,
  usd_per_merged: 5,
  first_pass_rate: 0.6,
});

/** The groups each cut answers with; any other cut gets the model rows. */
const GROUPS: Record<string, Row[]> = {
  model: [
    { group: 'model-a', ...MODEL_A },
    { group: 'model-b', ...MODEL_B },
  ],
  agent: [
    { group: 'claude', ...MODEL_A },
    { group: 'codex', ...MODEL_B },
  ],
};

const TODO_A = {
  id: '20261001-120000-aaaaaa',
  family: 'acme',
  title: 'Split the billing module',
  status: 'done',
  merged: true,
  spend_usd: 24.5,
  attempts: 3,
  agent: 'claude',
  model: 'model-a',
};

const TODO_B = {
  id: '20261002-120000-bbbbbb',
  family: 'globex',
  title: 'Retry flaky uploads',
  status: 'blocked',
  merged: false,
  spend_usd: 18,
  attempts: 4,
  agent: 'codex',
  model: 'model-b',
};

export function yieldBody(params: URLSearchParams): Record<string, unknown> {
  const by = params.get('by') ?? 'model';
  const groups = GROUPS[by] ?? GROUPS.model;
  const names = groups.map((group) => String(group.group));
  return {
    schema_version: 'jeryu.yield/v1',
    generated_at: '2026-10-09T16:00:00Z',
    window: { since: params.get('since') ?? '2026-09-11', until: params.get('until') ?? '2026-10-09' },
    family: params.get('family'),
    by,
    price_sources: ['catalog@0000001'],
    totals: row({
      todos: 40,
      attempts: 58,
      merged: 30,
      first_pass: 21,
      spend_usd: 200,
      author_usd: 150,
      review_usd: 40,
      triage_usd: 10,
      main_usd: 150,
      scrap_usd: 30,
      pending_usd: 20,
      killed_usd: 12.5,
      estimated_usd: 8,
      yield: 150 / 180,
      usd_per_merged: 5,
      usd_per_merged_ci95: [3.9, 6.1],
      first_pass_rate: 0.7,
    }),
    groups,
    weekly: ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'].flatMap((week, index) => [
      { week, group: names[0], merged: 5 + index, main_usd: 30 + index * 2, usd_per_merged: (30 + index * 2) / (5 + index) },
      { week, group: names[1], merged: index, main_usd: index * 6, usd_per_merged: index === 0 ? null : 6 - index * 0.5 },
    ]),
    experiments: [
      {
        experiment: 'exp-1',
        arms: [
          { agent: 'claude', model: 'model-a', arm_p: 0.75, enough_data: true, row: MODEL_A },
          {
            agent: 'codex',
            model: 'model-b',
            arm_p: 0.25,
            enough_data: false,
            row: row({ todos: 6, merged: 4, spend_usd: 30, main_usd: 20, yield: 1, usd_per_merged: 5 }),
          },
        ],
      },
    ],
    costliest: [TODO_A, TODO_B],
    scrap: [TODO_B],
  };
}

export interface YieldLog {
  /** The query of every `GET /api/v1/yield`, in order. */
  queries: URLSearchParams[];
}

export async function mockYieldApi(page: Page): Promise<YieldLog> {
  const log: YieldLog = { queries: [] };
  await page.route('**/api/v1/yield**', async (route: Route) => {
    const params = new URL(route.request().url()).searchParams;
    log.queries.push(params);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(yieldBody(params)),
    });
  });
  return log;
}

/** The read refused, the way a non-admin is refused. */
export async function mockYieldForbidden(page: Page): Promise<void> {
  await page.route('**/api/v1/yield**', async (route: Route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'forbidden', message: 'admin only' } }),
    });
  });
}
