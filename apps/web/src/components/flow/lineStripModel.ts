// lineStripModel.ts — the two station counts the Flow strip reads: whether a
// station was ever reached, and what is at it now.
//
// A station the ledger has no events for keeps its place and says nothing:
// unknown stays unknown and never becomes a zero.

import type { FlowStation } from '../../api/types';

/** True when the station has never been reached: it has no numbers at all. */
export function stationUnknown(station: FlowStation): boolean {
  return station.unknown.some((unknown) => unknown.metric === 'all');
}

/** Lots at a station now, waiting, active and held together. */
export function stationTotal(station: FlowStation): number {
  return station.wip.waiting + station.wip.active + station.wip.held;
}
