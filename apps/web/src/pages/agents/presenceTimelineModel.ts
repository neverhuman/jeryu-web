// presenceTimelineModel.ts — where an agent's working time falls in a time range.
//
// Pure. Each presence row becomes one bar in a shared range (24 hours by
// default): it starts when the agent was first seen and its solid part runs to
// its last activity. A live, active agent runs on to now; an idle one trails a
// faint tail to now; an ended one stops with a cap. The Active agents page
// draws the bars and a shared axis so a reader can see at a glance who was
// working when.

import type { AgentPresenceItem } from '../../api/agentPresence';
import { absoluteText, relativeText, tickText } from '../../format/when';

export type TimelineSpan = '6h' | '24h' | '7d';

export const TIMELINE_SPANS: readonly TimelineSpan[] = ['6h', '24h', '7d'];
export const DEFAULT_SPAN: TimelineSpan = '24h';

const HOUR = 3_600_000;
const SPAN_HOURS: Record<TimelineSpan, number> = { '6h': 6, '24h': 24, '7d': 168 };
/** Axis tick spacing in hours per span. */
const TICK_HOURS: Record<TimelineSpan, number> = { '6h': 1, '24h': 3, '7d': 24 };

export const SPAN_LABEL: Record<TimelineSpan, string> = { '6h': 'Last 6 hours', '24h': 'Last 24 hours', '7d': 'Last 7 days' };
/** Where a strip's left edge sits, for a strip drawn without the shared axis. */
export const SPAN_AGO: Record<TimelineSpan, string> = { '6h': '6 h ago', '24h': '24 h ago', '7d': '7 days ago' };

export function spanOf(value: string | null | undefined): TimelineSpan {
  return TIMELINE_SPANS.find((span) => span === value) ?? DEFAULT_SPAN;
}

export interface TimelineWindow {
  start: number;
  end: number;
  span: TimelineSpan;
}

export function timelineWindow(span: TimelineSpan, now: number): TimelineWindow {
  return { start: now - SPAN_HOURS[span] * HOUR, end: now, span };
}

export interface TimelineTick {
  at: number;
  /** 0–1 across the range. */
  offset: number;
  label: string;
}

/** Ticks on whole local hours (whole local days for a week), oldest first. */
export function timelineTicks(range: TimelineWindow): TimelineTick[] {
  const step = TICK_HOURS[range.span] * HOUR;
  const zoneShift = new Date(range.start).getTimezoneOffset() * 60_000;
  const first = Math.ceil((range.start - zoneShift) / step) * step + zoneShift;
  const ticks: TimelineTick[] = [];
  for (let at = first; at < range.end; at += step) {
    ticks.push({ at, offset: (at - range.start) / (range.end - range.start), label: tickText(at, SPAN_HOURS[range.span]) });
  }
  return ticks;
}

export type TimelineTail = 'running' | 'idle' | 'none';

export interface TimelineBar {
  /** 0–1 across the range: where the bar starts. */
  left: number;
  /** 0–1: the solid, working part. */
  width: number;
  /** 0–1: the faint idle part after the last activity, up to now. */
  tailWidth: number;
  tail: TimelineTail;
  /** The agent was first seen before the range opened. */
  clippedStart: boolean;
  ended: boolean;
  /** One sentence for hover and screen readers. */
  summary: string;
}

/**
 * The bar for one presence row, or null when the row has no times or all of
 * its time lies before the range.
 */
export function timelineBar(
  item: Pick<AgentPresenceItem, 'state' | 'started_at' | 'last_active_at'>,
  range: TimelineWindow,
  now: number,
): TimelineBar | null {
  const first = item.started_at ?? item.last_active_at;
  if (first === null) return null;
  const last = Math.max(first, item.last_active_at ?? first);
  const end = Math.max(last, Math.min(now, range.end));
  const live = item.state === 'active' || item.state === 'idle';
  const workEnd = item.state === 'active' ? end : last;
  const tailEnd = item.state === 'idle' ? end : workEnd;
  if (tailEnd < range.start || first > range.end) return null;

  const span = range.end - range.start;
  const at = (ms: number): number => Math.min(1, Math.max(0, (ms - range.start) / span));
  const left = at(first);
  const width = Math.max(0, at(workEnd) - left);
  const tailWidth = Math.max(0, at(tailEnd) - at(workEnd));
  return {
    left,
    width,
    tailWidth,
    tail: item.state === 'active' ? 'running' : item.state === 'idle' ? 'idle' : 'none',
    clippedStart: first < range.start,
    ended: item.state === 'ended',
    summary: barSummary(item.state, first, last, now, live),
  };
}

function barSummary(state: AgentPresenceItem['state'], first: number, last: number, now: number, live: boolean): string {
  const seen = `First seen ${absoluteText(first)}`;
  if (state === 'active') return `${seen}; working now.`;
  if (state === 'ended') return `${seen}; finished ${absoluteText(last)}.`;
  const lastText = `last active ${relativeText(last, now)}`;
  return live ? `${seen}; ${lastText}, idle since.` : `${seen}; ${lastText}, no longer reporting.`;
}
