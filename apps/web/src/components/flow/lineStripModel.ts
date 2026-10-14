// lineStripModel.ts — what the line strip decides, kept pure so it is tested
// without a browser.
//
// The strip is the nine stations of the delivery line left to right, each with
// what is at it now, and the one station that holds the most waiting. It is the
// typical path code takes plus where the work is right now, so it reads the
// same on the Flow page's header and above the Activity histogram.
//
// A station the ledger has no events for keeps its place and says nothing:
// unknown stays unknown and never becomes a zero.

import type { FlowReport, FlowStation } from '../../api/types';
import type { Tone } from '../tone/tone';
import { durationWords, spanWords } from '../../format/duration';

/** True when the station has never been reached: it has no numbers at all. */
export function stationUnknown(station: FlowStation): boolean {
  return station.unknown.some((unknown) => unknown.metric === 'all');
}

/** Lots at a station now, waiting, active and held together. */
export function stationTotal(station: FlowStation): number {
  return station.wip.waiting + station.wip.active + station.wip.held;
}

/**
 * The colour a station carries, by the site's tone rules:
 *   `human`  — a lot is held, so a person is the next step (red);
 *   `warn`   — a lot has waited past this station's own p90 (amber);
 *   `ok`     — work is moving through it (green);
 *   `unknown`— nothing is at it, or nothing is known about it (neutral).
 */
export function stationTone(station: FlowStation): Tone {
  if (stationUnknown(station)) return 'unknown';
  if (station.wip.held > 0) return 'human';
  const p90 = station.queue_s?.p90;
  if (
    station.wip.waiting > 0 &&
    typeof p90 === 'number' &&
    typeof station.oldest_wait_s === 'number' &&
    station.oldest_wait_s > p90
  ) {
    return 'warn';
  }
  if (station.wip.active > 0 || station.wip.waiting > 0) return 'ok';
  return 'unknown';
}

export interface StationCell {
  id: string;
  label: string;
  /** Null when the station has never been reached. */
  wip: { waiting: number; active: number; held: number } | null;
  total: number | null;
  tone: Tone;
  bottleneck: boolean;
  /** The whole cell in one sentence, for the title and the screen reader. */
  title: string;
}

/** One cell per station, in route order. */
export function stationCells(report: FlowReport): StationCell[] {
  return [...report.stations]
    .sort((a, b) => a.order - b.order)
    .map((station) => {
      const unknown = stationUnknown(station);
      return {
        id: station.id,
        label: station.label,
        wip: unknown ? null : station.wip,
        total: unknown ? null : stationTotal(station),
        tone: stationTone(station),
        bottleneck: station.bottleneck,
        title: cellTitle(station),
      };
    });
}

function cellTitle(station: FlowStation): string {
  if (stationUnknown(station)) return `${station.label}: nothing has reached this station yet`;
  const parts = [
    `${station.wip.waiting} waiting`,
    `${station.wip.active} active`,
    `${station.wip.held} held`,
  ];
  if (typeof station.oldest_wait_s === 'number') {
    parts.push(`oldest ${durationWords(station.oldest_wait_s)}`);
  }
  const note = station.bottleneck ? ' — holds the most waiting' : '';
  return `${station.label}: ${parts.join(', ')}${note}`;
}

/** The bottleneck station in a sentence, or null when none is named. */
export function bottleneckNote(report: FlowReport): string | null {
  const station = report.stations.find((candidate) => candidate.bottleneck);
  return station ? `${station.label} holds the most waiting` : null;
}

export interface LineTotal {
  id: string;
  label: string;
  value: string;
  detail: string;
}

/** Cycle time, X-factor and WIP for the whole line. */
export function lineTotals(report: FlowReport): LineTotal[] {
  const cycle = report.line.cycle_s;
  const factor = report.line.x_factor;
  return [
    {
      id: 'cycle',
      label: 'Cycle time',
      value: cycle ? spanWords(cycle.p50) : '—',
      detail: cycle ? `p90 ${spanWords(cycle.p90)}` : 'not enough data',
    },
    {
      id: 'x-factor',
      label: 'X-factor',
      value: factor ? `${factor.p50.toFixed(1)}×` : '—',
      detail: factor ? `p90 ${factor.p90.toFixed(1)}×` : 'not enough data',
    },
    {
      id: 'wip',
      label: 'WIP',
      value: String(report.line.wip),
      detail: `${report.line.finished} finished in ${report.days} days`,
    },
  ];
}

/** `/flow?station=<id>`, with the family the reader is scoped to. */
export function stationHref(id: string, family?: string): string {
  const query = new URLSearchParams({ station: id });
  if (family) query.set('family', family);
  return `/flow?${query.toString()}`;
}
