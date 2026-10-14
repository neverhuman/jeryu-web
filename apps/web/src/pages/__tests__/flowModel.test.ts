// flowModel.test.ts — what the Flow page decides, without a browser: the
// address, a card's words, the rework arcs and one station's lots.

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WINDOW_DAYS,
  bottleneck,
  capacityWords,
  etaWords,
  lotsAt,
  parseMode,
  parseStation,
  parseWindow,
  reworkArcs,
  secondsWords,
  shareWords,
  stationCards,
  throughputWords,
  unknownWords,
  waitingWords,
} from '../flow/flowModel';
import { FLOW_REPORT } from './flowTestData';

const params = (search: string): URLSearchParams => new URLSearchParams(search);

describe('flowModel', () => {
  it('reads the window, the mode and the station from the address', () => {
    expect(parseWindow(params('days=7'))).toBe(7);
    expect(parseWindow(params('days=90'))).toBe(90);
    // A window the server does not answer for is the default, not a refusal.
    expect(parseWindow(params('days=5'))).toBe(DEFAULT_WINDOW_DAYS);
    expect(parseWindow(params(''))).toBe(DEFAULT_WINDOW_DAYS);
    expect(parseMode(params('mode=layout'))).toBe('layout');
    expect(parseMode(params('mode=nonsense'))).toBe('live');
    expect(parseStation(params('station=gate'), FLOW_REPORT)).toBe('gate');
    // A station this line does not have is no station at all.
    expect(parseStation(params('station=intake'), FLOW_REPORT)).toBeNull();
    expect(parseStation(params(''), FLOW_REPORT)).toBeNull();
  });

  it('says a number the ledger cannot support instead of a zero', () => {
    expect(secondsWords(null)).toBe('—');
    expect(secondsWords(1800)).toBe('30m');
    expect(shareWords(null)).toBe('—');
    expect(shareWords(0.19)).toBe('19%');
    expect(throughputWords(null)).toBe('—');
    expect(throughputWords(0)).toBe('none left');
    expect(throughputWords(0.2)).toBe('4.8/day');
    expect(throughputWords(4.2)).toBe('4.2/h');
    // Capacity waits on the heartbeat half of Flow.
    expect(capacityWords(FLOW_REPORT.stations[0])).toBe('capacity unknown');
    expect(
      capacityWords({
        ...FLOW_REPORT.stations[0],
        capacity: { tools: ['build-1/slot0', 'build-1/slot1'], reporting: 2, busy: 2, expected: 4 },
      })
    ).toBe('2/2 busy of 4 expected');
  });

  it('names why a station has no numbers', () => {
    const station = (id: string) => FLOW_REPORT.stations.find((s) => s.id === id)!;
    expect(unknownWords(station('pin'))).toBe('nothing has reached this station yet');
    expect(unknownWords(station('stage'))).toBe('queue time: not enough data');
    // Capacity alone is not a note on the Live page: Layout answers it.
    expect(unknownWords(station('queue'))).toBeNull();
  });

  it('cards the stations in route order, bars on one shared scale', () => {
    const cards = stationCards(FLOW_REPORT);
    expect(cards.map((card) => card.station.id)).toEqual([
      'queue',
      'work',
      'shift',
      'review',
      'gate',
      'merge',
      'pin',
      'stage',
      'deploy',
    ]);
    const gate = cards.find((card) => card.station.id === 'gate')!;
    expect(gate.tone).toBe('warn'); // a lot has waited past Gate's own p90
    expect(gate.queue).toBe('15m');
    expect(gate.process).toBe('6m 40s');
    expect(gate.throughput).toBe('4.2/h');
    // Work's visit is the longest on the line, so its bars fill the scale.
    const work = cards.find((card) => card.station.id === 'work')!;
    expect(Math.round(work.bars.queue + work.bars.process)).toBe(100);
    // Red is a hold: Review has one, so it carries the human tone.
    expect(cards.find((card) => card.station.id === 'review')!.tone).toBe('human');
    // A station nothing has reached has no numbers at all.
    const pin = cards.find((card) => card.station.id === 'pin')!;
    expect(pin.unknown).toBe(true);
    expect(pin.tone).toBe('unknown');
    expect(pin.queue).toBe('—');
  });

  it('draws one arc per rework loop, thicker for more lots', () => {
    const geometry = reworkArcs(FLOW_REPORT, { width: 900, height: 64 });
    expect(geometry.arcs.map((arc) => arc.id)).toEqual(['review-work', 'gate-work']);
    const [review, gate] = geometry.arcs;
    expect(gate.count).toBe(9);
    expect(gate.width).toBeGreaterThan(review.width);
    expect(gate.title).toBe('9 lots sent back from Gate to Work (19% of what left)');
    expect(review.title).toBe('2 lots sent back from Review to Work (10% of what left)');
    // The arc runs back along the line: it starts at Gate and ends at Work.
    expect(gate.path.startsWith('M 450.0')).toBe(true);
    expect(gate.path.endsWith('150.0 2')).toBe(true);
  });

  it('lists a station lots oldest first, with what is left and what is not counted', () => {
    const lots = lotsAt(FLOW_REPORT, 'gate');
    expect(lots.map((lot) => lot.lot_id)).toEqual([
      'acme-0001',
      'acme/widgets#42',
      'acme-0002',
    ]);
    expect(etaWords(lots[0])).toBe('30m left (p90 1h 30m)');
    expect(etaWords(lots[1])).toBe('40m left (p90 2h), not counting pin');
    const held = lotsAt(FLOW_REPORT, 'review')[0];
    expect(etaWords(held)).toBe('held — a person is the next step');
    expect(waitingWords(lots[0], new Date('2026-10-14T12:00:00.000Z'))).toBe('3h');
  });

  it('names the station that holds the most waiting', () => {
    expect(bottleneck(FLOW_REPORT)?.label).toBe('Gate');
    expect(
      bottleneck({
        ...FLOW_REPORT,
        stations: FLOW_REPORT.stations.map((station) => ({ ...station, bottleneck: false })),
      })
    ).toBeNull();
  });
});
