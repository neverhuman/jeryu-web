// pullBandsModel.ts — the Pull requests timeline as bands down one time axis.
//
// Top to bottom the page reads future → present → past: shift work that has
// not opened a PR yet (see `pullGhostsModel`), then open PRs one row each,
// then merged work grouped by how far out it has shipped, then a floor.
//
// Bands key on LADDER POSITION, not on release name. Membership in a channel
// is ancestry (see `releaseChannelsModel`), so every old merged PR is an
// ancestor of what production runs and would report production's *current*
// release — grouping by name would collapse all history into one band and
// label it wrongly. "In stable, not yet production" is both true and the thing
// an operator needs, and it comes free from the same four compares.
//
// Everything below the floor — already in the deepest channel — collapses into
// one expandable band, because that history is settled; the bands above it are
// the release manifest and stay open.

import type { PullRequestSummary } from '../api/types';
import {
  CHANNEL_LABELS,
  type ChannelName,
  type PipId,
  type ReleaseLadder,
} from './releaseChannelsModel';

export type BandId = 'pending' | 'unknown' | 'unrecorded' | 'closed' | PipId;

export interface TimelineRow {
  pr: PullRequestSummary;
  ladder: ReleaseLadder;
  /** Closed PRs whose change this one carries instead. */
  supersedes: number[];
  /** Set on a closed row that another PR carried: it is folded away. */
  supersededBy: number | null;
}

export interface TimelineBand {
  id: BandId;
  label: string;
  /** Second line: the releases involved, or why the band exists. */
  hint: string;
  rows: TimelineRow[];
  /** Collapsed on first render; a click expands it. */
  collapsed: boolean;
  /** Rows beyond the band's cap, not in `rows`. */
  hidden: number;
}

export interface Timeline {
  /** Open and draft PRs, one row each, newest first. */
  open: TimelineRow[];
  /** Merged and closed work, grouped; empty bands are dropped. */
  bands: TimelineBand[];
  /** Merged but in no channel yet: the release manifest. */
  awaitingRelease: number;
  /** One line about what is below the floor, or null when nothing is. */
  floor: string | null;
}

/** Rows kept in the settled (deepest-channel) band before the rest are counted. */
export const FLOOR_BAND_CAP = 25;

export interface TimelineOptions {
  /** The ladder of the repository a PR belongs to. */
  ladderFor: (pr: PullRequestSummary) => ReleaseLadder;
  /** Cap on the settled band; the rest become `floor`. */
  floorCap?: number;
}

export function buildTimeline(
  pulls: readonly PullRequestSummary[],
  options: TimelineOptions
): Timeline {
  const floorCap = options.floorCap ?? FLOOR_BAND_CAP;
  const rows = pulls.map((pr) => ({
    pr,
    ladder: options.ladderFor(pr),
    supersedes: [] as number[],
    supersededBy: null as number | null,
  }));
  linkSupersessions(rows);

  const open: TimelineRow[] = [];
  const grouped = new Map<BandId, TimelineRow[]>();
  for (const row of rows) {
    const state = row.pr.state;
    if (state !== 'merged' && state !== 'closed') {
      open.push(row);
      continue;
    }
    // A closed PR another one carried is not a row of its own; it is a line on
    // its successor. Nothing is deleted — the successor names it.
    if (state === 'closed' && row.supersededBy !== null) continue;
    push(grouped, bandOf(row), row);
  }
  open.sort(openOrder);

  const bands: TimelineBand[] = [];
  let floor: string | null = null;
  for (const id of bandOrder(rows)) {
    const members = (grouped.get(id) ?? []).sort(mergedOrder);
    if (members.length === 0) continue;
    const settled = isSettled(id, rows);
    const capped = settled && members.length > floorCap;
    const shown = capped ? members.slice(0, floorCap) : members;
    bands.push({
      id,
      label: bandLabel(id, rows),
      hint: bandHint(id, members),
      rows: shown,
      // Settled history and folded closed work start collapsed; everything
      // between a merge and production is what the release step reads, so it
      // stays open.
      collapsed: settled || id === 'closed',
      hidden: members.length - shown.length,
    });
    if (capped) {
      const release = releaseNames(members)[0];
      floor = `${members.length - floorCap} older pull requests are in ${
        release ?? 'the deepest channel'
      } too and are not listed.`;
    }
  }

  return {
    open,
    bands,
    awaitingRelease: (grouped.get('pending') ?? []).length,
    floor,
  };
}

/**
 * How many merged PRs have shipped nowhere yet: the release manifest's size,
 * for the one-line summary above the timeline.
 */
export function awaitingReleaseCount(
  pulls: readonly PullRequestSummary[],
  ladderFor: (pr: PullRequestSummary) => ReleaseLadder
): number {
  return pulls.filter((pr) => {
    if (pr.state !== 'merged') return false;
    const ladder = ladderFor(pr);
    return ladder.kind !== 'none' && !ladder.furthest && !ladder.uncertain;
  }).length;
}

/** Which band a merged or closed row belongs to. */
export function bandOf(row: TimelineRow): BandId {
  if (row.pr.state === 'closed') return 'closed';
  if (row.ladder.kind === 'none') return 'unrecorded';
  if (row.ladder.furthest) return row.ladder.furthest;
  return row.ladder.uncertain ? 'unknown' : 'pending';
}

/**
 * Bands top to bottom: the manifest first (merged, not shipped), then each
 * channel from shallowest to deepest, then the settled floor, then what could
 * not be decided, then folded closed work.
 */
function bandOrder(rows: readonly TimelineRow[]): BandId[] {
  const channels = channelsPresent(rows);
  return ['pending', ...channels, 'unknown', 'unrecorded', 'closed'];
}

/** Pip ids in ladder order, as the loaded repositories actually report them. */
function channelsPresent(rows: readonly TimelineRow[]): PipId[] {
  const seen: PipId[] = [];
  for (const row of rows) {
    for (const pip of row.ladder.pips) {
      if (!seen.includes(pip.id)) seen.push(pip.id);
    }
  }
  // `ladder.pips` is already shallowest-first, and every repository orders them
  // the same way, so first-seen order is ladder order.
  return seen;
}

/** The deepest channel any loaded repository has: the floor of the page. */
export function deepestChannel(rows: readonly TimelineRow[]): PipId | null {
  const channels = channelsPresent(rows);
  return channels[channels.length - 1] ?? null;
}

function isSettled(id: BandId, rows: readonly TimelineRow[]): boolean {
  return id === deepestChannel(rows);
}

function bandLabel(id: BandId, rows: readonly TimelineRow[]): string {
  if (id === 'pending') return 'Merged · not yet released';
  if (id === 'unknown') return 'Merged · release unknown';
  if (id === 'unrecorded') return 'Merged · no release recorded';
  if (id === 'closed') return 'Closed';
  if (id === 'tag') return 'Released';
  const label = CHANNEL_LABELS[id as ChannelName] ?? id;
  const channels = channelsPresent(rows);
  const next = channels[channels.indexOf(id) + 1];
  if (!next) return `In ${label}`;
  const nextLabel = next === 'tag' ? 'a release' : CHANNEL_LABELS[next as ChannelName] ?? next;
  return `In ${label}, not yet ${nextLabel}`;
}

function bandHint(id: BandId, members: readonly TimelineRow[]): string {
  const count = `${members.length} PR${members.length === 1 ? '' : 's'}`;
  if (id === 'pending') return `${count} · ready for the next release`;
  if (id === 'closed') return `${count} · closed without merging`;
  if (id === 'unknown') return `${count} · where they shipped is not known here`;
  if (id === 'unrecorded') return `${count} · no deployment and no release tag`;
  const releases = releaseNames(members);
  return releases.length > 0 ? `${count} · ${releases.join(', ')}` : count;
}

/** The distinct release names carrying a band's rows at their deepest channel. */
export function releaseNames(rows: readonly TimelineRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.ladder.release) names.add(row.ladder.release);
  }
  return [...names].sort();
}

/**
 * A closed pull request whose change another one carries: either it says so
 * (`superseded by #12`, in a label or the title — what the shift driver and
 * pr-redteam can write mechanically), or a merged PR has the very same head
 * sha, which means the branch landed under a different number.
 */
export function linkSupersessions(rows: TimelineRow[]): void {
  const byNumber = new Map(rows.map((row) => [row.pr.number, row]));
  const mergedBySha = new Map<string, TimelineRow>();
  for (const row of rows) {
    if (row.pr.state === 'merged') mergedBySha.set(row.pr.head_sha, row);
  }
  for (const row of rows) {
    if (row.pr.state !== 'closed') continue;
    const declared = declaredSuccessor(row.pr);
    const successor =
      (declared !== null ? byNumber.get(declared) : undefined) ??
      mergedBySha.get(row.pr.head_sha) ??
      null;
    // Only a merged successor folds a closed row away: pointing at another
    // closed PR would hide both.
    if (!successor || successor.pr.state !== 'merged' || successor.pr.number === row.pr.number) {
      continue;
    }
    row.supersededBy = successor.pr.number;
    successor.supersedes.push(row.pr.number);
  }
  for (const row of rows) row.supersedes.sort((a, b) => a - b);
}

const SUPERSEDED_BY = /supersed(?:ed|es)\s*(?:by)?\s*#(\d+)/i;

function declaredSuccessor(pr: PullRequestSummary): number | null {
  for (const text of [pr.title, ...(pr.labels ?? [])]) {
    const match = SUPERSEDED_BY.exec(text ?? '');
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

/** Drafts last among open rows, then most recently updated. */
function openOrder(a: TimelineRow, b: TimelineRow): number {
  return (
    Number(a.pr.draft) - Number(b.pr.draft) ||
    b.pr.updated_at.localeCompare(a.pr.updated_at) ||
    b.pr.number - a.pr.number
  );
}

/** Newest merge first; a band is read from its most recent change down. */
function mergedOrder(a: TimelineRow, b: TimelineRow): number {
  return b.pr.updated_at.localeCompare(a.pr.updated_at) || b.pr.number - a.pr.number;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}
