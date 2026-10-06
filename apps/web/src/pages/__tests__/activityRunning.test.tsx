// activityRunning.test.tsx — work in flight on the Activity feed: which starts
// count as running, the elapsed timer, the progress bar (determinate when the
// loaded rows give a median, indeterminate when they do not), and the row
// settling the moment its finishing event lands.

import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import {
  MEDIAN_MIN_RUNS,
  RUNNING_STALE_MS,
  elapsedSeconds,
  elapsedText,
  finishes,
  median,
  medianSecondsByStartKind,
  runningSeqs,
  runningShare,
  runningTitle,
  unfinishedStarts,
} from '../activity/runningModel';
import type { PipelineEvent } from '../../api/types';
import { mockPipelineApi } from './pipelinePageHelpers';
import { json, renderAt } from './shiftPageHelpers';
import { pipelineEvent } from './pipelineTestData';

const NOW = Date.parse('2026-09-19T13:10:00Z');

function gateStart(partial: Partial<PipelineEvent> = {}): PipelineEvent {
  return pipelineEvent({
    seq: 20,
    kind: 'gate.started',
    ts: '2026-09-19T13:05:48Z',
    repo: 'jeryu/jeryu-web',
    pr: 35,
    sha: 'b761244',
    summary: 'Gate started on jeryu/jeryu-web#35',
    ...partial,
  });
}

describe('finishes', () => {
  it('pairs a gate with the finish on the same repo and sha', () => {
    const start = gateStart();
    const done = pipelineEvent({
      seq: 21,
      kind: 'gate.log',
      repo: 'jeryu/jeryu-web',
      sha: 'b761244',
      outcome: 'success',
      seconds: 120,
    });
    expect(finishes(start, done)).toBe(true);
    expect(finishes(start, { ...done, sha: 'other' })).toBe(false);
    expect(finishes(start, { ...done, repo: 'jeryu/jeryu-core' })).toBe(false);
    // A finish older than the start belongs to the run before this one.
    expect(finishes(start, { ...done, seq: 2 })).toBe(false);
  });

  it('pairs a todo with the attempt that ended, by todo id', () => {
    const start = pipelineEvent({ seq: 4, kind: 'todo.claimed', todo_id: 't-1' });
    const done = pipelineEvent({ seq: 9, kind: 'todo.attempt_finished', todo_id: 't-1', outcome: 'done' });
    expect(finishes(start, done)).toBe(true);
    expect(finishes(start, { ...done, todo_id: 't-2' })).toBe(false);
  });

  it('pairs a review with the verdict on the same pull request', () => {
    const start = pipelineEvent({
      seq: 4,
      kind: 'review.started',
      repo: 'jeryu/jeryu-web',
      pr: 35,
      sha: 'b761244',
    });
    const done = pipelineEvent({
      seq: 5,
      kind: 'pr.review',
      repo: 'jeryu/jeryu-web',
      pr: 35,
      sha: 'b761244',
      outcome: 'approve',
    });
    expect(finishes(start, done)).toBe(true);
    expect(finishes(start, { ...done, pr: 36 })).toBe(false);
  });
});

describe('unfinishedStarts / runningSeqs', () => {
  const events = [
    pipelineEvent({ seq: 21, kind: 'gate.log', repo: 'r', sha: 'a', outcome: 'success', seconds: 90 }),
    gateStart({ seq: 20, repo: 'r', sha: 'a' }),
    gateStart({ seq: 19, repo: 'r', sha: 'b' }),
    pipelineEvent({ seq: 18, kind: 'pr.opened', repo: 'r' }),
  ];

  it('names only the starts nothing in the list finishes', () => {
    expect([...unfinishedStarts(events)]).toEqual([19]);
  });

  it('drops a start too old to still be believed', () => {
    const stale = [gateStart({ seq: 1, ts: '2026-09-18T00:00:00Z', repo: 'r', sha: 'c' })];
    expect(runningSeqs(stale, NOW).size).toBe(0);
    expect(runningSeqs(stale, Date.parse('2026-09-18T00:00:00Z') + RUNNING_STALE_MS).size).toBe(1);
  });
});

describe('elapsed and the median', () => {
  it('counts from the start stamp, never backwards', () => {
    expect(elapsedSeconds('2026-09-19T13:05:48Z', NOW)).toBe(252);
    expect(elapsedSeconds('2026-09-19T13:20:00Z', NOW)).toBe(0);
    expect(elapsedSeconds('not a date', NOW)).toBeNull();
  });

  it('says the elapsed time the way a duration is said', () => {
    expect(elapsedText(252)).toBe('4m 12s');
    expect(elapsedText(9)).toBe('9s');
    expect(elapsedText(3 * 3600 + 25 * 60)).toBe('3h 25m');
    expect(elapsedText(null)).toBe('');
  });

  it('takes the middle of the finished runs of each kind', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 3])).toBe(2);
    expect(median([])).toBeNull();
    const medians = medianSecondsByStartKind([
      pipelineEvent({ seq: 3, kind: 'gate.log', seconds: 100 }),
      pipelineEvent({ seq: 2, kind: 'gate.finished', seconds: 300 }),
      pipelineEvent({ seq: 1, kind: 'todo.attempt_finished', seconds: 900 }),
    ]);
    expect(medians.get('gate.started')).toBe(200);
    // One finished run is not a median worth drawing a bar from.
    expect(MEDIAN_MIN_RUNS).toBe(2);
    expect(medians.has('todo.claimed')).toBe(false);
  });

  it('fills the bar against the median and stops at its end', () => {
    expect(runningShare(100, 200)).toBe(0.5);
    expect(runningShare(400, 200)).toBe(1);
    // Nothing to measure against: the bar has to stay indeterminate.
    expect(runningShare(100, undefined)).toBeNull();
    expect(runningShare(null, 200)).toBeNull();
    // A run that has barely begun still shows a sliver.
    expect(runningShare(1, 10_000)).toBeGreaterThan(0);
  });

  it('says what it is waiting on', () => {
    expect(runningTitle(252, undefined)).toBe('Running for 4m 12s');
    expect(runningTitle(252, 600)).toBe('Running for 4m 12s, of about 10m 0s usually');
  });
});

describe('ActivityPage running rows', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: new Date(NOW) });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function mount(events: PipelineEvent[]): void {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events'
        ? json({ events, latest_seq: events[0]?.seq ?? 0 })
        : undefined
    );
    renderAt('/activity', '/activity', <ActivityPage />);
  }

  it('ticks an elapsed timer and an indeterminate bar on an unfinished gate', async () => {
    mount([gateStart()]);
    const row = await screen.findByTestId('activity-event-20');
    expect(within(row).getByTestId('activity-elapsed-20')).toHaveTextContent('4m 12s');
    const bar = screen.getByTestId('activity-progress-20');
    expect(bar).toHaveClass('activity-row__progress--waiting');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(row.querySelector('.activity-row__spinner')).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByTestId('activity-elapsed-20')).toHaveTextContent('4m 15s');
  });

  it('draws a determinate bar once the page knows what the kind usually takes', async () => {
    mount([
      gateStart(),
      pipelineEvent({ seq: 11, kind: 'gate.log', repo: 'x', sha: 'x1', seconds: 400, outcome: 'success' }),
      pipelineEvent({ seq: 10, kind: 'gate.log', repo: 'x', sha: 'x2', seconds: 600, outcome: 'success' }),
    ]);
    const bar = await screen.findByTestId('activity-progress-20');
    // 252s of a 500s median.
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).not.toHaveClass('activity-row__progress--waiting');
  });

  it('settles the row when its finishing event arrives', async () => {
    mount([
      pipelineEvent({
        seq: 21,
        kind: 'gate.log',
        repo: 'jeryu/jeryu-web',
        sha: 'b761244',
        outcome: 'success',
        seconds: 252,
        summary: 'Gate passed on jeryu/jeryu-web#35',
      }),
      gateStart(),
    ]);
    await screen.findByTestId('activity-event-20');
    await waitFor(() => expect(screen.queryByTestId('activity-progress-20')).toBeNull());
    expect(screen.queryByTestId('activity-elapsed-20')).toBeNull();
    expect(within(screen.getByTestId('activity-event-21')).getByText('4m 12s')).toBeTruthy();
  });

  it('leaves a finished row alone', async () => {
    mount([pipelineEvent({ seq: 5, kind: 'pr.merged', repo: 'r', pr: 1, outcome: 'success' })]);
    await screen.findByTestId('activity-event-5');
    expect(screen.queryByTestId('activity-progress-5')).toBeNull();
  });
});
