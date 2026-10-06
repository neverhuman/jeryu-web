// activityHold.test.tsx — the tail not pushing the reader: which seqs wait
// above the cutoff, when the cutoff follows the feed, the pill that hands
// the waiting rows over, and the pause control that freezes the list.

import { act, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { heldSeqs, nextCutoff, shownSeqs, useHeldRows } from '../activity/holdModel';
import { mockPipelineApi } from './pipelinePageHelpers';
import { json, renderAt } from './shiftPageHelpers';
import { pipelineEvent } from './pipelineTestData';

function renderPage(path = '/activity'): void {
  renderAt(path, '/activity', <ActivityPage />);
}

/** Puts the document where a reader who has scrolled down would have it. */
function scrollTo(y: number): void {
  Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true });
  fireEvent.scroll(window);
}

describe('holdModel', () => {
  it('splits a feed at the cutoff', () => {
    expect(shownSeqs([14, 13, 12, 11], 12)).toEqual([12, 11]);
    expect(heldSeqs([14, 13, 12, 11], 12)).toEqual([14, 13]);
  });

  it('takes the whole first page, however far down the reader is', () => {
    expect(nextCutoff(0, [12, 11, 10], false)).toBe(12);
  });

  it('follows the feed while the reader is anchored and stands still otherwise', () => {
    expect(nextCutoff(12, [14, 13, 12], true)).toBe(14);
    expect(nextCutoff(12, [14, 13, 12], false)).toBe(12);
  });

  it('does not walk back for an older page merged under the list', () => {
    expect(nextCutoff(12, [12, 11, 10, 9], true)).toBe(12);
  });
});

describe('useHeldRows', () => {
  it('holds what lands while the reader is away, then releases it', () => {
    const { result, rerender } = renderHook(
      ({ seqs, anchored }: { seqs: number[]; anchored: boolean }) =>
        useHeldRows(seqs, 'all', anchored),
      { initialProps: { seqs: [12, 11], anchored: false } }
    );
    expect(result.current.shown).toEqual([12, 11]);

    rerender({ seqs: [14, 13, 12, 11], anchored: false });
    expect(result.current.shown).toEqual([12, 11]);
    expect(result.current.heldCount).toBe(2);

    act(() => result.current.release());
    expect(result.current.shown).toEqual([14, 13, 12, 11]);
    expect(result.current.heldCount).toBe(0);
  });

  it('inserts straight away for a reader at the top', () => {
    const { result, rerender } = renderHook(
      ({ seqs }: { seqs: number[] }) => useHeldRows(seqs, 'all', true),
      { initialProps: { seqs: [12, 11] } }
    );
    rerender({ seqs: [13, 12, 11] });
    expect(result.current.shown).toEqual([13, 12, 11]);
    expect(result.current.heldCount).toBe(0);
  });

  it('holds nothing when it is switched off', () => {
    const { result, rerender } = renderHook(
      ({ seqs }: { seqs: number[] }) => useHeldRows(seqs, 'all', false, false),
      { initialProps: { seqs: [12, 11] } }
    );
    rerender({ seqs: [13, 12, 11] });
    expect(result.current.shown).toEqual([13, 12, 11]);
    expect(result.current.heldCount).toBe(0);
  });

  it('starts over when the filters change', () => {
    const { result, rerender } = renderHook(
      ({ seqs, filterId }: { seqs: number[]; filterId: string }) =>
        useHeldRows(seqs, filterId, false),
      { initialProps: { seqs: [12, 11], filterId: 'all' } }
    );
    rerender({ seqs: [14, 13, 12, 11], filterId: 'all' });
    expect(result.current.heldCount).toBe(2);
    rerender({ seqs: [30, 29], filterId: 'kind=todo.' });
    expect(result.current.shown).toEqual([30, 29]);
    expect(result.current.heldCount).toBe(0);
  });
});

/** A first page of two rows, with one more on the tail when `tail` is true. */
function mockTailOf(seq: number, tail = true): void {
  mockPipelineApi((req) => {
    if (req.pathname !== '/api/v1/events') return undefined;
    const qs = new URLSearchParams(req.search);
    if (qs.get('after_seq')) {
      return json({
        events: tail ? [pipelineEvent({ seq, kind: 'pr.merged' })] : [],
        latest_seq: tail ? seq : seq - 1,
      });
    }
    return json({
      events: [
        pipelineEvent({ seq: seq - 1, kind: 'gate.log', log_tail: 'gate: FAILED' }),
        pipelineEvent({ seq: seq - 2, kind: 'todo.claimed' }),
      ],
      latest_seq: seq - 1,
    });
  });
}

describe('ActivityPage held rows', () => {
  beforeEach(() => scrollTo(0));
  afterEach(() => {
    scrollTo(0);
    vi.restoreAllMocks();
  });

  it('holds a tail row behind a pill for a reader who has scrolled down', async () => {
    scrollTo(600);
    mockTailOf(13);
    renderPage();
    await screen.findByTestId('activity-event-12');

    const pill = await screen.findByTestId('activity-held-show');
    expect(pill).toHaveTextContent('1 new event — show');
    expect(screen.queryByTestId('activity-event-13')).toBeNull();
    // The row is held, not dropped: the reader asks and it is there, with the
    // cue a row that just landed gets.
    fireEvent.click(pill);
    const fresh = await screen.findByTestId('activity-event-13');
    expect(fresh).toHaveClass('is-arriving');
    expect(screen.queryByTestId('activity-held')).toBeNull();
  });

  it('inserts the tail row directly for a reader at the top', async () => {
    mockTailOf(13);
    renderPage();
    const fresh = await screen.findByTestId('activity-event-13');
    expect(fresh).toHaveClass('is-arriving');
    expect(screen.queryByTestId('activity-held')).toBeNull();
  });

  it('holds the tail back while a row is open, even at the top', async () => {
    mockTailOf(13, false);
    renderPage();
    const gate = await screen.findByTestId('activity-event-12');
    fireEvent.click(within(gate).getByRole('button', { name: /Log for event 12/ }));
    expect(within(gate).getByLabelText('Log tail of event 12')).toBeInTheDocument();

    // Now the tail has something: it must not push the opened row down.
    mockTailOf(13);
    const pill = await screen.findByTestId('activity-held-show', undefined, { timeout: 10_000 });
    expect(pill).toHaveTextContent('1 new event — show');
    expect(screen.queryByTestId('activity-event-13')).toBeNull();
    // Closing the row makes the reader anchored again, and it insert itself.
    fireEvent.click(within(gate).getByRole('button', { name: /Hide for event 12/ }));
    await screen.findByTestId('activity-event-13');
    await waitFor(() => expect(screen.queryByTestId('activity-held')).toBeNull());
    // The tail polls every five seconds, so this one waits for a beat.
  }, 20_000);

  it('freezes the list while paused, counts arrivals and hands them over on resume', async () => {
    mockTailOf(13, false);
    renderPage();
    await screen.findByTestId('activity-event-12');
    const pause = screen.getByTestId('activity-pause');
    expect(pause).toHaveTextContent('Pause');
    expect(pause).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(pause);
    expect(pause).toHaveAttribute('aria-pressed', 'true');
    // The pill says the reader's own Pause the way it says a hidden tab.
    await waitFor(() =>
      expect(screen.getByTestId('activity-live')).toHaveAttribute('data-phase', 'paused')
    );
    expect(screen.getByTestId('activity-live')).toHaveTextContent(/^Paused · Showing /);

    // The tail now has a row: paused, it is counted, not inserted.
    mockTailOf(13);
    await waitFor(() => expect(pause).toHaveTextContent('1 new'), { timeout: 10_000 });
    expect(screen.queryByTestId('activity-event-13')).toBeNull();

    fireEvent.click(pause);
    const fresh = await screen.findByTestId('activity-event-13');
    expect(fresh).toHaveClass('is-arriving');
    expect(pause).toHaveTextContent('Pause');
    await waitFor(() =>
      expect(screen.getByTestId('activity-live')).toHaveAttribute('data-phase', 'live')
    );
  }, 20_000);

  it('has no pause control in wall mode', async () => {
    mockTailOf(13, false);
    renderPage('/activity?wall=1');
    await screen.findByTestId('activity-event-12');
    expect(screen.queryByTestId('activity-pause')).toBeNull();
  });

  it('keeps wall mode on auto-insert however far down it is', async () => {
    scrollTo(600);
    mockTailOf(13);
    renderPage('/activity?wall=1');
    await screen.findByTestId('activity-event-13');
    expect(screen.queryByTestId('activity-held')).toBeNull();
  });
});
