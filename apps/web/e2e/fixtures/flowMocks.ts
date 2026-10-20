// flowMocks.ts — browser-boundary mock for `GET /api/v1/flow`.
//
// Invented work only (family acme, repository acme/widgets): jeryu is public.
// The shape is `jeryu.flow/v1` as jeryu-deploy's `docs/flow.md` states it:
// nine stations in route order, a bottleneck at Gate, loops back to Work from
// Gate and Review, a hold at Review, a station nothing has reached (Pin) whose
// numbers are absent rather than zero, and the oldest lots per station.

import { flowHistory, FLOW_LAYOUT } from './flowHistory';
import type { Page, Route } from '@playwright/test';

export type Over = Record<string, unknown>;

function station(id: string, label: string, order: number, over: Over = {}): Over {
  return {
    id,
    label,
    order,
    wip: { waiting: 0, active: 0, held: 0 },
    oldest_wait_s: null,
    queue_s: { p50: 120, p90: 600 },
    process_s: { p50: 300, p90: 900 },
    throughput_per_hour: 1.5,
    first_pass_rate: 0.9,
    rework: [],
    capacity: null,
    utilization: null,
    bottleneck: false,
    unknown: [{ metric: 'capacity', reason: 'no_heartbeat' }],
    ...over,
  };
}

export function lot(lotId: string, at: string, state: string, over: Over = {}): Over {
  return {
    lot_id: lotId,
    station: at,
    state,
    since: '2026-10-14T10:00:00.000Z',
    eta_s: { p50: 1800, p90: 5400 },
    eta_partial: false,
    eta_unknown_stations: [],
    slowest_ahead: 'gate',
    href: `/work/${lotId}`,
    ...over,
  };
}

/** The configured topology of the invented family: one product (the default a
 *  family that declares none gets), three configured repositories, the pin
 *  chain the integration repository's lock records, and a repository with no
 *  current work. */
function topology(): Over {
  const work = (over: Over = {}) => ({
    active_lots: 0, changes: 0, pull_requests: 0, pin_pull_requests: 0, release_artifacts: 0, ...over,
  });
  const route = (approvals: number | null, checks: string[] | null, kind: string) => ({
    kind, source: kind === 'unknown' ? 'unreadable' : 'branch_protection', approvals, required_checks: checks,
  });
  const node = (repo: string, over: Over = {}) => ({
    repo, role: 'source', shared: false, pins_into: [], pin_source: 'none',
    route: route(1, ['widgets/required'], 'automated'), active_lots: 0, no_current_work: true, ...over,
  });
  return {
    families: [{ family: 'acme', products: 1, repos: 3, work: work({ active_lots: 5, changes: 2, pull_requests: 2, pin_pull_requests: 1 }) }],
    products: [
      {
        id: 'acme', label: 'acme', family: 'acme', source: 'family_default',
        integration: 'acme/widgets-deploy',
        release: { repo: 'acme/widgets-deploy', source: 'integration_repo', stations: ['stage', 'deploy'] },
        work: work({ active_lots: 5, changes: 2, pull_requests: 2, pin_pull_requests: 1 }),
        repos: [
          node('acme/widgets', { pins_into: ['acme/widgets-deploy'], pin_source: 'pin_lock', active_lots: 4, no_current_work: false }),
          node('acme/widgets-deploy', { role: 'integration', route: route(0, [], 'no_gate'), active_lots: 1, no_current_work: false }),
          node('acme/widgets-core', { pins_into: ['acme/widgets-deploy'], pin_source: 'pin_lock', route: route(2, [], 'human_only') }),
        ],
      },
    ],
    unscoped_active_lots: 0,
    unknown: [],
    families_truncated: false,
  };
}

/** Open visits per repository and station, so each lane counts its own work. */
function repositoryWip(): Over[] {
  const at = (repo: string, station: string, waiting: number, active: number, held = 0) => ({ repo, station, waiting, active, held });
  return [
    at('acme/widgets', 'queue', 2, 0),
    at('acme/widgets', 'work', 0, 3),
    at('acme/widgets', 'review', 1, 0, 1),
    at('acme/widgets', 'gate', 3, 2),
    at('acme/widgets', 'merge', 0, 1),
    at('acme/widgets-deploy', 'gate', 1, 0),
    at('acme/widgets-deploy', 'pin', 1, 0),
  ];
}

function flowBody(params: URLSearchParams, extraLots: Over[] = []): Over {
  return {
    topology: topology(),
    repository_wip: repositoryWip(),
    closures: [
      { lot_id: 'acme/widgets#41', repo: 'acme/widgets', station: 'gate', href: '/acme/widgets/pull/41', title: 'Unexplained closure', kind: 'pull_request', disposition: 'needs_disposition', explanation: 'Original attempt closed.', replacement: null, needs_attention: true },
      { lot_id: 'acme/widgets#40', repo: 'acme/widgets', station: 'review', href: '/acme/widgets/pull/40', title: 'Replaced attempt', kind: 'pull_request', disposition: 'replacement_recorded', explanation: 'Superseded-by: #42', replacement: { href: '/acme/widgets/pull/42', label: 'acme/widgets#42', state: 'open' }, needs_attention: false },
    ],
    lifecycle_problems: [],
    schema_version: 'jeryu.flow/v1',
    generated_at: '2026-10-14T12:00:00.000Z',
    family: params.get('family'),
    // The server echoes the repository filter it answered for.
    repo: params.get('repo'),
    days: Number(params.get('days') ?? 28),
    window: { since: '2026-09-16T12:00:00.000Z', until: '2026-10-14T12:00:00.000Z' },
    stations: [
      station('queue', 'Queue', 1, { wip: { waiting: 2, active: 0, held: 0 }, oldest_wait_s: 1800 }),
      station('work', 'Work', 2, {
        wip: { waiting: 0, active: 3, held: 0 },
        oldest_wait_s: 5400,
        process_s: { p50: 1800, p90: 5400 },
      }),
      station('shift', 'Shift', 3, { throughput_per_hour: 0.2 }),
      station('review', 'Review', 4, {
        wip: { waiting: 1, active: 0, held: 1 },
        oldest_wait_s: 7200,
        rework: [{ to: 'work', count: 2, rate: 0.1 }],
      }),
      station('gate', 'Gate', 5, {
        wip: { waiting: 3, active: 2, held: 0 },
        oldest_wait_s: 4200,
        queue_s: { p50: 900, p90: 1800 },
        process_s: { p50: 400, p90: 640 },
        throughput_per_hour: 4.2,
        first_pass_rate: 0.81,
        rework: [{ to: 'work', count: 9, rate: 0.19 }],
        bottleneck: true,
      }),
      station('merge', 'Merge', 6, { wip: { waiting: 0, active: 1, held: 0 }, oldest_wait_s: 60 }),
      station('pin', 'Pin', 7, {
        queue_s: null,
        process_s: null,
        throughput_per_hour: null,
        first_pass_rate: null,
        unknown: [
          { metric: 'all', reason: 'no_events' },
          { metric: 'capacity', reason: 'no_heartbeat' },
        ],
      }),
      station('stage', 'Stage', 8, {
        queue_s: null,
        unknown: [
          { metric: 'capacity', reason: 'no_heartbeat' },
          { metric: 'queue_s', reason: 'too_few_samples' },
        ],
      }),
      station('deploy', 'Deploy', 9),
    ],
    line: { cycle_s: { p50: 86_400, p90: 180_000 }, x_factor: { p50: 4.2, p90: 11.5 }, wip: 13, finished: 24 },
    lots: [
      lot('acme-0001', 'gate', 'waiting', { since: '2026-10-14T09:00:00.000Z' }),
      lot('acme-0002', 'gate', 'active', { since: '2026-10-14T11:00:00.000Z' }),
      lot('acme/widgets#42', 'gate', 'waiting', {
        since: '2026-10-14T10:30:00.000Z',
        eta_s: { p50: 2400, p90: 7200 },
        eta_partial: true,
        eta_unknown_stations: ['pin'],
        href: '/acme/widgets/pull/42',
      }),
      lot('acme-0003', 'review', 'held', {
        since: '2026-10-13T08:00:00.000Z',
        eta_s: null,
        slowest_ahead: null,
      }),
      lot('acme-0004', 'queue', 'waiting', { since: '2026-10-14T11:30:00.000Z' }),
      ...extraLots,
    ],
  };
}

export interface FlowLog {
  queries: URLSearchParams[];
}

/** `extraLots` are added to the report: lots of the page under test, by id. */
export async function mockFlowApi(page: Page, extraLots: Over[] = []): Promise<FlowLog> {
  const log: FlowLog = { queries: [] };
  await page.route('**/api/v1/flow**', async (route: Route) => {
    const params = new URL(route.request().url()).searchParams;
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/history') || path.endsWith('/layout')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(path.endsWith('/history') ? flowHistory(params) : FLOW_LAYOUT) });
      return;
    }
    log.queries.push(params);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(flowBody(params, extraLots)),
    });
  });
  return log;
}

export async function mockFlowForbidden(page: Page): Promise<void> {
  await page.route('**/api/v1/flow**', async (route: Route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'forbidden', message: 'admin only' } }),
    });
  });
}
