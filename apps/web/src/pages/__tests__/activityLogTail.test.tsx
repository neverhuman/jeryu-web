// activityLogTail.test.tsx — the expanded log tail: which lines are read as
// failures, that the tail opens at its end rather than its top, and that the
// whole tail can be taken away in one click.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EventRow } from '../activity';
import { badLineCount, isBadLine, logLines } from '../activity/logModel';
import { mockPipelineApi } from './pipelinePageHelpers';
import { renderAt } from './shiftPageHelpers';
import { pipelineEvent } from './pipelineTestData';

const TAIL = [
  'Compiling jeryu-core v0.1.0',
  '   Running 412 tests, 0 failures so far',
  'error[E0432]: unresolved import `jeryu_core::Shift`',
  'thread main panicked at src/lib.rs:12',
  'test gate::smoke ... FAIL',
  'gate finished',
].join('\n');

/** jsdom lays nothing out, so the tail is given a height to scroll within. */
function layOutLogs(height: number, view = 100): void {
  for (const [name, value] of [
    ['scrollHeight', height],
    ['clientHeight', view],
  ] as const) {
    Object.defineProperty(HTMLPreElement.prototype, name, {
      configurable: true,
      get: () => value,
    });
  }
}

function renderRow(tail: string | null = TAIL): void {
  mockPipelineApi();
  renderAt(
    '/activity',
    '/activity',
    <ul>
      <EventRow
        event={pipelineEvent({
          seq: 7,
          source: 'pr-gate',
          kind: 'gate.log',
          repo: 'jeryu/jeryu-web',
          pr: 35,
          outcome: 'failure',
          summary: 'Gate failed on jeryu/jeryu-web#35',
          log_tail: tail,
        })}
        defaultOpen
      />
    </ul>
  );
}

describe('logModel', () => {
  it('reads a failure however the producer spelled it', () => {
    expect(isBadLine('error[E0432]: unresolved import')).toBe(true);
    expect(isBadLine('Error: the gate did not start')).toBe(true);
    expect(isBadLine('gate: FAILED')).toBe(true);
    expect(isBadLine('the step failed')).toBe(true);
    expect(isBadLine('thread main panicked at src/lib.rs:12')).toBe(true);
    expect(isBadLine('test gate::smoke ... FAIL')).toBe(true);
  });

  it('leaves the quiet lines alone', () => {
    expect(isBadLine('Compiling jeryu-core v0.1.0')).toBe(false);
    expect(isBadLine('412 passed')).toBe(false);
    // Lowercase prose about failing is not a verdict; only a shouted one is.
    expect(isBadLine('retrying on failure modes')).toBe(false);
  });

  it('splits a tail into its lines without inventing one for the last newline', () => {
    expect(logLines('one\ntwo\n').map((line) => line.text)).toEqual(['one', 'two']);
    expect(logLines('')).toEqual([{ text: '', bad: false }]);
    expect(badLineCount(logLines(TAIL))).toBe(3);
  });
});

describe('EventRow log tail', () => {
  afterEach(() => vi.restoreAllMocks());

  it('marks the failing lines and leaves the rest plain', async () => {
    layOutLogs(400);
    renderRow();
    const log = await screen.findByTestId('activity-event-log-7');
    const bad = Array.from(log.querySelectorAll('.activity-row__log-line--bad')).map(
      (line) => line.textContent
    );
    expect(bad).toEqual([
      'error[E0432]: unresolved import `jeryu_core::Shift`',
      'thread main panicked at src/lib.rs:12',
      'test gate::smoke ... FAIL',
    ]);
    // Every line is still there, failing or not, in the producer's order.
    expect(log.querySelectorAll('.activity-row__log-line')).toHaveLength(6);
    expect(log.textContent).toContain('Compiling jeryu-core');
    // And the reader is told how much of the tail is worth their attention.
    expect(screen.getByText('Log tail — 3 failing lines')).toBeTruthy();
  });

  it('opens at the end of the tail, where the failure is', async () => {
    layOutLogs(400);
    renderRow();
    const log = await screen.findByTestId('activity-event-log-7');
    expect(log.scrollTop).toBe(400);
  });

  it('hands the whole tail to the clipboard', async () => {
    layOutLogs(400);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderRow();
    const copy = await screen.findByTestId('activity-event-log-copy-7');
    // Named apart from the tail itself, so one label does not match both.
    expect(copy).toHaveAttribute('aria-label', 'Copy event 7 log');
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TAIL));
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('says nothing about a tail on a row that has none', async () => {
    renderRow(null);
    await screen.findByTestId('activity-event-7');
    expect(screen.queryByTestId('activity-event-log-7')).toBeNull();
    expect(screen.queryByText(/Log tail/)).toBeNull();
  });
});
