// flowTestData.ts — one `GET /api/v1/flow` answer for the Flow page, the line
// strip and the Activity strip tests.
//
// Invented work only (families acme and globex): jeryu is public. The shape is
// `jeryu.flow/v1` as jeryu-deploy's `docs/flow.md` states it: nine stations in
// route order, a bottleneck, a rework loop back to Work, a hold at Review, a
// station nothing has reached (Pin) whose numbers are absent rather than zero,
// and the oldest lots at each station with their estimates.

import type { FlowLot, FlowReport, FlowStation } from '../../api/types';

function station(id: string, label: string, order: number, over: Partial<FlowStation> = {}): FlowStation {
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

function lot(lot_id: string, at: string, state: string, over: Partial<FlowLot> = {}): FlowLot {
  return {
    lot_id,
    station: at,
    state,
    since: '2026-10-14T10:00:00.000Z',
    eta_s: { p50: 1800, p90: 5400 },
    eta_partial: false,
    eta_unknown_stations: [],
    slowest_ahead: 'gate',
    href: `/work/${lot_id}`,
    ...over,
  };
}

export const FLOW_REPORT: FlowReport = {
  schema_version: 'jeryu.flow/v1',
  generated_at: '2026-10-14T12:00:00.000Z',
  family: null,
  days: 28,
  window: { since: '2026-09-16T12:00:00.000Z', until: '2026-10-14T12:00:00.000Z' },
  stations: [
    station('queue', 'Queue', 1, {
      wip: { waiting: 2, active: 0, held: 0 },
      oldest_wait_s: 1800,
    }),
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
    // Nothing of this family has ever been pinned anywhere.
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
      process_s: { p50: 240, p90: 600 },
      unknown: [
        { metric: 'capacity', reason: 'no_heartbeat' },
        { metric: 'queue_s', reason: 'too_few_samples' },
      ],
    }),
    station('deploy', 'Deploy', 9, { wip: { waiting: 0, active: 0, held: 0 } }),
  ],
  line: {
    cycle_s: { p50: 86_400, p90: 180_000 },
    x_factor: { p50: 4.2, p90: 11.5 },
    wip: 13,
    finished: 24,
  },
  lots: [
    lot('acme-0001', 'gate', 'waiting', { since: '2026-10-14T09:00:00.000Z' }),
    lot('acme-0002', 'gate', 'active', { since: '2026-10-14T11:00:00.000Z' }),
    lot('acme/widgets#42', 'gate', 'waiting', {
      since: '2026-10-14T10:30:00.000Z',
      eta_s: { p50: 2400, p90: 7200 },
      eta_partial: true,
      eta_unknown_stations: ['pin'],
      href: '/repos/jeryu/acme/widgets/pulls/42',
    }),
    lot('acme-0003', 'review', 'held', {
      since: '2026-10-13T08:00:00.000Z',
      eta_s: null,
      slowest_ahead: null,
    }),
    lot('acme/widgets#43', 'review', 'held', {
      since: '2026-10-14T06:00:00.000Z',
      eta_s: null,
      slowest_ahead: null,
      href: '/repos/jeryu/acme/widgets/pulls/43',
      pr_href: '/repos/jeryu/acme/widgets/pulls/43',
      hold: {
        reason: 'review_hold',
        by: 'acme-reviewer',
        since: '2026-10-14T06:30:00.000Z',
        age_s: 19_800,
        nobody_acting: true,
        review_href: '/repos/jeryu/acme/widgets/pulls/43#changes-requested',
      },
    }),
    lot('acme-0004', 'queue', 'waiting', { since: '2026-10-14T11:30:00.000Z' }),
  ],
};
