// flowModel.ts — everything the Flow page decides, kept pure so it is tested
// without a browser: the controls read from the address, a station card's
// numbers in words, the rework arcs under the line, and the lots at one
// station with their estimates.
//
// The page never fills a gap in: a metric the ledger cannot support says so
// ("not enough data", "nothing here yet") and a station that has never been
// reached keeps its place on the line with no numbers at all.

import type { FlowLot, FlowReport, FlowStation } from '../../api/types';
import type { Tone } from '../../components/tone/tone';
import { stationTone, stationUnknown } from '../../components/flow/lineStripModel';
import { durationWords, spanWords } from '../../format/duration';

export const FLOW_PATH = '/flow';

/** The windows a reader can pick, in days; the server answers these three. */
export const FLOW_WINDOWS: readonly number[] = [7, 28, 90];
export const DEFAULT_WINDOW_DAYS = 28;

export const WINDOW_PARAM = 'days';
export const MODE_PARAM = 'mode';
export const STATION_PARAM = 'station';

/** The page's two modes. Layout is the runners serving each station. */
export type FlowMode = 'live' | 'layout';
export const DEFAULT_MODE: FlowMode = 'live';

/** The window the address asks for; anything else is the default. */
export function parseWindow(params: URLSearchParams): number {
  const raw = Number(params.get(WINDOW_PARAM));
  return FLOW_WINDOWS.includes(raw) ? raw : DEFAULT_WINDOW_DAYS;
}

export function parseMode(params: URLSearchParams): FlowMode {
  return params.get(MODE_PARAM) === 'layout' ? 'layout' : DEFAULT_MODE;
}

/** The station whose lots are listed, or null when none is picked. */
export function parseStation(params: URLSearchParams, report?: FlowReport): string | null {
  const raw = params.get(STATION_PARAM);
  if (!raw) return null;
  if (!report) return raw;
  return report.stations.some((station) => station.id === raw) ? raw : null;
}

/** Seconds in words, or `—` for a number the window cannot define. */
export function secondsWords(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return spanWords(value);
}

/** A share as whole percent; `—` when there is none. */
export function shareWords(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

/** Lots an hour, said the way a reader would: per hour, or per day when slow. */
export function throughputWords(perHour: number | null | undefined): string {
  if (typeof perHour !== 'number' || !Number.isFinite(perHour)) return '—';
  if (perHour === 0) return 'none left';
  if (perHour < 1) return `${(perHour * 24).toFixed(1)}/day`;
  return `${perHour.toFixed(1)}/h`;
}

/** The tools in use against the tools serving a station. */
export function capacityWords(station: FlowStation): string {
  const capacity = station.capacity;
  if (!capacity) return 'capacity unknown';
  const reporting = capacity.reporting ?? capacity.tools?.length ?? null;
  if (typeof reporting !== 'number') return 'capacity unknown';
  const busy = typeof capacity.busy === 'number' ? capacity.busy : null;
  const expected = typeof capacity.expected === 'number' ? ` of ${capacity.expected} expected` : '';
  return `${busy ?? '—'}/${reporting} busy${expected}`;
}

/** Why a station has no numbers, in the reader's words. */
export function unknownWords(station: FlowStation): string | null {
  const reasons: Record<string, string> = {
    no_events: 'nothing has reached this station yet',
    too_few_samples: 'not enough data',
    no_heartbeat: 'no heartbeat yet',
  };
  const whole = station.unknown.find((unknown) => unknown.metric === 'all');
  if (whole) return reasons[whole.reason] ?? whole.reason;
  const named = station.unknown.filter((unknown) => unknown.metric !== 'capacity');
  if (named.length === 0) return null;
  const metrics = named.map((unknown) => METRIC_WORDS[unknown.metric] ?? unknown.metric);
  const reason = reasons[named[0].reason] ?? named[0].reason;
  return `${metrics.join(', ')}: ${reason}`;
}

const METRIC_WORDS: Record<string, string> = {
  queue_s: 'queue time',
  process_s: 'process time',
  first_pass_rate: 'first pass',
  capacity: 'capacity',
};

export interface StationCard {
  station: FlowStation;
  tone: Tone;
  /** True when nothing has ever reached the station. */
  unknown: boolean;
  /** Queue p50 and process p50 as shares of the slowest station's visit. */
  bars: { queue: number; process: number };
  oldest: string;
  queue: string;
  process: string;
  throughput: string;
  capacity: string;
  note: string | null;
}

/** One card per station, in route order, with their bars on a shared scale. */
export function stationCards(report: FlowReport): StationCard[] {
  const stations = [...report.stations].sort((a, b) => a.order - b.order);
  const widest = Math.max(
    1,
    ...stations.map((station) => (station.queue_s?.p50 ?? 0) + (station.process_s?.p50 ?? 0))
  );
  return stations.map((station) => ({
    station,
    tone: stationTone(station),
    unknown: stationUnknown(station),
    bars: {
      queue: ((station.queue_s?.p50 ?? 0) / widest) * 100,
      process: ((station.process_s?.p50 ?? 0) / widest) * 100,
    },
    oldest: secondsWords(station.oldest_wait_s),
    queue: station.queue_s ? durationWords(station.queue_s.p50) : '—',
    process: station.process_s ? durationWords(station.process_s.p50) : '—',
    throughput: throughputWords(station.throughput_per_hour),
    capacity: capacityWords(station),
    note: unknownWords(station),
  }));
}

export interface ReworkArc {
  id: string;
  from: string;
  to: string;
  count: number;
  /** The SVG path of the loop back along the line. */
  path: string;
  /** The stroke width, thicker for more lots. */
  width: number;
  /** Where the count sits, at the top of the arc. */
  label: { x: number; y: number };
  title: string;
}

export interface ArcGeometry {
  width: number;
  height: number;
  arcs: ReworkArc[];
}

/**
 * The rework loops as arcs under the line: one per station pair, from the
 * station that sent the work back to the station it went back to, thicker for
 * more lots. A loop whose target is not on the line is left out rather than
 * drawn to nowhere.
 */
export function reworkArcs(
  report: FlowReport,
  options: { width: number; height: number } = { width: 900, height: 64 }
): ArcGeometry {
  const stations = [...report.stations].sort((a, b) => a.order - b.order);
  const centre = (id: string): number | null => {
    const index = stations.findIndex((station) => station.id === id);
    return index < 0 ? null : ((index + 0.5) / stations.length) * options.width;
  };
  const counts = stations.flatMap((station) =>
    station.rework.map((rework) => ({ from: station.id, ...rework }))
  );
  const busiest = Math.max(1, ...counts.map((rework) => rework.count));
  const arcs: ReworkArc[] = [];
  for (const rework of counts) {
    const from = centre(rework.from);
    const to = centre(rework.to);
    if (from === null || to === null || rework.count <= 0) continue;
    const fromLabel = stations.find((station) => station.id === rework.from)?.label ?? rework.from;
    const toLabel = stations.find((station) => station.id === rework.to)?.label ?? rework.to;
    // Deeper for a longer loop, so two loops over the same stretch are apart.
    const span = Math.abs(from - to) / options.width;
    const depth = Math.min(options.height - 6, 14 + span * (options.height - 20));
    arcs.push({
      id: `${rework.from}-${rework.to}`,
      from: rework.from,
      to: rework.to,
      count: rework.count,
      path: `M ${from.toFixed(1)} 2 C ${from.toFixed(1)} ${depth.toFixed(1)}, ${to.toFixed(1)} ${depth.toFixed(1)}, ${to.toFixed(1)} 2`,
      width: 1 + (rework.count / busiest) * 5,
      label: { x: (from + to) / 2, y: Math.min(options.height - 2, depth * 0.78 + 4) },
      title: `${rework.count} ${rework.count === 1 ? 'lot' : 'lots'} sent back from ${fromLabel} to ${toLabel} (${shareWords(rework.rate)} of what left)`,
    });
  }
  return { width: options.width, height: options.height, arcs };
}

/** The lots at one station, oldest first. */
export function lotsAt(report: FlowReport, station: string): FlowLot[] {
  return report.lots
    .filter((lot) => lot.station === station)
    .slice()
    .sort((a, b) => a.since.localeCompare(b.since));
}

const HOLD_REASONS: Record<string, string> = {
  review_hold: 'review held it',
  gate_red: 'required check is red',
  queue_conflict: 'merge queue refused it (conflict)',
  queue_failed: 'merge queue gave up on it',
  superseded: 'a later pull request replaced it',
};

/** What stopped a held lot, in words; an unknown reason is shown as sent. */
export function holdReasonWords(reason: string): string {
  return HOLD_REASONS[reason] ?? reason;
}

/** A lot's estimate in words: what is left, and what it does not cover. */
export function etaWords(lot: FlowLot): string {
  if (lot.state === 'held') return 'held — a person is the next step';
  if (!lot.eta_s) return 'no estimate yet';
  const base = `${spanWords(lot.eta_s.p50)} left (p90 ${spanWords(lot.eta_s.p90)})`;
  if (!lot.eta_partial) return base;
  const missing = lot.eta_unknown_stations.join(', ');
  return `${base}, not counting ${missing || 'some stations'}`;
}

/** How long a lot has been where it is. */
export function waitingWords(lot: FlowLot, now: Date): string {
  const since = Date.parse(lot.since);
  if (!Number.isFinite(since)) return '—';
  return spanWords(Math.max(0, (now.getTime() - since) / 1000));
}

/** The one station holding the most waiting, or null. */
export function bottleneck(report: FlowReport): FlowStation | null {
  return report.stations.find((station) => station.bottleneck) ?? null;
}

export function safeFlowHref(value: string | null): string | null {
  return value?.startsWith('/') && !value.startsWith('//') && !/[\\\u0000-\u0020]/.test(value) ? value : null;
}

export function safeFlowLogHref(value: string | null): string | null {
  if (safeFlowHref(value)) return value;
  if (!value || /[\\\u0000-\u0020]/.test(value)) return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? value : null; } catch { return null; }
}
