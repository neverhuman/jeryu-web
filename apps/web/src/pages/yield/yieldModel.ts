// yieldModel.ts — everything the Yield page decides, kept pure so it is tested
// without a browser: the controls read from the address, the window turned
// into dates, money and rates in words, the KPI row, the two funnel bars, the
// weekly trend geometry and the rows of the arm table.
//
// The headline is one number: what a change that reached main cost. Every
// other figure on the page explains it: how much spend reached main at all
// (yield), how much of it was a first try (first pass), what review added,
// and what was thrown away (killed runs, scrapped todos).

import type {
  YieldArm,
  YieldBy,
  YieldRow,
  YieldTodoRef,
  YieldWeek,
} from '../../api/types';
import type { Tone } from '../../components/tone/tone';
import { shiftDayKey, utcDayKey } from '../../format/when';
import { statusTone } from '../shift/shiftModel';

export const YIELD_PATH = '/yield';

/** The windows a reader can pick, in days. */
export const YIELD_WINDOWS: readonly number[] = [7, 28, 90];
export const DEFAULT_WINDOW_DAYS = 28;

export const WINDOW_PARAM = 'days';
export const BY_PARAM = 'by';

/** The cuts of the breakdown table, in the order the switcher shows them. */
export const YIELD_BYS: readonly { id: YieldBy; label: string }[] = [
  { id: 'model', label: 'Model' },
  { id: 'agent', label: 'Agent' },
  { id: 'experiment', label: 'Experiment arm' },
  { id: 'family', label: 'Family' },
  { id: 'repo', label: 'Repository' },
  { id: 'requester', label: 'Requester' },
  { id: 'week', label: 'Week' },
];
export const DEFAULT_BY: YieldBy = 'model';

/** At most this many groups get a line of their own on the trend chart. */
export const TREND_SERIES_MAX = 4;

/** The window the address asks for; anything else is the default. */
export function parseWindow(params: URLSearchParams): number {
  const raw = Number(params.get(WINDOW_PARAM));
  return YIELD_WINDOWS.includes(raw) ? raw : DEFAULT_WINDOW_DAYS;
}

/** The cut the address asks for; anything else is the default. */
export function parseBy(params: URLSearchParams): YieldBy {
  const raw = params.get(BY_PARAM);
  return YIELD_BYS.find((by) => by.id === raw)?.id ?? DEFAULT_BY;
}

/**
 * `since` and `until` for a window ending today (UTC). The server's own
 * default is 28 days before today, so the 28-day window asks for exactly what
 * a bare request gets.
 */
export function windowDates(days: number, now: Date): { since: string; until: string } {
  const until = utcDayKey(now);
  return { since: shiftDayKey(until, -days), until };
}

/**
 * Dollars: cents below a hundred, whole dollars above, grouped. A value the
 * window cannot define reads `—`.
 */
export function formatUsd(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : 2;
  const text = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(abs);
  return `${value < 0 ? '-' : ''}$${text}`;
}

/** A 0..1 rate in whole percent; `—` when it is undefined. */
export function formatRate(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

/** `$3.10–$5.40`, or null without an interval. */
export function formatCi(ci: readonly [number, number] | null | undefined): string | null {
  if (!ci) return null;
  return `${formatUsd(Math.max(0, ci[0]))}–${formatUsd(ci[1])}`;
}

/** The part of a whole, 0..1, or null when the whole is nothing. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export interface YieldKpi {
  id: 'per-merged' | 'yield' | 'first-pass' | 'review-share' | 'waste';
  label: string;
  value: string;
  detail: string;
}

/** The five numbers across the top, headline first. */
export function yieldKpis(row: YieldRow): YieldKpi[] {
  const ci = formatCi(row.usd_per_merged_ci95);
  const merged = plural(row.merged, 'merged change');
  return [
    {
      id: 'per-merged',
      label: 'Cost per merged change',
      value: formatUsd(row.usd_per_merged),
      detail: ci ? `95% range ${ci} · ${merged}` : `${merged} · no range under two`,
    },
    {
      id: 'yield',
      label: 'Yield',
      value: formatRate(row.yield),
      detail: `of finished spend reached main (${formatUsd(row.main_usd)} of ${formatUsd(
        row.main_usd + row.scrap_usd
      )})`,
    },
    {
      id: 'first-pass',
      label: 'First pass',
      value: formatRate(row.first_pass_rate),
      detail: `${row.first_pass} of ${merged} needed one attempt`,
    },
    {
      id: 'review-share',
      label: 'Review share',
      value: formatRate(share(row.review_usd, row.spend_usd)),
      detail: `${formatUsd(row.review_usd)} of ${formatUsd(row.spend_usd)} went to review`,
    },
    {
      id: 'waste',
      label: 'Killed runs',
      value: formatUsd(row.killed_usd),
      detail: `${formatUsd(row.estimated_usd)} of spend priced from transcripts`,
    },
  ];
}

export interface FunnelSegment {
  key: string;
  label: string;
  usd: number;
  /** 0..1 of the bar. */
  fraction: number;
  /** Where the segment starts, 0..1. */
  offset: number;
}

function segments(parts: readonly { key: string; label: string; usd: number }[]): FunnelSegment[] {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.usd), 0);
  let offset = 0;
  return parts.map((part) => {
    const fraction = total > 0 ? Math.max(0, part.usd) / total : 0;
    const segment = { ...part, fraction, offset };
    offset += fraction;
    return segment;
  });
}

/** Where the spend ended up: main, still moving, thrown away. */
export function outcomeSegments(row: YieldRow): FunnelSegment[] {
  return segments([
    { key: 'main', label: 'Reached main', usd: row.main_usd },
    { key: 'pending', label: 'Still pending', usd: row.pending_usd },
    { key: 'scrap', label: 'Scrapped', usd: row.scrap_usd },
  ]);
}

/** What the spend paid for: writing the change, reviewing it, triaging it. */
export function sourceSegments(row: YieldRow): FunnelSegment[] {
  return segments([
    { key: 'author', label: 'Author', usd: row.author_usd },
    { key: 'review', label: 'Review', usd: row.review_usd },
    { key: 'triage', label: 'Triage', usd: row.triage_usd },
  ]);
}

/** The one sentence above the funnel. */
export function spendSummary(row: YieldRow, days: number): string {
  return `${formatUsd(row.spend_usd)} spent on ${plural(row.todos, 'todo')} over ${plural(
    row.attempts,
    'attempt'
  )} in the last ${days} days; ${plural(row.merged, 'change')} reached main.`;
}

/** How a group reads in the table: weeks say which week. */
export function groupLabel(by: YieldBy, group: string): string {
  return by === 'week' ? `Week of ${group}` : group;
}

export interface TrendPoint {
  week: string;
  usdPerMerged: number | null;
  merged: number;
  mainUsd: number;
}

export interface TrendSeries {
  group: string;
  points: TrendPoint[];
}

export interface TrendData {
  weeks: string[];
  series: TrendSeries[];
  /** Groups left off the chart to keep it readable. */
  omitted: number;
}

/**
 * The weekly rows turned into one line per group, every line over the same
 * weeks. Groups keep the order of `order` (the table's, spend first); only the
 * first few get a line. A week a group merged nothing in has no point.
 */
export function trendData(
  weekly: readonly YieldWeek[],
  order: readonly string[],
  max = TREND_SERIES_MAX
): TrendData {
  const weeks = [...new Set(weekly.map((row) => row.week))].sort();
  const seen = [...new Set(weekly.map((row) => row.group))];
  const ranked = [
    ...order.filter((group) => seen.includes(group)),
    ...seen.filter((group) => !order.includes(group)).sort(),
  ];
  const shown = ranked.slice(0, max);
  const series = shown.map((group) => ({
    group,
    points: weeks.map((week) => {
      const row = weekly.find((candidate) => candidate.group === group && candidate.week === week);
      return {
        week,
        usdPerMerged: row && row.merged > 0 ? row.usd_per_merged : null,
        merged: row?.merged ?? 0,
        mainUsd: row?.main_usd ?? 0,
      };
    }),
  }));
  return { weeks, series, omitted: ranked.length - shown.length };
}

/** A tick value above `max` that reads well: 1, 2 or 5 times a power of ten. */
export function niceCeiling(max: number): number {
  if (!(max > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) {
    if (step * power >= max) return step * power;
  }
  return 10 * power;
}

export interface TrendDot {
  x: number;
  y: number;
  title: string;
}

export interface TrendLine {
  group: string;
  /** SVG path; a week with no point breaks the line. */
  path: string;
  dots: TrendDot[];
}

export interface TrendGeometry {
  max: number;
  lines: TrendLine[];
  /** Where each week sits along the plot. */
  ticks: { week: string; x: number }[];
}

/** Positions for the trend chart, in a `width` × `height` plot. */
export function trendGeometry(data: TrendData, width: number, height: number): TrendGeometry {
  const values = data.series.flatMap((series) =>
    series.points.flatMap((point) => (point.usdPerMerged === null ? [] : [point.usdPerMerged]))
  );
  const max = niceCeiling(Math.max(0, ...values));
  const count = data.weeks.length;
  const xOf = (index: number): number => (count <= 1 ? width / 2 : (index / (count - 1)) * width);
  const yOf = (value: number): number => height - (value / max) * height;
  const lines = data.series.map((series) => {
    let path = '';
    let pen = false;
    const dots: TrendDot[] = [];
    series.points.forEach((point, index) => {
      if (point.usdPerMerged === null) {
        pen = false;
        return;
      }
      const x = xOf(index);
      const y = yOf(point.usdPerMerged);
      path += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
      pen = true;
      dots.push({
        x,
        y,
        title: `${series.group}, week of ${point.week}: ${formatUsd(point.usdPerMerged)} per merged change (${point.merged} merged, ${formatUsd(
          point.mainUsd
        )} reached main)`,
      });
    });
    return { group: series.group, path: path.trim(), dots };
  });
  return { max, lines, ticks: data.weeks.map((week, index) => ({ week, x: xOf(index) })) };
}

/** What the trend chart says to a screen reader. */
export function trendSummary(data: TrendData): string {
  if (data.weeks.length === 0) return 'Cost per merged change by week: no weeks in this window.';
  const latest = data.series
    .map((series) => {
      const last = [...series.points].reverse().find((point) => point.usdPerMerged !== null);
      return last ? `${series.group} ${formatUsd(last.usdPerMerged)} in the week of ${last.week}` : null;
    })
    .filter((text): text is string => text !== null);
  return `Cost per merged change by week, ${data.weeks[0]} to ${data.weeks[data.weeks.length - 1]}${
    latest.length > 0 ? `: latest ${latest.join('; ')}` : ''
  }.`;
}

/** `codex · model-b`, the way an arm is named in the table. */
export function armLabel(arm: Pick<YieldArm, 'agent' | 'model'>): string {
  return `${arm.agent} · ${arm.model}`;
}

/** The arm's draw probability in whole percent, or `—`. */
export function armShare(arm: Pick<YieldArm, 'arm_p'>): string {
  return formatRate(arm.arm_p);
}

/** The line under a todo's title in the costliest and scrap lists. */
export function todoRefMeta(ref: YieldTodoRef): string {
  const by = [ref.agent, ref.model].filter((part): part is string => Boolean(part)).join(' · ');
  return [ref.family, plural(ref.attempts, 'attempt'), by]
    .filter((part) => part !== '')
    .join(' · ');
}

/** Where a costly todo stands, in the Work page's words. The colours are this list's
 * own, not `statusTone`'s (used only for anything not named here): a blocked or
 * handed-off todo is red, because its spend is not lost yet and a person can still save it.
 * Work still in play (open, claimed, landed but in review) is amber; merged is green;
 * anything else (closed) is neutral. */
export function todoRefStatus(ref: YieldTodoRef): { label: string; tone: Tone; hint: string } {
  if (ref.merged) return { label: 'merged', tone: 'ok', hint: 'Reached main.' };
  const tone = statusTone(ref.status);
  if (ref.status === 'blocked' || ref.status === 'handoff') {
    return {
      label: ref.status,
      tone: 'human',
      hint: 'Waiting on a person: open it to unblock it, and the spend can still reach main.',
    };
  }
  if (ref.status === 'done') {
    return { label: 'in review', tone: 'warn', hint: 'Landed on a shift; not on main yet.' };
  }
  if (ref.status === 'open' || ref.status === 'claimed') {
    return { label: ref.status, tone: 'warn', hint: 'Still in the queue: a worker can pick it up again.' };
  }
  return { label: ref.status, tone, hint: '' };
}

/** The footnote naming where the prices came from. */
export function priceSourcesNote(sources: readonly string[]): string {
  if (sources.length === 0) {
    return 'Costs are what each run reported; no usage record named a price source in this window.';
  }
  return `Token prices: ${sources.join(', ')}. Runs stopped before they reported are priced from their transcripts.`;
}
