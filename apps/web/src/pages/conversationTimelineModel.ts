// conversationTimelineModel.ts — one pull request as one story, oldest first.
//
// The Conversation tab used to be five lists one under the other: the
// description, the reviews (newest first), the merge box, the threads, and the
// pipeline's events (newest first, at the bottom). What happened in what order
// could only be pieced together by reading all five. This model merges them
// into one list in the order things happened:
//
//   * the description, as the opening entry;
//   * the commits, each a divider: everything under one happened on that head;
//   * the reviews, at the moment each was submitted;
//   * the threads, at the moment each was opened;
//   * the pipeline's runs (a gate, a red-team review, a queue entry) as spans:
//     a start and its finish are one run, not two rows;
//   * every other pipeline event, as one line where it happened.
//
// A run lands where it finished, because its result is what the reader reacts
// to: a comment written while a gate ran sits above the gate's verdict, never
// under it. When nothing else happened while the run went, it is one line.
// When something did, the run is a start line and an end line, and a lane in
// the gutter joins them past whatever sits between; a run still going keeps
// its lane open to the bottom of the list.
//
// Runs that repeat the same thing on the same head, back to back, fold into
// one line: "Gate failed 6× on 8f153ab". Only identical outcomes fold, so a
// new kind of result is never hidden inside a fold of old ones.

import type { PipelineEvent, PullRequestReview, ReviewThread } from '../api/types';
import { dateText, instantOf, isSameLocalDay } from '../format/when';
import { eventTone, foldEchoes } from './activity/activityModel';
import { RUNNING_STALE_MS, finishes } from './activity/runningModel';
import { commitDate, type PullCommit } from './pullCommitsModel';

/** The kinds of work the timeline draws as a span, and what closes each. */
const RUN_FINISH_KINDS: Record<string, readonly string[]> = {
  'gate.started': ['gate.finished', 'gate.log'],
  'review.started': ['review.finished', 'pr.review'],
  'queue.enqueued': ['queue.landed', 'queue.failed', 'queue.dequeued', 'queue.refused'],
};

export type RunFamily = 'gate' | 'review' | 'queue';

const FAMILY_OF: Record<string, RunFamily> = {
  'gate.started': 'gate',
  'review.started': 'review',
  'queue.enqueued': 'queue',
};

/** At most this many gutter lanes; a run past them is drawn without one. */
export const MAX_LANES = 3;

/** One piece of pipeline work: its start, and its finish once there is one. */
export interface TimelineRun {
  family: RunFamily;
  start: PipelineEvent;
  /** The start lines the same runner sent again before any finish. */
  restarts: number;
  finish: PipelineEvent | null;
  /**
   * `running`: no finish yet and young enough to believe; `lost`: no finish
   * and too old for the reporter to still be alive; `finished` otherwise.
   */
  state: 'running' | 'finished' | 'lost';
}

export type LaneMark = 'none' | 'through' | 'start' | 'end' | 'open';

interface EntryBase {
  key: string;
  /** Epoch milliseconds the entry is placed at. */
  at: number;
  /** One mark per gutter lane: what the lane does on this row. */
  lanes: LaneMark[];
}

export type TimelineEntry = EntryBase &
  (
    | { kind: 'opened'; author: string; description: string | null }
    | {
        kind: 'commit';
        sha: string;
        subject: string;
        author: string | null;
        /** Commits folded into this divider: they arrived together. */
        count: number;
        current: boolean;
      }
    | { kind: 'review'; review: PullRequestReview }
    | { kind: 'thread'; thread: ReviewThread; firstUnresolved: boolean }
    | { kind: 'run'; run: TimelineRun; part: 'whole' | 'start' | 'end' }
    | { kind: 'runs'; runs: TimelineRun[] }
    | { kind: 'event'; event: PipelineEvent }
    | { kind: 'day'; label: string }
  );

export interface TimelineInput {
  author: string;
  description: string | null;
  headSha: string;
  commits: readonly PullCommit[];
  reviews: readonly PullRequestReview[];
  threads: readonly ReviewThread[];
  events: readonly PipelineEvent[];
  nowMs: number;
  /** How a day divider names its day; injected so tests need no locale. */
  dayLabel?: (atMs: number) => string;
}

export interface Timeline {
  entries: TimelineEntry[];
  /** How many gutter lanes any row uses. */
  laneCount: number;
  /** Whether any run is still going: the view ticks its clock while one is. */
  running: boolean;
}

function finishedBy(start: PipelineEvent, later: PipelineEvent): boolean {
  if (start.kind === 'queue.enqueued') {
    if (later.seq <= start.seq) return false;
    if (!RUN_FINISH_KINDS['queue.enqueued'].includes(later.kind)) return false;
    return start.repo !== null && start.repo === later.repo && start.pr !== null && start.pr === later.pr;
  }
  return finishes(start, later);
}

function sameRunner(a: PipelineEvent, b: PipelineEvent): boolean {
  return a.kind === b.kind && a.sha === b.sha && a.actor === b.actor;
}

/**
 * Pairs every start with the earliest finish after it that no earlier start
 * took. Matching by repo and sha alone, as the Activity feed does, would give
 * all nine gate runs on one head the first finish. A second start from the same
 * runner before any finish (a slot that claims the job, then starts it) is the
 * same run said twice, not a run that never ended.
 */
export function pairRuns(events: readonly PipelineEvent[], nowMs: number): {
  runs: TimelineRun[];
  consumed: Set<number>;
} {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const taken = new Set<number>();
  const consumed = new Set<number>();
  const runs: TimelineRun[] = [];
  const open: TimelineRun[] = [];

  for (const event of ordered) {
    const family = FAMILY_OF[event.kind];
    if (family) {
      const again = open.find((run) => sameRunner(run.start, event));
      consumed.add(event.seq);
      if (again) {
        again.restarts += 1;
        continue;
      }
      const run: TimelineRun = { family, start: event, restarts: 0, finish: null, state: 'running' };
      runs.push(run);
      open.push(run);
      continue;
    }
    const closes = open.find((run) => !taken.has(event.seq) && finishedBy(run.start, event));
    if (!closes) continue;
    closes.finish = event;
    closes.state = 'finished';
    taken.add(event.seq);
    consumed.add(event.seq);
    open.splice(open.indexOf(closes), 1);
  }

  for (const run of open) {
    const started = instantOf(run.start.ts) ?? nowMs;
    if (nowMs - started > RUNNING_STALE_MS) run.state = 'lost';
  }
  return { runs, consumed };
}

/** The run's outcome as one word the fold compares on. */
export function runOutcome(run: TimelineRun): string {
  if (run.state !== 'finished' || !run.finish) return run.state;
  return eventTone(run.finish);
}

function at(value: string | null | undefined, fallback: number): number {
  return instantOf(value) ?? fallback;
}

const ORDER: Record<TimelineEntry['kind'], number> = {
  opened: 0,
  day: 1,
  commit: 2,
  run: 3,
  runs: 3,
  event: 4,
  thread: 5,
  review: 6,
};

type Draft = TimelineEntry extends infer E ? (E extends unknown ? Omit<E, 'lanes'> : never) : never;

/** Stable time order; a tie keeps the kinds in the order a reader expects. */
function byTime(a: Draft, b: Draft): number {
  if (a.kind === 'opened') return -1;
  if (b.kind === 'opened') return 1;
  return a.at - b.at || ORDER[a.kind] - ORDER[b.kind];
}

export function buildTimeline(input: TimelineInput): Timeline {
  const { nowMs } = input;
  const events = foldEchoes([...input.events]);
  const { runs, consumed } = pairRuns(events, nowMs);

  const drafts: Draft[] = [];

  // The commits, oldest first, at the date the Commits tab groups them by; a run
  // of them with nothing between is one divider.
  const dated = input.commits.map((commit) => ({ commit, at: instantOf(commitDate(commit)) }));
  const known = dated.flatMap((entry) => (entry.at === null ? [] : [entry.at]));
  const opened = events.find((event) => event.kind === 'pr.opened');
  // The story opens no later than its first commit: a pull request opened the
  // morning after its commits were pushed still reads forward, day by day.
  const openedAt = Math.min(opened ? at(opened.ts, nowMs) : nowMs, ...known);
  // A commit with no readable date sits with the opening, never in 1970.
  const commits = dated
    .map((entry) => ({ commit: entry.commit, at: entry.at ?? openedAt }))
    .sort((a, b) => a.at - b.at);
  drafts.push({
    kind: 'opened',
    key: 'opened',
    at: openedAt,
    author: input.author,
    description: input.description,
  });
  for (const { commit, at: when } of commits) {
    drafts.push({
      kind: 'commit',
      key: `commit-${commit.sha}`,
      at: when,
      sha: commit.sha,
      subject: commit.commit.message.split('\n')[0] ?? '',
      author: commit.commit.author?.name ?? null,
      count: 1,
      current: commit.sha === input.headSha,
    });
  }
  for (const review of input.reviews) {
    drafts.push({ kind: 'review', key: `review-${review.id}`, at: at(review.submitted_at, nowMs), review });
  }
  const firstUnresolved = [...input.threads]
    .filter((thread) => !thread.resolved)
    .sort((a, b) => at(a.created_at, 0) - at(b.created_at, 0))[0];
  for (const thread of input.threads) {
    drafts.push({
      kind: 'thread',
      key: `thread-${thread.id}`,
      at: at(thread.created_at, nowMs),
      thread,
      firstUnresolved: thread === firstUnresolved,
    });
  }
  for (const event of events) {
    if (consumed.has(event.seq) || event.kind === 'pr.opened') continue;
    drafts.push({ kind: 'event', key: `event-${event.seq}`, at: at(event.ts, nowMs), event });
  }

  // Where each run lands: one line when nothing else happened while it went,
  // a start and an end line joined by a lane when something did.
  const others = [...drafts].sort(byTime);
  for (const run of runs) {
    const startAt = at(run.start.ts, nowMs);
    const key = `run-${run.start.seq}`;
    if (!run.finish) {
      drafts.push({ kind: 'run', key, at: startAt, run, part: run.state === 'running' ? 'start' : 'whole' });
      continue;
    }
    const endAt = at(run.finish.ts, startAt);
    const between = others.some((entry) => entry.kind !== 'opened' && entry.at > startAt && entry.at < endAt);
    // Another run that went at the same time, however the two began and ended.
    const overlapping = runs.some((other) => {
      if (other === run) return false;
      const otherStart = at(other.start.ts, nowMs);
      const otherEnd = other.finish ? at(other.finish.ts, otherStart) : nowMs;
      return otherStart < endAt && otherEnd > startAt;
    });
    if (between || overlapping) {
      drafts.push({ kind: 'run', key: `${key}-start`, at: startAt, run, part: 'start' });
      drafts.push({ kind: 'run', key: `${key}-end`, at: endAt, run, part: 'end' });
    } else {
      drafts.push({ kind: 'run', key, at: endAt, run, part: 'whole' });
    }
  }

  const sorted = foldRuns(foldCommits(drafts.sort(byTime)));
  const withDays = insertDays(sorted, input.dayLabel ?? dateText);
  const { entries, laneCount } = assignLanes(withDays);
  return {
    entries,
    laneCount,
    running: runs.some((run) => run.state === 'running'),
  };
}

/** Commits back to back, with nothing between them, arrived as one push. */
function foldCommits(drafts: Draft[]): Draft[] {
  const out: Draft[] = [];
  for (const draft of drafts) {
    const previous = out[out.length - 1];
    if (draft.kind === 'commit' && previous?.kind === 'commit') {
      out[out.length - 1] = {
        ...draft,
        count: previous.count + 1,
        current: draft.current || previous.current,
      };
      continue;
    }
    out.push(draft);
  }
  return out;
}

function foldKey(draft: Draft): string | null {
  if (draft.kind !== 'run' || draft.part !== 'whole' || draft.run.state !== 'finished') return null;
  return `${draft.run.family}|${draft.run.start.sha ?? ''}|${runOutcome(draft.run)}`;
}

/** Identical finished runs on one head, back to back, fold into one line. */
function foldRuns(drafts: Draft[]): Draft[] {
  const out: Draft[] = [];
  let group: Array<Extract<Draft, { kind: 'run' }>> = [];
  const flush = (): void => {
    if (group.length === 1) out.push(group[0]);
    if (group.length > 1) {
      const last = group[group.length - 1];
      out.push({
        kind: 'runs',
        key: `runs-${group[0].run.start.seq}`,
        at: last.at,
        runs: group.map((entry) => entry.run),
      });
    }
    group = [];
  };
  for (const draft of drafts) {
    const key = foldKey(draft);
    if (key !== null && draft.kind === 'run' && (group.length === 0 || foldKey(group[0]) === key)) {
      group.push(draft);
      continue;
    }
    flush();
    if (key !== null && draft.kind === 'run') {
      group.push(draft);
      continue;
    }
    out.push(draft);
  }
  flush();
  return out;
}

/**
 * A day line wherever a later local day begins, so a bare clock is never
 * ambiguous. The days only move forward: an entry stamped earlier than the
 * day already shown stays under it rather than naming an older day again.
 */
function insertDays(drafts: Draft[], label: (atMs: number) => string): Draft[] {
  const out: Draft[] = [];
  let day: number | null = null;
  for (const draft of drafts) {
    if (day === null || (draft.at > day && !isSameLocalDay(day, draft.at))) {
      out.push({ kind: 'day', key: `day-${draft.at}`, at: draft.at, label: label(draft.at) });
      day = draft.at;
    }
    out.push(draft);
  }
  return out;
}

/**
 * Gives every split run a gutter lane from its start line to its end line (or
 * to the bottom, while it runs), lowest free lane first.
 */
function assignLanes(drafts: Draft[]): { entries: TimelineEntry[]; laneCount: number } {
  const laneOf = new Map<TimelineRun, number>();
  const busy: Array<TimelineRun | null> = [];
  const entries: TimelineEntry[] = [];
  let laneCount = 0;

  for (const draft of drafts) {
    const marks: LaneMark[] = busy.map((run) => (run ? 'through' : 'none'));
    if (draft.kind === 'run' && draft.part === 'start') {
      let lane = busy.indexOf(null);
      if (lane === -1) lane = busy.length;
      if (lane < MAX_LANES) {
        busy[lane] = draft.run;
        laneOf.set(draft.run, lane);
        marks[lane] = 'start';
        laneCount = Math.max(laneCount, lane + 1);
      }
    }
    if (draft.kind === 'run' && draft.part === 'end') {
      const lane = laneOf.get(draft.run);
      if (lane !== undefined) {
        busy[lane] = null;
        marks[lane] = 'end';
      }
    }
    entries.push({ ...draft, lanes: marks } as TimelineEntry);
  }

  // A lane still busy at the bottom belongs to a run that is going: it stays open.
  const last = entries[entries.length - 1];
  if (last) last.lanes = last.lanes.map((mark, lane) => (busy[lane] && mark === 'through' ? 'open' : mark));
  for (const entry of entries) {
    while (entry.lanes.length < laneCount) entry.lanes.push('none');
    entry.lanes.length = laneCount;
  }
  return { entries, laneCount };
}
