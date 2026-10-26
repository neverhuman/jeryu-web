// flowModel.test.ts — what the Flow page decides, without a browser: one
// number per station, which station the address picks, the work in progress at
// a station from its pages, newest first, with the stale part apart and named
// by kind, the Work claims, the line's count over every family, and which
// links the page will follow.

import { describe, expect, it } from 'vitest';

import type { FlowReport } from '../../api/types';
import {
  defaultStation,
  etaWords,
  holdReasonWords,
  claimsWords,
  itemRepo,
  lineSummary,
  lotsAt,
  safeFlowHref,
  selectedStation,
  STALE_AFTER_DAYS,
  staleWords,
  stationSearch,
  stationSummaries,
  stationWip,
} from '../flow/flowModel';
import { flowAnswer, FLOW_REPORT } from './flowTestData';

const NOW = new Date('2026-10-14T12:00:00.000Z');

describe('flowModel', () => {
  it('gives each station one number in progress and its oldest wait against the stale cutoff', () => {
    const stations = stationSummaries(FLOW_REPORT);
    expect(stations.map((station) => station.id)).toEqual([
      'queue', 'work', 'shift', 'review', 'gate', 'merge', 'pin', 'stage', 'deploy',
    ]);
    const gate = stations.find((station) => station.id === 'gate')!;
    expect(gate).toMatchObject({ total: 5, bottleneck: true, oldestS: 4200, stale: false });
    expect(gate.ageShare).toBeCloseTo(4200 / (STALE_AFTER_DAYS * 86_400));
    // Never reached: no number at all.
    expect(stations.find((station) => station.id === 'pin')?.total).toBeNull();
    const stale = stationSummaries({
      ...FLOW_REPORT,
      stations: FLOW_REPORT.stations.map((station) =>
        station.id === 'work' ? { ...station, oldest_wait_s: 30 * 86_400 } : station
      ),
    }).find((station) => station.id === 'work')!;
    expect(stale).toMatchObject({ stale: true, ageShare: 1 });
  });

  it('opens on the bottleneck, else the busiest station, and keeps a known pick', () => {
    expect(defaultStation(FLOW_REPORT)).toBe('gate');
    const emptyBottleneck: FlowReport = {
      ...FLOW_REPORT,
      stations: FLOW_REPORT.stations.map((station) => ({ ...station, bottleneck: station.id === 'deploy' })),
    };
    expect(defaultStation(emptyBottleneck)).toBe('gate');
    expect(selectedStation(new URLSearchParams('station=review'), FLOW_REPORT)).toBe('review');
    expect(selectedStation(new URLSearchParams('station=nowhere'), FLOW_REPORT)).toBe('gate');
  });

  it('builds a pick address that keeps the family and drops the old controls', () => {
    const params = new URLSearchParams('family=acme&days=90&mode=layout&repo=acme/widgets&lot=x');
    expect(stationSearch(params, 'review')).toBe('?family=acme&station=review');
  });

  it('lists a station from its pages newest first, once each, and sets the stale part apart', () => {
    const report: FlowReport = {
      ...FLOW_REPORT,
      lots: [
        ...FLOW_REPORT.lots,
        { ...FLOW_REPORT.lots[0], lot_id: 'acme-old', since: '2026-09-01T00:00:00.000Z' },
      ],
      repository_wip: [
        { repo: 'acme/b', station: 'gate', waiting: 1, active: 0, held: 0 },
        { repo: 'acme/a', station: 'gate', waiting: 1, active: 0, held: 0 },
        { repo: 'acme/c', station: 'gate', waiting: 0, active: 0, held: 0 },
        { repo: 'acme/a', station: 'review', waiting: 4, active: 0, held: 0 },
      ],
    };
    const page = (offset: number) =>
      flowAnswer(report, new URLSearchParams(`station=gate&lots_order=newest&lots_limit=2&lots_offset=${offset}`));
    const first = stationWip([page(0)], 'gate', NOW);
    expect(first.current.map((item) => item.id)).toEqual(['acme-0002', 'acme/widgets#42']);
    expect(first).toMatchObject({ listed: 2, more: true, total: 5, claims: null });
    // A lot that moved between two pages is listed once.
    const all = stationWip([page(0), page(1), page(2)], 'gate', NOW);
    expect(all.current.map((item) => item.id)).toEqual(['acme-0002', 'acme/widgets#42', 'acme-0001']);
    expect(all.stale.map((item) => item.id)).toEqual(['acme-old']);
    expect(all).toMatchObject({ listed: 4, more: false, staleBy: { no_live_worker: 0, age: 1 } });
    // Ties go by name; a repository with nothing here is left out.
    expect(all.repos).toEqual([
      { repo: 'acme/a', total: 1 },
      { repo: 'acme/b', total: 1 },
    ]);
    expect(all.current[2]?.waitedS).toBe(3 * 3600);
  });

  it('sets apart Work claims no live worker backs, counting an old one by its claim', () => {
    const claims = { live: 1, no_live_worker: 2, unknown: 4 };
    const report: FlowReport = {
      ...FLOW_REPORT,
      stations: FLOW_REPORT.stations.map((station) => (station.id === 'work' ? { ...station, claims } : station)),
      lots: [
        { ...FLOW_REPORT.lots[0], lot_id: 'w-live', station: 'work', claim: 'live' },
        { ...FLOW_REPORT.lots[0], lot_id: 'w-dead', station: 'work', claim: 'no_live_worker' },
        { ...FLOW_REPORT.lots[0], lot_id: 'w-unknown', station: 'work', claim: 'unknown' },
        { ...FLOW_REPORT.lots[0], lot_id: 'w-dead-old', station: 'work', claim: 'no_live_worker', since: '2026-09-01T00:00:00.000Z' },
        { ...FLOW_REPORT.lots[0], lot_id: 'w-old', station: 'work', claim: 'unknown', since: '2026-09-02T00:00:00.000Z' },
      ],
    };
    const wip = stationWip([report], 'work', NOW);
    expect(wip.current.map((item) => item.id)).toEqual(['w-live', 'w-unknown']);
    expect(wip.stale.map((item) => [item.id, item.staleReason])).toEqual([
      ['w-dead', 'no_live_worker'],
      ['w-dead-old', 'no_live_worker'],
      ['w-old', 'age'],
    ]);
    expect(wip.claims).toEqual(claims);
    expect(staleWords(wip.staleBy)).toBe('3 stale · 2 with no live worker · 1 older than 14 days');
    expect(staleWords({ no_live_worker: 0, age: 2 })).toBe('2 stale · 2 older than 14 days');
    expect(claimsWords(claims)).toBe('1 with a live worker · 2 with no live worker · 4 not reported');
    expect(claimsWords({ live: 0, no_live_worker: 5, unknown: 0 })).toBe('0 with a live worker · 5 with no live worker');
  });

  it('words a hold, and says so when a held item carries no hold record', () => {
    const review = stationWip([FLOW_REPORT], 'review', NOW).current;
    expect(review.map((item) => item.hold)).toEqual(['no reason recorded', 'review held it']);
    expect(review[1]).toMatchObject({ holdBy: 'acme-reviewer', holdAgeS: 19_800, nobodyActing: true });
    expect(holdReasonWords('gate_red')).toBe('required check is red');
    expect(holdReasonWords('something_new')).toBe('something_new');
  });

  it('reads the repository from a pull request id only', () => {
    const [todo, pull] = lotsAt(FLOW_REPORT, 'gate');
    expect(itemRepo(todo!)).toBeNull();
    expect(itemRepo(pull!)).toBe('acme/widgets');
    expect(itemRepo({ ...todo!, lot_id: 'widgets#3' })).toBeNull();
  });

  it('counts the line in progress, over every family when the read is not scoped', () => {
    expect(lineSummary(FLOW_REPORT)).toBe('13 in progress');
    const topology = {
      families: [],
      products: [],
      unscoped_active_lots: 0,
      unknown: [],
      families_truncated: false,
      families_total: 12,
    };
    expect(lineSummary({ ...FLOW_REPORT, topology })).toBe('13 in progress across 12 families');
    expect(lineSummary({ ...FLOW_REPORT, topology: { ...topology, families_total: 1 } })).toBe(
      '13 in progress across 1 family'
    );
    // Scoped to a family, the count is that family's.
    expect(lineSummary({ ...FLOW_REPORT, family: 'acme', topology })).toBe('13 in progress');
    // A server that predates the total could leave families out, and says so.
    const legacy = { ...topology, families_truncated: true, families_total: undefined };
    expect(lineSummary({ ...FLOW_REPORT, topology: legacy })).toBe(
      '13 in progress · some families are left out of this read'
    );
  });

  it('keeps the estimate words other pages read', () => {
    const [first, partial] = lotsAt(FLOW_REPORT, 'gate');
    expect(etaWords(first!)).toBe('30m left (p90 1h 30m)');
    expect(etaWords(partial!)).toBe('40m left (p90 2h), not counting pin');
    expect(etaWords(lotsAt(FLOW_REPORT, 'review')[0]!)).toBe('held — a person is the next step');
  });
});

describe('Flow links', () => {
  it('refuses executable and authority-changing navigation', () => {
    expect(safeFlowHref('/work/item')).toBe('/work/item');
    for (const href of ['//evil.example', '/\\evil.example', 'javascript:alert(1)', '/work/\nitem']) {
      expect(safeFlowHref(href)).toBeNull();
    }
  });
});
