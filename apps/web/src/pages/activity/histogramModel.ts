// histogramModel.ts — pure helpers for the volume band above the Activity
// feed: the URL-held range, the groups a bar is stacked from, and the
// geometry of the inline SVG. Deterministic: no clock, no DOM.

import type {
  PipelineHistogramBucket,
  PipelineHistogramResponse,
} from '../../api/types';
import { tickText } from '../../format/when';
import { ACTIVITY_CHIPS, type ActivityChip } from './activityModel';

export type HistogramRangeId = '6h' | '24h' | '7d';

export interface HistogramRange {
  id: HistogramRangeId;
  label: string;
  hours: number;
}

export const HISTOGRAM_RANGES: readonly HistogramRange[] = [
  { id: '6h', label: '6h', hours: 6 },
  { id: '24h', label: '24h', hours: 24 },
  { id: '7d', label: '7d', hours: 24 * 7 },
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
    .filter((bucket) => typeof bucket?.at === 'string' && !Number.isNaN(Date.parse(bucket.at)))
    .map((bucket) => {
      const counts: Record<string, number> = {};
      let total = 0;
      for (const group of HISTOGRAM_GROUPS) {
        const n = count(bucket.groups?.[group.id]);
        counts[group.id] = n;
        total += n;
      }
      return {
        at: bucket.at,
        counts,
        failures: count(bucket.failures),
        needsHuman: count(bucket.needs_human),
        total,
      };
    });
  return buckets.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
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
  options: { width: number; height: number; spanHours: number }
): HistogramGeometry {
  const { width, height, spanHours } = options;
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
    for (const group of HISTOGRAM_GROUPS) {
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
  const parts = HISTOGRAM_GROUPS.filter((group) => (bucket.counts[group.id] ?? 0) > 0).map(
    (group) => `${group.label.toLowerCase()} ${bucket.counts[group.id]}`
  );
  const tail: string[] = [];
  if (bucket.failures > 0) tail.push(`${bucket.failures} failed`);
  if (bucket.needsHuman > 0) tail.push(`${bucket.needsHuman} needed a person`);
  const body = parts.length > 0 ? parts.join(', ') : 'nothing';
  return [`${when}: ${bucket.total} event${bucket.total === 1 ? '' : 's'}`, body, ...tail].join(' · ');
}

/** The band's one-sentence summary, read instead of the picture. */
export function histogramSummary(geometry: HistogramGeometry, rangeLabel: string): string {
  if (geometry.bars.length === 0) return `Pipeline volume over ${rangeLabel}: no events.`;
  const peak = geometry.bars.reduce((best, bar) => (bar.total > best.total ? bar : best), geometry.bars[0]);
  const failed = geometry.bars.reduce((sum, bar) => sum + bar.failed, 0);
  const human = geometry.bars.reduce((sum, bar) => sum + bar.needsHuman, 0);
  return (
    `Pipeline volume over ${rangeLabel}: ${geometry.events} event${geometry.events === 1 ? '' : 's'} ` +
    `in ${geometry.bars.length} bucket${geometry.bars.length === 1 ? '' : 's'}, busiest ${peak.total}` +
    `${failed > 0 ? `, ${failed} failed` : ''}${human > 0 ? `, ${human} needed a person` : ''}.`
  );
}
