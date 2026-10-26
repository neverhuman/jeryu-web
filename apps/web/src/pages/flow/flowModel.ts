// flowModel.ts — everything the Flow page decides, kept pure so it is tested
// without a browser: which station the address picks, one number per station,
// and the work in progress at one station, newest first, with the stale part
// set apart.
//
// Flow answers one question: where is the work in progress stuck right now.
// The page never fills a gap in: a station nothing has reached has no number,
// and a station's list is paged from the server, newest first, so what is
// listed is always a prefix of what the station counts.

import type { FlowClaim, FlowClaims, FlowLot, FlowReport, FlowStation } from '../../api/types';
import { stationTotal, stationUnknown } from '../../components/flow/lineStripModel';
import { spanWords } from '../../format/duration';

export const FLOW_PATH = '/flow';
export const STATION_PARAM = 'station';

/** An item that has sat at its station longer than this is stale. */
export const STALE_AFTER_DAYS = 14;
const STALE_AFTER_S = STALE_AFTER_DAYS * 24 * 60 * 60;

/** One station on the strip: its number in progress and its oldest wait. */
export interface StationSummary {
  id: string;
  label: string;
  /** Active, waiting and held together; null when nothing has reached it. */
  total: number | null;
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
  /** The heartbeats' read of an unheld Work claim; null everywhere else. */
  claim: FlowClaim | null;
  /** Why the item is stale; null while it is current. */
  staleReason: StaleReason | null;
  /** Why it is held, in words; null when it is not held. */
  hold: string | null;
  holdBy: string | null;
  holdAgeS: number | null;
  nobodyActing: boolean;
}

/**
 * Why an item is set apart from the work in progress: a Work claim no live
 * worker backs, or a wait past the stale cutoff. An item that is both is
 * counted once, by its claim.
 */
export type StaleReason = 'no_live_worker' | 'age';

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

function staleReason(claim: FlowClaim | null, waited: number | null): StaleReason | null {
  if (claim === 'no_live_worker') return 'no_live_worker';
  return waited !== null && waited > STALE_AFTER_S ? 'age' : null;
}

function wipItem(lot: FlowLot, now: Date): WipItem {
  const waited = waitedSeconds(lot, now);
  const held = lot.state === 'held';
  const claim = lot.claim ?? null;
  return {
    key: `${lot.station}-${lot.lot_id}`,
    id: lot.lot_id,
    href: safeFlowHref(lot.href),
    prHref: safeFlowHref(lot.pr_href ?? null),
    reviewHref: safeFlowHref(lot.hold?.review_href ?? null),
    repo: itemRepo(lot),
    state: lot.state,
    waitedS: waited,
    claim,
    staleReason: staleReason(claim, waited),
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
  /** Neither stale by claim nor by age, in the order listed: newest first. */
  current: WipItem[];
  /** Stale by claim or by age, newest first. */
  stale: WipItem[];
  /** How many of `stale` are each kind; together they are all of it. */
  staleBy: Record<StaleReason, number>;
  /** The items the pages read so far list. */
  listed: number;
  /** The station has more items past the pages read so far. */
  more: boolean;
  /** What the station counts in progress; null when nothing has reached it. */
  total: number | null;
  /** Every unheld claim at Work, listed or not; null at the other stations. */
  claims: FlowClaims | null;
  repos: RepoCount[];
}

/**
 * The work in progress at one station from the pages of it read so far
 * (`GET /api/v1/flow?station=&lots_order=newest`, one answer per page): the
 * items newest first, the stale part apart, and the station's counts from the
 * first page. An item that moved between two pages is listed once.
 */
export function stationWip(pages: readonly FlowReport[], station: string, now: Date): StationWip {
  const first = pages[0];
  const seen = new Set<string>();
  const items: WipItem[] = [];
  for (const lot of pages.flatMap((page) => page.lots)) {
    if (lot.station !== station || seen.has(lot.lot_id)) continue;
    seen.add(lot.lot_id);
    items.push(wipItem(lot, now));
  }
  const found = first?.stations.find((candidate) => candidate.id === station);
  const repos = (first?.repository_wip ?? [])
    .filter((row) => row.station === station)
    .map((row) => ({ repo: row.repo, total: row.waiting + row.active + row.held }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total || a.repo.localeCompare(b.repo));
  const stale = items.filter((item) => item.staleReason !== null);
  return {
    current: items.filter((item) => item.staleReason === null),
    stale,
    staleBy: {
      no_live_worker: stale.filter((item) => item.staleReason === 'no_live_worker').length,
      age: stale.filter((item) => item.staleReason === 'age').length,
    },
    listed: items.length,
    more: pages[pages.length - 1]?.lots_truncated === true,
    total: found && !stationUnknown(found) ? stationTotal(found) : null,
    claims: found?.claims ?? null,
    repos,
  };
}

/** The stale line's words: how many, and which is which. */
export function staleWords(by: Record<StaleReason, number>): string {
  const parts = [
    by.no_live_worker > 0 ? `${by.no_live_worker} with no live worker` : null,
    by.age > 0 ? `${by.age} older than ${STALE_AFTER_DAYS} days` : null,
  ].filter((part): part is string => part !== null);
  return `${by.no_live_worker + by.age} stale · ${parts.join(' · ')}`;
}

/** The Work claims in words, from the heartbeats' read of every unheld claim. */
export function claimsWords(claims: FlowClaims): string {
  return [
    `${claims.live} with a live worker`,
    `${claims.no_live_worker} with no live worker`,
    claims.unknown > 0 ? `${claims.unknown} not reported` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/**
 * What the line counts in progress, and over how many families when the read
 * is not scoped to one. The line counts each item once; an item can visit two
 * stations at a time, so the stations' numbers can add up to more.
 */
export function lineSummary(report: FlowReport): string {
  const total = `${report.line.wip} in progress`;
  const families = report.topology?.families_total;
  if (report.family === null && typeof families === 'number') {
    return `${total} across ${families} ${families === 1 ? 'family' : 'families'}`;
  }
  // A server that predates `families_total` could leave families out.
  if (report.topology?.families_truncated) return `${total} · some families are left out of this read`;
  return total;
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
