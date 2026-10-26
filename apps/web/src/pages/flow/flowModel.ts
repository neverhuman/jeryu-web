// flowModel.ts — everything the Flow page decides, kept pure so it is tested
// without a browser: which station the address picks, one number per station,
// and the work in progress at one station, oldest first, with the stale part
// set apart.
//
// Flow answers one question: where is the work in progress stuck right now.
// The page never fills a gap in: a station nothing has reached has no number,
// and when the server lists fewer items than it counts, the page says how many
// of how many it lists.

import type { FlowLot, FlowReport, FlowStation } from '../../api/types';
import { stationTotal, stationUnknown } from '../../components/flow/lineStripModel';
import { spanWords } from '../../format/duration';

export const FLOW_PATH = '/flow';
export const STATION_PARAM = 'station';

/** An item that has sat at its station longer than this is stale. */
export const STALE_AFTER_DAYS = 14;
const STALE_AFTER_S = STALE_AFTER_DAYS * 24 * 60 * 60;

/** A list renders this many rows until the reader asks for all of them. */
export const LIST_CAP = 50;

/** One station on the strip: its number in progress and its oldest wait. */
export interface StationSummary {
  id: string;
  label: string;
  /** Active, waiting and held together; null when nothing has reached it. */
  total: number | null;
  /** The items of this station the report lists. */
  listed: number;
  bottleneck: boolean;
  oldestS: number | null;
  /** The oldest wait against the stale cutoff, 0 to 1. */
  ageShare: number;
  /** The oldest wait is past the stale cutoff. */
  stale: boolean;
}

function ordered(report: FlowReport): FlowStation[] {
  return [...report.stations].sort((a, b) => a.order - b.order);
}

/** The nine stations in route order, one number each. */
export function stationSummaries(report: FlowReport): StationSummary[] {
  return ordered(report).map((station) => {
    const oldest = typeof station.oldest_wait_s === 'number' ? station.oldest_wait_s : null;
    return {
      id: station.id,
      label: station.label,
      total: stationUnknown(station) ? null : stationTotal(station),
      listed: report.lots.filter((lot) => lot.station === station.id).length,
      bottleneck: station.bottleneck,
      oldestS: oldest,
      ageShare: oldest === null ? 0 : Math.min(1, oldest / STALE_AFTER_S),
      stale: oldest !== null && oldest > STALE_AFTER_S,
    };
  });
}

/**
 * The station the page opens on: the bottleneck the server names, unless it
 * has nothing in progress, then the station with the most in progress.
 */
export function defaultStation(report: FlowReport): string | null {
  const stations = stationSummaries(report);
  const named = stations.find((station) => station.bottleneck);
  if (named && (named.total ?? 0) > 0) return named.id;
  const busiest = stations.reduce<StationSummary | null>(
    (best, station) => ((station.total ?? 0) > (best?.total ?? 0) ? station : best),
    null
  );
  return busiest?.id ?? named?.id ?? stations[0]?.id ?? null;
}

/** The station the address picks, or the default when it picks none it knows. */
export function selectedStation(params: URLSearchParams, report: FlowReport): string | null {
  const raw = params.get(STATION_PARAM);
  if (raw && report.stations.some((station) => station.id === raw)) return raw;
  return defaultStation(report);
}

/** The address that picks `station`, keeping the rest of the address. */
export function stationSearch(params: URLSearchParams, station: string): string {
  const next = new URLSearchParams(params);
  next.set(STATION_PARAM, station);
  // The old controls are gone; their parameters pick nothing now.
  for (const key of ['days', 'mode', 'repo', 'day', 'state', 'offset', 'lot']) next.delete(key);
  return `?${next.toString()}`;
}

/** One item in progress at a station, in the words a row shows. */
export interface WipItem {
  key: string;
  id: string;
  href: string | null;
  prHref: string | null;
  reviewHref: string | null;
  repo: string | null;
  state: string;
  /** Seconds at this station, read against one instant for the whole list. */
  waitedS: number | null;
  stale: boolean;
  /** Why it is held, in words; null when it is not held. */
  hold: string | null;
  holdBy: string | null;
  holdAgeS: number | null;
  nobodyActing: boolean;
}

/** The repository of a pull request item (`owner/repo#n`); a todo has none. */
export function itemRepo(lot: FlowLot): string | null {
  const hash = lot.lot_id.lastIndexOf('#');
  return hash > 0 && lot.lot_id.slice(0, hash).includes('/') ? lot.lot_id.slice(0, hash) : null;
}

function waitedSeconds(lot: FlowLot, now: Date): number | null {
  const since = Date.parse(lot.since);
  if (!Number.isFinite(since)) return null;
  return Math.max(0, (now.getTime() - since) / 1000);
}

function wipItem(lot: FlowLot, now: Date): WipItem {
  const waited = waitedSeconds(lot, now);
  const held = lot.state === 'held';
  return {
    key: `${lot.station}-${lot.lot_id}`,
    id: lot.lot_id,
    href: safeFlowHref(lot.href),
    prHref: safeFlowHref(lot.pr_href ?? null),
    reviewHref: safeFlowHref(lot.hold?.review_href ?? null),
    repo: itemRepo(lot),
    state: lot.state,
    waitedS: waited,
    // The report carries no per-item worker evidence, so an "active" claim
    // with no live worker cannot be told apart: age alone decides stale.
    stale: waited !== null && waited > STALE_AFTER_S,
    hold: lot.hold ? holdReasonWords(lot.hold.reason) : held ? 'no reason recorded' : null,
    holdBy: lot.hold?.by ?? null,
    holdAgeS: lot.hold?.age_s ?? null,
    nobodyActing: lot.hold?.nobody_acting ?? false,
  };
}

/** The repositories with work in progress at one station, most first. */
export interface RepoCount {
  repo: string;
  total: number;
}

export interface StationWip {
  /** In progress for at most the stale cutoff, oldest first. */
  current: WipItem[];
  /** Past the stale cutoff, oldest first. */
  stale: WipItem[];
  listed: number;
  /** What the station counts in progress; null when nothing has reached it. */
  total: number | null;
  repos: RepoCount[];
}

/** The work in progress at one station, oldest first, the stale part apart. */
export function stationWip(report: FlowReport, station: string, now: Date): StationWip {
  const items = lotsAt(report, station).map((lot) => wipItem(lot, now));
  const found = report.stations.find((candidate) => candidate.id === station);
  const repos = (report.repository_wip ?? [])
    .filter((row) => row.station === station)
    .map((row) => ({ repo: row.repo, total: row.waiting + row.active + row.held }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total || a.repo.localeCompare(b.repo));
  return {
    current: items.filter((item) => !item.stale),
    stale: items.filter((item) => item.stale),
    listed: items.length,
    total: found && !stationUnknown(found) ? stationTotal(found) : null,
    repos,
  };
}

/**
 * The items the report lists against what the line counts in progress. The
 * line counts each item once; an item can visit two stations at a time, so the
 * stations' numbers can add up to more.
 */
export function lineCoverage(report: FlowReport): { listed: number; total: number } {
  return { listed: report.lots.length, total: report.line.wip };
}

/** The lots at one station, oldest first. */
export function lotsAt(report: FlowReport, station: string): FlowLot[] {
  return report.lots
    .filter((lot) => lot.station === station)
    .slice()
    .sort((a, b) => a.since.localeCompare(b.since));
}

/** Seconds in words, or `—` when there is no number. */
export function ageWords(seconds: number | null): string {
  return seconds === null ? '—' : spanWords(seconds);
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

/** An app path the page may link to; anything else is no link. */
export function safeFlowHref(value: string | null): string | null {
  return value?.startsWith('/') && !value.startsWith('//') && !/[\\\u0000- ]/.test(value) ? value : null;
}
