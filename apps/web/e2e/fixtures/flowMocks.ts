// flowMocks.ts — browser-boundary mock for `GET /api/v1/flow`.
//
// Invented work only (family acme, repository acme/widgets): jeryu is public.
// The shape is `jeryu.flow/v1` as jeryu-deploy's `docs/flow.md` states it:
// nine stations in route order, a bottleneck at Gate, a hold at Review, Work
// claims read against the heartbeats, a station nothing has reached (Pin)
// whose numbers are absent rather than zero, and a page of lots per station
// (the oldest 20 by default; one station by arrival with `station` and
// `lots_order`, as the server pages them). Ages are read against the clock of
// the run, so the lots' `since` is set back from now: two of Gate's lots are
// stale by age, and two of Work's claims have no live worker.

import type { Page, Route } from '@playwright/test';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** An instant `ms` before now, as the server spells it. */
export function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

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
    since: ago(2 * HOUR_MS),
    eta_s: { p50: 1800, p90: 5400 },
    eta_partial: false,
    eta_unknown_stations: [],
    slowest_ahead: 'gate',
    href: `/work/${lotId}`,
    ...over,
  };
}

/** Open visits per repository and station, so each lane counts its own work. */
function repositoryWip(): Over[] {
  const at = (repo: string, station: string, waiting: number, active: number, held = 0) => ({ repo, station, waiting, active, held });
  return [
    at('acme/widgets', 'queue', 2, 0),
    at('acme/widgets', 'work', 0, 4),
    at('acme/widgets', 'review', 1, 0, 1),
    at('acme/widgets', 'gate', 3, 2),
    at('acme/widgets', 'merge', 0, 1),
    at('acme/widgets-deploy', 'gate', 1, 0),
    at('acme/widgets-deploy', 'pin', 1, 0),
  ];
}

function baseStations(): Over[] {
  return [
    station('queue', 'Queue', 1, { wip: { waiting: 2, active: 0, held: 0 }, oldest_wait_s: 1800 }),
    station('work', 'Work', 2, {
      wip: { waiting: 0, active: 4, held: 0 },
      oldest_wait_s: 18 * 86_400,
      process_s: { p50: 1800, p90: 5400 },
      claims: { live: 1, no_live_worker: 2, unknown: 1 },
    }),
    station('shift', 'Shift', 3, { throughput_per_hour: 0.2 }),
    station('review', 'Review', 4, {
      wip: { waiting: 1, active: 0, held: 1 },
      oldest_wait_s: 7200,
      rework: [{ to: 'work', count: 2, rate: 0.1 }],
    }),
    station('gate', 'Gate', 5, {
      wip: { waiting: 4, active: 2, held: 0 },
      oldest_wait_s: 20 * 86_400,
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
  ];
}

function baseLots(): Over[] {
  return [
    lot('acme-0001', 'gate', 'waiting', { since: ago(3 * HOUR_MS) }),
    lot('acme-0002', 'gate', 'active', { since: ago(HOUR_MS) }),
    lot('acme/widgets#42', 'gate', 'waiting', {
      since: ago(2 * HOUR_MS),
      eta_s: { p50: 2400, p90: 7200 },
      eta_partial: true,
      eta_unknown_stations: ['pin'],
      href: '/acme/widgets/pull/42',
    }),
    // Two claims nobody has moved for weeks: stale, folded away.
    lot('acme-0009', 'gate', 'active', { since: ago(20 * DAY_MS) }),
    lot('acme-0008', 'gate', 'waiting', { since: ago(16 * DAY_MS) }),
    lot('acme-0003', 'review', 'held', {
      since: ago(DAY_MS),
      eta_s: null,
      slowest_ahead: null,
    }),
    lot('acme/widgets#43', 'review', 'held', {
      since: ago(5 * HOUR_MS),
      eta_s: null,
      slowest_ahead: null,
      href: '/acme/widgets/pull/43',
      pr_href: '/acme/widgets/pull/43',
      hold: {
        reason: 'review_hold',
        by: 'acme-reviewer',
        since: ago(4 * HOUR_MS),
        age_s: 4 * 3600,
        nobody_acting: true,
        review_href: '/acme/widgets/pull/43#changes-requested',
      },
    }),
    lot('acme-0004', 'queue', 'waiting', { since: ago(HOUR_MS / 2) }),
    // Work claims, read against the heartbeats: one a live worker holds, two
    // whose family reports but no slot works them, and one nothing reports
    // for that has sat for weeks.
    lot('acme-0010', 'work', 'active', { since: ago(HOUR_MS), claim: 'live' }),
    lot('acme-0011', 'work', 'active', { since: ago(3 * HOUR_MS), claim: 'no_live_worker' }),
    lot('acme-0012', 'work', 'active', { since: ago(2 * DAY_MS), claim: 'no_live_worker' }),
    lot('acme-0013', 'work', 'active', { since: ago(18 * DAY_MS), claim: 'unknown' }),
  ];
}

/** One page of lots the way the server lists them for `params`. */
function pageOf(lots: Over[], params: URLSearchParams): { lots: Over[]; truncated: boolean; listed: Map<string, number> } {
  const station = params.get('station');
  const newest = params.get('lots_order') === 'newest';
  const offset = Number(params.get('lots_offset') ?? 0);
  const limit = Number(params.get('lots_limit') ?? 20);
  const listed = new Map<string, number>();
  const page: Over[] = [];
  let truncated = false;
  for (const at of new Set(lots.map((entry) => String(entry.station)))) {
    if (station && at !== station) continue;
    const line = lots
      .filter((entry) => entry.station === at)
      .sort((a, b) => String(a.since).localeCompare(String(b.since)));
    if (newest) line.reverse();
    const taken = line.slice(offset, offset + limit);
    listed.set(at, taken.length);
    truncated ||= offset + taken.length < line.length;
    page.push(...taken);
  }
  return { lots: page, truncated, listed };
}

function flowBody(params: URLSearchParams, extraLots: Over[] = [], stationOver: Record<string, Over> = {}): Over {
  const all = [...baseLots(), ...extraLots];
  const page = pageOf(all, params);
  const stations = baseStations().map((entry) => ({
    ...entry,
    ...stationOver[String(entry.id)],
    lots_listed: page.listed.get(String(entry.id)) ?? 0,
  }));
  return {
    repository_wip: repositoryWip(),
    schema_version: 'jeryu.flow/v1',
    generated_at: '2026-10-14T12:00:00.000Z',
    family: params.get('family'),
    // The server echoes the repository filter it answered for.
    repo: params.get('repo'),
    days: Number(params.get('days') ?? 28),
    window: { since: '2026-09-16T12:00:00.000Z', until: '2026-10-14T12:00:00.000Z' },
    stations,
    line: { cycle_s: { p50: 86_400, p90: 180_000 }, x_factor: { p50: 4.2, p90: 11.5 }, wip: 15, finished: 24 },
    topology: {
      families: [],
      products: [],
      unscoped_active_lots: 0,
      unknown: [],
      families_truncated: false,
      families_total: 2,
    },
    lots: page.lots,
    lots_total: stations.reduce((sum, entry) => {
      const wip = entry.wip as { waiting: number; active: number; held: number };
      return sum + wip.waiting + wip.active + wip.held;
    }, 0),
    lots_truncated: page.truncated,
    lots_page: {
      station: params.get('station'),
      offset: Number(params.get('lots_offset') ?? 0),
      limit: Number(params.get('lots_limit') ?? 20),
      order: params.get('lots_order') ?? 'oldest',
    },
  };
}

export interface FlowLog {
  queries: URLSearchParams[];
}

/**
 * `extraLots` are added to the report: lots of the page under test, by id.
 * `stationOver` replaces fields of a station, by id.
 */
export async function mockFlowApi(
  page: Page,
  extraLots: Over[] = [],
  stationOver: Record<string, Over> = {}
): Promise<FlowLog> {
  const log: FlowLog = { queries: [] };
  await page.route('**/api/v1/flow**', async (route: Route) => {
    const params = new URL(route.request().url()).searchParams;
    log.queries.push(params);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(flowBody(params, extraLots, stationOver)),
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
