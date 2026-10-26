// flowModel.test.ts — what the Flow page decides, without a browser: one
// number per station, which station the address picks, the work in progress at
// a station oldest first with the stale part apart, the listed-of-counted
// totals, and which links the page will follow.

import { describe, expect, it } from 'vitest';

import type { FlowReport } from '../../api/types';
import {
  defaultStation,
  etaWords,
  holdReasonWords,
  itemRepo,
  lineCoverage,
  lotsAt,
  safeFlowHref,
  selectedStation,
  STALE_AFTER_DAYS,
  stationSearch,
  stationSummaries,
  stationWip,
} from '../flow/flowModel';
import { FLOW_REPORT } from './flowTestData';

const NOW = new Date('2026-10-14T12:00:00.000Z');

describe('flowModel', () => {
  it('gives each station one number in progress and its oldest wait against the stale cutoff', () => {
    const stations = stationSummaries(FLOW_REPORT);
    expect(stations.map((station) => station.id)).toEqual([
      'queue', 'work', 'shift', 'review', 'gate', 'merge', 'pin', 'stage', 'deploy',
    ]);
    const gate = stations.find((station) => station.id === 'gate')!;
    expect(gate).toMatchObject({ total: 5, listed: 3, bottleneck: true, oldestS: 4200, stale: false });
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

  it('lists a station oldest first and sets the stale part apart', () => {
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
    const wip = stationWip(report, 'gate', NOW);
    expect(wip.current.map((item) => item.id)).toEqual(['acme-0001', 'acme/widgets#42', 'acme-0002']);
    expect(wip.stale.map((item) => item.id)).toEqual(['acme-old']);
    expect(wip).toMatchObject({ listed: 4, total: 5 });
    // Ties go by name; a repository with nothing here is left out.
    expect(wip.repos).toEqual([
      { repo: 'acme/a', total: 1 },
      { repo: 'acme/b', total: 1 },
    ]);
    expect(wip.current[0]?.waitedS).toBe(3 * 3600);
  });

  it('words a hold, and says so when a held item carries no hold record', () => {
    const review = stationWip(FLOW_REPORT, 'review', NOW).current;
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

  it('counts what the line lists against what it counts in progress', () => {
    expect(lineCoverage(FLOW_REPORT)).toEqual({ listed: 6, total: 13 });
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
