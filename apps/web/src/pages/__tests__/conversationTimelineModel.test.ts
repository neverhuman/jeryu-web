import { describe, expect, it } from 'vitest';

import type { PipelineEvent, PullRequestReview, ReviewThread } from '../../api/types';
import { localDayKey } from '../../format/when';
import { buildTimeline, pairRuns, type TimelineEntry } from '../conversationTimelineModel';
import type { PullCommit } from '../pullCommitsModel';

// Shaped like a real pull request that sat for days: one head, a gate that
// failed again and again, and one red-team review that ran while a gate did.
// Every name is invented.

const SHA = 'abc1234def5678';
let seq = 0;

function event(kind: string, ts: string, fields: Partial<PipelineEvent> = {}): PipelineEvent {
  seq += 1;
  return {
    seq,
    ts,
    source: 'pr-gate',
    kind,
    reporter: 'gatebot',
    actor: 'build-1/slot0',
    family: null,
    repo: 'acme/widget',
    pr: 7,
    sha: SHA,
    todo_id: null,
    shift: null,
    outcome: null,
    needs_human: false,
    summary: kind,
    reason: null,
    cost_usd: null,
    seconds: null,
    log_tail: null,
    log_url: null,
    detail: null,
    ...fields,
  };
}

function gateRun(start: string, end: string, outcome = 'failure', actor = 'build-1/slot0'): PipelineEvent[] {
  return [
    event('gate.started', start, { actor }),
    event('gate.finished', end, { actor, outcome, seconds: 300 }),
  ];
}

const commit: PullCommit = {
  sha: SHA,
  commit: { message: 'Add the thing\n\nbody', author: { name: 'dana', date: '2026-10-21T14:00:00Z' } },
};

const review: PullRequestReview = {
  id: 'r1',
  author: 'redteam-bot',
  state: 'CHANGES_REQUESTED',
  body_markdown: 'Hold.',
  submitted_at: '2026-10-22T02:19:11Z',
  head_sha: SHA,
  dismissed_review_id: null,
  effective: true,
  stale: false,
};

const NOW = Date.parse('2026-10-26T16:00:00Z');

function kinds(entries: TimelineEntry[]): string[] {
  return entries.filter((entry) => entry.kind !== 'day').map((entry) =>
    entry.kind === 'run' ? `run:${entry.part}` : entry.kind === 'runs' ? `runs:${entry.runs.length}` : entry.kind
  );
}

function build(events: PipelineEvent[], extra: { threads?: ReviewThread[]; reviews?: PullRequestReview[] } = {}) {
  return buildTimeline({
    author: 'dana',
    description: 'What it does.',
    headSha: SHA,
    commits: [commit],
    reviews: extra.reviews ?? [review],
    threads: extra.threads ?? [],
    events,
    nowMs: NOW,
    dayLabel: (at) => new Date(at).toISOString().slice(0, 10),
  });
}

describe('pairRuns', () => {
  it('gives each start the earliest finish no earlier start took', () => {
    const events = [
      ...gateRun('2026-10-21T22:13:00Z', '2026-10-21T22:19:00Z'),
      ...gateRun('2026-10-22T03:11:00Z', '2026-10-22T03:17:00Z'),
    ];
    const { runs } = pairRuns(events, NOW);
    expect(runs).toHaveLength(2);
    expect(runs[0].finish?.ts).toBe('2026-10-21T22:19:00Z');
    expect(runs[1].finish?.ts).toBe('2026-10-22T03:17:00Z');
  });

  it('reads a second start from the same runner before any finish as the same run', () => {
    const events = [
      event('gate.started', '2026-10-26T15:35:27Z', { actor: 'build-1/slot5' }),
      event('gate.started', '2026-10-26T15:36:19Z', { actor: 'build-1/slot5' }),
      event('gate.finished', '2026-10-26T15:42:51Z', { actor: 'build-1/slot5', outcome: 'failure' }),
    ];
    const { runs } = pairRuns(events, NOW);
    expect(runs).toHaveLength(1);
    expect(runs[0].restarts).toBe(1);
    expect(runs[0].state).toBe('finished');
  });

  it('keeps a young start running and calls an old one lost', () => {
    const { runs } = pairRuns(
      [
        event('gate.started', '2026-10-26T15:58:00Z'),
        event('review.started', '2026-10-20T01:00:00Z', { actor: 'redteam-3' }),
      ],
      NOW
    );
    expect(runs.map((run) => run.state)).toEqual(['running', 'lost']);
  });
});

describe('buildTimeline', () => {
  it('opens with the description, then the push, oldest first', () => {
    const timeline = build([]);
    expect(kinds(timeline.entries)).toEqual(['opened', 'commit', 'review']);
    const commitEntry = timeline.entries.find((entry) => entry.kind === 'commit');
    expect(commitEntry).toMatchObject({ subject: 'Add the thing', current: true });
  });

  it('folds identical runs on one head, back to back, into one line', () => {
    const timeline = build(
      [
        ...gateRun('2026-10-26T03:11:00Z', '2026-10-26T03:17:00Z'),
        ...gateRun('2026-10-26T05:12:00Z', '2026-10-26T05:18:00Z'),
        ...gateRun('2026-10-26T08:25:00Z', '2026-10-26T08:31:00Z'),
      ],
      { reviews: [] }
    );
    expect(kinds(timeline.entries)).toEqual(['opened', 'commit', 'runs:3']);
  });

  it('never folds a different result into the run of failures', () => {
    const timeline = build(
      [
        ...gateRun('2026-10-26T03:11:00Z', '2026-10-26T03:17:00Z'),
        ...gateRun('2026-10-26T05:12:00Z', '2026-10-26T05:18:00Z'),
        ...gateRun('2026-10-26T08:25:00Z', '2026-10-26T08:31:00Z', 'success'),
      ],
      { reviews: [] }
    );
    expect(kinds(timeline.entries)).toEqual(['opened', 'commit', 'runs:2', 'run:whole']);
  });

  it('splits a run that overlapped a review into a start and an end joined by a lane', () => {
    const timeline = build([
      event('gate.started', '2026-10-22T02:12:19Z', { actor: 'build-1/slot1' }),
      event('review.started', '2026-10-22T02:14:30Z', { actor: 'redteam-3', source: 'pr-redteam' }),
      event('gate.finished', '2026-10-22T02:18:50Z', { actor: 'build-1/slot1', outcome: 'failure' }),
      event('review.finished', '2026-10-22T02:19:10Z', { actor: 'redteam-3', outcome: 'hold' }),
    ]);
    expect(kinds(timeline.entries)).toEqual([
      'opened',
      'commit',
      'run:start',
      'run:start',
      'run:end',
      'run:end',
      'review',
    ]);
    expect(timeline.laneCount).toBe(2);
    const marks = timeline.entries.filter((entry) => entry.kind === 'run').map((entry) => entry.lanes.join(','));
    expect(marks).toEqual(['start,none', 'through,start', 'end,through', 'none,end']);
  });

  it('leaves a running run open to the bottom of the list', () => {
    const timeline = build(
      [
        event('gate.started', '2026-10-26T15:50:00Z'),
        event('queue.building', '2026-10-26T15:55:00Z', { summary: 'gating the replay' }),
      ],
      { reviews: [] }
    );
    expect(timeline.running).toBe(true);
    const last = timeline.entries[timeline.entries.length - 1];
    expect(last.kind).toBe('event');
    expect(last.lanes).toEqual(['open']);
  });

  it('marks a new day so a bare clock is never ambiguous', () => {
    // The test zone is pinned, so the days are counted in it rather than in UTC.
    const timeline = build(gateRun('2026-10-26T03:11:00Z', '2026-10-26T03:17:00Z'));
    const placed = timeline.entries.filter((entry) => entry.kind !== 'day');
    const distinct = new Set(placed.map((entry) => localDayKey(entry.at)));
    const days = timeline.entries.filter((entry) => entry.kind === 'day');
    expect(days).toHaveLength(distinct.size);
    expect(days.length).toBeGreaterThanOrEqual(2);
    expect(timeline.entries[0].kind).toBe('day');
  });

  it('runs the days forward, each once, when the pull request was opened the day after its commit', () => {
    // Pushed one evening, opened the next morning, gated that afternoon.
    const timeline = buildTimeline({
      author: 'dana',
      description: null,
      headSha: SHA,
      commits: [
        {
          sha: SHA,
          commit: { message: 'Add the thing', author: { name: 'dana', date: '2026-10-20T12:00:00Z' } },
        },
      ],
      reviews: [],
      threads: [],
      events: [
        event('pr.opened', '2026-10-22T12:00:00Z'),
        ...gateRun('2026-10-22T14:00:00Z', '2026-10-22T14:06:00Z'),
      ],
      nowMs: NOW,
      dayLabel: (at) => new Date(at).toISOString().slice(0, 10),
    });
    expect(kinds(timeline.entries)).toEqual(['opened', 'commit', 'run:whole']);
    const days = timeline.entries.filter((entry) => entry.kind === 'day').map((entry) => entry.at);
    const keys = days.map((at) => localDayKey(at));
    expect(new Set(keys).size).toBe(keys.length);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
    const placed = timeline.entries.filter((entry) => entry.kind !== 'day').map((entry) => entry.at);
    expect([...placed].sort((a, b) => a - b)).toEqual(placed);
  });

  it('places a commit at its author date, as the Commits tab does, and an undated one at the opening', () => {
    const timeline = buildTimeline({
      author: 'dana',
      description: null,
      headSha: SHA,
      commits: [
        {
          sha: 'aaa1111',
          commit: {
            message: 'Rebased',
            author: { name: 'dana', date: '2026-10-21T09:00:00Z' },
            committer: { name: 'dana', date: '2026-10-25T09:00:00Z' },
          },
        },
        { sha: SHA, commit: { message: 'No date' } },
      ],
      reviews: [],
      threads: [],
      events: [],
      nowMs: NOW,
    });
    const placed = timeline.entries.filter((entry) => entry.kind !== 'day');
    expect(placed[0]).toMatchObject({ kind: 'opened', at: Date.parse('2026-10-21T09:00:00Z') });
    expect(placed.map((entry) => entry.at).every((at) => at >= Date.parse('2026-10-21T09:00:00Z'))).toBe(true);
  });

  it('anchors #pr-threads on the oldest unresolved thread', () => {
    const thread = (id: string, created: string, resolved: boolean): ReviewThread =>
      ({ id, resolved, created_at: created, updated_at: created, comments: [] }) as unknown as ReviewThread;
    const timeline = build([], {
      reviews: [],
      threads: [
        thread('t1', '2026-10-22T01:00:00Z', true),
        thread('t2', '2026-10-22T02:00:00Z', false),
        thread('t3', '2026-10-22T03:00:00Z', false),
      ],
    });
    const anchored = timeline.entries.filter((entry) => entry.kind === 'thread' && entry.firstUnresolved);
    expect(anchored).toHaveLength(1);
    expect(anchored[0].kind === 'thread' && anchored[0].thread.id).toBe('t2');
  });
});
