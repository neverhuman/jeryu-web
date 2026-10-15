// histogramModel.ts — pure helpers for the volume band above the Activity
// feed: the URL-held range, the groups a bar is stacked from, and the
// geometry of the inline SVG. Deterministic: no clock, no DOM.

import type {
  PipelineHistogramBucket,
  PipelineHistogramQuery,
  PipelineHistogramResponse,
} from '../../api/types';
import type { ActivityTotals } from './activityModel';
import { tickText } from '../../format/when';
import { ACTIVITY_CHIPS, type ActivityChip } from './activityModel';

export type HistogramRangeId = '6h' | '24h' | '7d' | '30d';

export interface HistogramRange {
  id: HistogramRangeId;
  label: string;
  hours: number;
}

export const HISTOGRAM_RANGES: readonly HistogramRange[] = [
  { id: '6h', label: '6h', hours: 6 },
  { id: '24h', label: '24h', hours: 24 },
  { id: '7d', label: '7d', hours: 24 * 7 },
  // The log keeps a month, so this is as far back as the band can reach.
  { id: '30d', label: '30d', hours: 24 * 30 },
];

export const DEFAULT_RANGE: HistogramRangeId = '24h';

/** `?range=`, falling back to 24 h when it is absent or not one we draw. */
export function parseRange(params: URLSearchParams): HistogramRangeId {
  const asked = (params.get('range') ?? '').trim();
  return HISTOGRAM_RANGES.find((range) => range.id === asked)?.id ?? DEFAULT_RANGE;
}

export function rangeHours(id: HistogramRangeId): number {
  return HISTOGRAM_RANGES.find((range) => range.id === id)?.hours ?? 24;
}

/**
 * The window part of the histogram query. The server names 6h, 24h and 7d as
 * a `range`; anything longer is asked for in `hours`, which it buckets by day.
 */
export function rangeQuery(id: HistogramRangeId): Pick<PipelineHistogramQuery, 'range' | 'hours'> {
  return id === '30d' ? { hours: rangeHours(id) } : { range: id };
}

/**
 * The whole histogram query for a range and a scope. The band and the chip
 * counts both ask through this, so they share one request and one answer.
 */
export function histogramQuery(
  id: HistogramRangeId,
  scope: { family?: string; repo?: string }
): PipelineHistogramQuery {
  const where = scope.repo ? { repo: scope.repo } : scope.family ? { family: scope.family } : {};
  return { ...rangeQuery(id), ...where };
}

/**
 * How often the band and the chip counts ask again. A wide window barely
 * moves between asks, so it is asked for less often than a narrow one.
 */
export function histogramRefetchMs(id: HistogramRangeId): number {
  return id === '30d' ? 300_000 : id === '7d' ? 60_000 : 15_000;
}

/** The URL params a range button sets, keeping every other filter. */
export function applyRange(params: URLSearchParams, id: HistogramRangeId): URLSearchParams {
  const next = new URLSearchParams(params);
  if (id === DEFAULT_RANGE) next.delete('range');
  else next.set('range', id);
  return next;
}

/** One stacked group, bound to the chip that filters the list to it. */
export interface HistogramGroup {
  id: string;
  label: string;
  chipId: string;
}

/** The bar's stack, bottom to top. Each group is one of the feed's chips. */
export const HISTOGRAM_GROUPS: readonly HistogramGroup[] = [
  { id: 'todos', label: 'Todos', chipId: 'todos' },
  { id: 'gates', label: 'Gates', chipId: 'gates' },
  { id: 'reviews', label: 'Reviews', chipId: 'reviews' },
  { id: 'pulls', label: 'Pull requests', chipId: 'pulls' },
  { id: 'merges', label: 'Merges', chipId: 'merges' },
  { id: 'releases', label: 'Releases', chipId: 'releases' },
  { id: 'deploys', label: 'Deploys', chipId: 'deploys' },
];

/**
 * Events the server counts in a group this build does not stack. They are
 * drawn on top of each bar so the bars, the heading and the All chip add up
 * to the server's own total; there is no chip for them, so they filter nothing.
 */
export const OTHER_GROUP: HistogramGroup = { id: 'other', label: 'Other', chipId: 'all' };

const DRAWN_GROUPS: readonly HistogramGroup[] = [...HISTOGRAM_GROUPS, OTHER_GROUP];

export function chipOfGroup(groupId: string): ActivityChip | undefined {
  const group = HISTOGRAM_GROUPS.find((candidate) => candidate.id === groupId);
  return ACTIVITY_CHIPS.find((chip) => chip.id === group?.chipId);
}

/** The chip a group belongs to, as the chip row would say it is active. */
export function activeGroupId(activeChipId: string | null): string | null {
  return HISTOGRAM_GROUPS.find((group) => group.chipId === activeChipId)?.id ?? null;
}

/** One bucket, with every group counted and nothing unknown kept. */
export interface HistogramBucket {
  at: string;
  counts: Record<string, number>;
  failures: number;
  needsHuman: number;
  total: number;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * The server's answer as the chart reads it: oldest bucket first, one count
 * per group this page draws, others ignored. A server that sends a group this
 * build does not know is not an error; it simply is not stacked.
 */
export function histogramBuckets(response: PipelineHistogramResponse | undefined): HistogramBucket[] {
  const raw: PipelineHistogramBucket[] = response?.buckets ?? [];
  const buckets = raw
    .filter((bucket) => typeof bucket?.start === 'string' && !Number.isNaN(Date.parse(bucket.start)))
    .map((bucket) => {
      const counts: Record<string, number> = {};
      let stacked = 0;
      for (const group of HISTOGRAM_GROUPS) {
        const n = count(bucket.by_group?.[group.id]);
        counts[group.id] = n;
        stacked += n;
      }
      // The server's total counts every event, the stacked groups only some:
      // the rest is Other. A server without a total names its own `other`.
      const total = count(bucket.total);
      counts[OTHER_GROUP.id] = total > stacked ? total - stacked : count(bucket.by_group?.[OTHER_GROUP.id]);
      return {
        at: bucket.start,
        counts,
        failures: count(bucket.failures),
        needsHuman: count(bucket.needs_human),
        total: stacked + counts[OTHER_GROUP.id],
      };
    });
  return buckets.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * Events per chip over the drawn range, read off the band's own by-group
 * counts so a chip and the bar above it can never disagree. `all` is the
 * window's events and `human` the ones that flagged somebody; every other
 * chip is the group it filters to. A chip the band stacks no group for is
 * left out rather than counted zero: a zero would say the feed is empty of
 * what the chip shows, when all it means is that the server does not count
 * that group yet.
 */
/**
 * What the server's answer says about itself, so a mismatch is said on the
 * band rather than drawn as an empty or mislabelled plot. `unreadable`: it
 * sent buckets and none of them is one this build reads. `answeredHours`: the
 * window it answered, when that is shorter than the one asked for.
 */
export interface HistogramReadout {
  unreadable: boolean;
  answeredHours: number | null;
}

export function histogramReadout(
  response: PipelineHistogramResponse | undefined,
  askedHours: number
): HistogramReadout {
  const sent = response?.buckets?.length ?? 0;
  const unreadable = sent > 0 && histogramBuckets(response).length === 0;
  const from = Date.parse(response?.from ?? '');
  const to = Date.parse(response?.to ?? '');
  const span = Number.isNaN(from) || Number.isNaN(to) ? null : (to - from) / 3_600_000;
  // Bucket edges round the window out, never in, so only a clearly shorter
  // answer is one the server chose: a server that ignored the asked window.
  const answeredHours = span !== null && span > 0 && span < askedHours * 0.9 ? Math.round(span) : null;
  return { unreadable, answeredHours };
}

export function chipCounts(buckets: readonly HistogramBucket[]): Record<string, number> {
  const counts: Record<string, number> = { all: 0, human: 0 };
  for (const chip of ACTIVITY_CHIPS) {
    if (HISTOGRAM_GROUPS.some((group) => group.chipId === chip.id)) counts[chip.id] = 0;
  }
  for (const bucket of buckets) {
    counts.all += bucket.total;
    counts.human += bucket.needsHuman;
    for (const group of HISTOGRAM_GROUPS) {
      counts[group.chipId] = (counts[group.chipId] ?? 0) + (bucket.counts[group.id] ?? 0);
    }
  }
  return counts;
}

export interface HistogramSegment {
  groupId: string;
  value: number;
  y: number;
  height: number;
}

export interface HistogramBar {
  at: string;
  x: number;
  width: number;
  /** Bottom to top, empty groups dropped. */
  segments: HistogramSegment[];
  /** The failed share of the bar, drawn over the stack. */
  failures: { y: number; height: number } | null;
  /** Where the red tick sits, when a bucket flagged somebody. */
  tickY: number | null;
  total: number;
  failed: number;
  needsHuman: number;
  title: string;
  /** The last bucket: the one still filling, drawn with a pulse. */
  current: boolean;
}

export interface HistogramGeometry {
  bars: HistogramBar[];
  /** The tallest bucket, so the band can say what its top line means. */
  max: number;
  events: number;
  ticks: Array<{ x: number; label: string }>;
}

const BAR_GAP = 2;
/** A bucket with events is never invisible: it is at least this tall. */
const MIN_BAR = 2;

export function histogramGeometry(
  buckets: HistogramBucket[],
  options: { width: number; height: number; spanHours: number; only?: string | null }
): HistogramGeometry {
  const { width, height, spanHours } = options;
  const only = options.only ? HISTOGRAM_GROUPS.find((group) => group.id === options.only) : undefined;
  // One group picked: draw that group alone, scaled to its own busiest bucket,
  // so a thin series (Deploys) is read on its own axis, not under the gates.
  // Failures and needs-a-person are counted per bucket, not per group, so
  // neither is drawn over a single group.
  if (only) {
    buckets = buckets.map((bucket) => {
      const value = bucket.counts[only.id] ?? 0;
      return { ...bucket, counts: { [only.id]: value }, total: value, failures: 0, needsHuman: 0 };
    });
  }
  const max = Math.max(1, ...buckets.map((bucket) => bucket.total));
  const slot = buckets.length > 0 ? width / buckets.length : width;
  const barWidth = Math.max(1, slot - BAR_GAP);

  const bars = buckets.map((bucket, index) => {
    const x = index * slot;
    // The whole bar is scaled against the busiest bucket; its groups then
    // split that height, so the stack always ends exactly at the bar's top.
    const barHeight = bucket.total > 0 ? Math.max(MIN_BAR, (bucket.total / max) * height) : 0;
    const barTop = height - barHeight;
    let top = height;
    const segments: HistogramSegment[] = [];
    for (const group of DRAWN_GROUPS) {
      const value = bucket.counts[group.id] ?? 0;
      if (value <= 0) continue;
      const segHeight = (value / bucket.total) * barHeight;
      top -= segHeight;
      segments.push({ groupId: group.id, value, y: top, height: segHeight });
    }
    const failedHeight =
      bucket.failures > 0 && bucket.total > 0
        ? Math.min(barHeight, (bucket.failures / bucket.total) * barHeight)
        : 0;
    return {
      at: bucket.at,
      x,
      width: barWidth,
      segments,
      failures: failedHeight > 0 ? { y: height - failedHeight, height: failedHeight } : null,
      tickY: bucket.needsHuman > 0 ? barTop : null,
      total: bucket.total,
      failed: bucket.failures,
      needsHuman: bucket.needsHuman,
      title: bucketTitle(bucket, spanHours),
      current: index === buckets.length - 1,
    };
  });

  const ticks = buckets
    .map((bucket, index) => ({ x: index * slot + barWidth / 2, label: tickText(Date.parse(bucket.at), spanHours), index }))
    .filter((tick, _i, all) => all.length > 0 && tick.index % Math.max(1, Math.ceil(all.length / 6)) === 0)
    .map(({ x, label }) => ({ x, label }));

  return {
    bars,
    max,
    events: buckets.reduce((sum, bucket) => sum + bucket.total, 0),
    ticks,
  };
}

/** The `<title>` of one bar: the time, the stack, and what went wrong. */
export function bucketTitle(bucket: HistogramBucket, spanHours: number): string {
  const when = tickText(Date.parse(bucket.at), spanHours);
  const parts = DRAWN_GROUPS.filter((group) => (bucket.counts[group.id] ?? 0) > 0).map(
    (group) => `${group.label.toLowerCase()} ${bucket.counts[group.id]}`
  );
  const tail: string[] = [];
  if (bucket.failures > 0) tail.push(`${bucket.failures} failed`);
  if (bucket.needsHuman > 0) tail.push(`${bucket.needsHuman} needed a person`);
  const body = parts.length > 0 ? parts.join(', ') : 'nothing';
  return [`${when}: ${bucket.total} event${bucket.total === 1 ? '' : 's'}`, body, ...tail].join(' · ');
}

/** The band's one-sentence summary, read instead of the picture. */
export function histogramSummary(geometry: HistogramGeometry, rangeLabel: string, onlyLabel?: string): string {
  // One group drawn alone says so, as the heading does: its bars are that
  // group on its own scale, with no failures or needs-a-person drawn.
  const what = onlyLabel ? `${onlyLabel} volume` : 'Pipeline volume';
  if (geometry.events === 0) return `${what} over ${rangeLabel}: no events.`;
  const peak = geometry.bars.reduce((best, bar) => (bar.total > best.total ? bar : best), geometry.bars[0]);
  const failed = geometry.bars.reduce((sum, bar) => sum + bar.failed, 0);
  const human = geometry.bars.reduce((sum, bar) => sum + bar.needsHuman, 0);
  return (
    `${what} over ${rangeLabel}: ${geometry.events} event${geometry.events === 1 ? '' : 's'} ` +
    `in ${geometry.bars.length} bucket${geometry.bars.length === 1 ? '' : 's'}, busiest ${peak.total}` +
    `${failed > 0 ? `, ${failed} failed` : ''}${human > 0 ? `, ${human} needed a person` : ''}.`
  );
}

/**
 * The window totals the strip reads, or null on a server that only sends
 * buckets. A total that is missing or not a number counts as zero, so one
 * absent field does not drop the strip back to counting loaded rows.
 */
export function histogramTotals(response: PipelineHistogramResponse | undefined): ActivityTotals | null {
  const totals = response?.totals;
  if (!totals || typeof totals !== 'object') return null;
  return {
    todosFinished: count(totals.todos_finished),
    blocked: count(totals.blocked),
    prsMerged: count(totals.prs_merged),
    deploys: count(totals.deploys),
    spentUsd: money(totals.spent_usd),
  };
}

function money(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100) / 100;
}
