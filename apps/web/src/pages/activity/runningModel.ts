// runningModel.ts — which rows are work still in flight, how long they have
// been going, and how far along they are against what their kind usually takes.
//
// A `gate.started`, `review.started` or `todo.claimed` with no finishing event
// after it is work happening right now, and the feed should say so rather than
// showing it as one more thing that happened. A gate is matched to its finish
// by repo and sha, a review by repo, pull request and sha, a todo by its id.
// When the finish lands the row settles: it has a duration of its own and
// stops being running, with nothing else to clear.
//
// The estimate the determinate bar needs is not served by the pipeline, so it
// is read off the feed itself: the median duration the same kind of work
// reached in the rows loaded here. Below two finished runs there is no median
// worth trusting and the bar stays indeterminate.

import type { PipelineEvent } from '../../api/types';

/** The kinds that open a piece of work, and the kinds that close one. */
const FINISH_KINDS: Record<string, readonly string[]> = {
  'gate.started': ['gate.finished', 'gate.log'],
  'review.started': ['review.finished', 'pr.review'],
  'todo.claimed': ['todo.attempt_finished'],
};

export const RUNNING_KINDS = Object.keys(FINISH_KINDS);

/** How often the list's shared clock ticks while a row is running, so the
 *  elapsed timers move; it falls back to its slow tick when nothing is. */
export const RUNNING_TICK_MS = 1_000;

/**
 * Past this, a start with no finish is not reported as running. A reporter
 * that dies mid-run leaves its start behind for good, and a row ticking for
 * three days says less than a plain line in the log.
 */
export const RUNNING_STALE_MS = 6 * 60 * 60 * 1000;

/** At least this many finished runs of a kind before their median is used. */
export const MEDIAN_MIN_RUNS = 2;

export function isRunningKind(kind: string): boolean {
  return kind in FINISH_KINDS;
}

/** Whether `later` is the event that closes `start`'s piece of work. */
export function finishes(start: PipelineEvent, later: PipelineEvent): boolean {
  if (later.seq <= start.seq) return false;
  if (!FINISH_KINDS[start.kind]?.includes(later.kind)) return false;
  if (start.kind === 'todo.claimed') {
    return start.todo_id !== null && start.todo_id === later.todo_id;
  }
  if (start.repo === null || start.repo !== later.repo) return false;
  if (start.sha === null || start.sha !== later.sha) return false;
  if (start.kind === 'review.started') return start.pr !== null && start.pr === later.pr;
  return true;
}

/**
 * Seqs of the starts in this list that nothing here finishes. The list is what
 * the reader has: a finish the feed has not loaded yet leaves its start
 * running, which is exactly what it was the moment before.
 */
export function unfinishedStarts(events: PipelineEvent[]): Set<number> {
  const open = new Set<number>();
  for (const event of events) {
    if (!isRunningKind(event.kind)) continue;
    if (!events.some((later) => finishes(event, later))) open.add(event.seq);
  }
  return open;
}

/** The unfinished starts young enough to still be believed, at `nowMs`. */
export function runningSeqs(events: PipelineEvent[], nowMs: number): Set<number> {
  const running = new Set<number>();
  for (const seq of unfinishedStarts(events)) {
    const event = events.find((candidate) => candidate.seq === seq);
    if (!event) continue;
    const elapsed = elapsedSeconds(event.ts, nowMs);
    if (elapsed !== null && elapsed * 1000 <= RUNNING_STALE_MS) running.add(seq);
  }
  return running;
}

/** Seconds since `ts`, never negative, or null when the stamp is unreadable. */
export function elapsedSeconds(ts: string, nowMs: number): number | null {
  const at = Date.parse(ts);
  if (Number.isNaN(at)) return null;
  return Math.max(0, (nowMs - at) / 1000);
}

export function median(values: readonly number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The median duration each start kind can expect, taken from the finished runs
 * in this list. A gate's estimate comes from the finished gates beside it, a
 * todo's from the attempts that ended.
 */
export function medianSecondsByStartKind(
  events: Array<Pick<PipelineEvent, 'kind' | 'seconds'>>
): Map<string, number> {
  const medians = new Map<string, number>();
  for (const [start, finishKinds] of Object.entries(FINISH_KINDS)) {
    const runs = events
      .filter((event) => finishKinds.includes(event.kind))
      .map((event) => event.seconds)
      .filter((seconds): seconds is number => typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0);
    if (runs.length < MEDIAN_MIN_RUNS) continue;
    const value = median(runs);
    if (value !== null && value > 0) medians.set(start, value);
  }
  return medians;
}

/** The shortest determinate bar that still reads as progress. */
export const MIN_RUNNING_SHARE = 0.04;

/**
 * How much of the bar a running row has filled, 0..1, or null when there is no
 * median to measure against and the bar must stay indeterminate. A run past
 * its median sits at the end of the bar rather than overflowing it: the bar
 * says "at least this long", and the timer beside it says how much longer.
 */
export function runningShare(
  elapsed: number | null,
  medianOfKind: number | null | undefined
): number | null {
  if (elapsed === null || !Number.isFinite(elapsed)) return null;
  if (typeof medianOfKind !== 'number' || !Number.isFinite(medianOfKind) || medianOfKind <= 0) return null;
  return Math.min(1, Math.max(MIN_RUNNING_SHARE, elapsed / medianOfKind));
}

/** `4m 12s`: the elapsed timer, in the same words as a finished duration. */
export function elapsedText(elapsed: number | null): string {
  if (elapsed === null || !Number.isFinite(elapsed)) return '';
  const whole = Math.floor(elapsed);
  if (whole < 60) return `${whole}s`;
  if (whole < 3600) return `${Math.floor(whole / 60)}m ${whole % 60}s`;
  return `${Math.floor(whole / 3600)}h ${Math.floor((whole % 3600) / 60)}m`;
}

/** What a running row says to a screen reader and on hover. */
export function runningTitle(elapsed: number | null, medianOfKind: number | null | undefined): string {
  const text = elapsedText(elapsed);
  if (typeof medianOfKind !== 'number' || !Number.isFinite(medianOfKind) || medianOfKind <= 0) {
    return `Running for ${text}`;
  }
  return `Running for ${text}, of about ${elapsedText(medianOfKind)} usually`;
}
