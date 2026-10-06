// activityArrivals.test.tsx — the cue a row gets when the live tail brings it
// in: which seqs count as new, how long the wash lasts, and the rows that must
// not animate (a first page, a filter change, "Load older", less motion).

import { act, renderHook, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import {
  ARRIVAL_HIGHLIGHT_MS,
  arrivedSeqs,
  markRowsSeen,
  noRowsSeen,
  useArrivingRows,
} from '../activity/arrivalsModel';
import { mockPipelineApi } from './pipelinePageHelpers';
import { json, renderAt } from './shiftPageHelpers';
import { pipelineEvent } from './pipelineTestData';

function renderPage(path = '/activity'): void {
  renderAt(path, '/activity', <ActivityPage />);
}

describe('arrivedSeqs', () => {
  it('calls nothing new on a first page', () => {
    expect(arrivedSeqs(noRowsSeen(), [12, 11, 10])).toEqual([]);
  });

  it('names only the seqs above everything already shown', () => {
    const seen = markRowsSeen(noRowsSeen(), [12, 11, 10]);
    expect(arrivedSeqs(seen, [14, 13, 12, 11, 10])).toEqual([14, 13]);
  });

  it('stays quiet for an older page merged under the list', () => {
    const seen = markRowsSeen(noRowsSeen(), [12, 11, 10]);
    expect(arrivedSeqs(seen, [12, 11, 10, 9, 8])).toEqual([]);
  });

  it('does not repeat a row that already had its cue', () => {
    const seen = markRowsSeen(markRowsSeen(noRowsSeen(), [10]), [11]);
    expect(arrivedSeqs(seen, [11, 10])).toEqual([]);
    expect(seen.newest).toBe(11);
  });
});

describe('useArrivingRows', () => {
  afterEach(() => vi.useRealTimers());

  it('holds a row for the highlight, then lets it go', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ seqs }: { seqs: number[] }) => useArrivingRows(seqs, 'all'),
      { initialProps: { seqs: [10] } }
    );
    expect([...result.current]).toEqual([]);

    rerender({ seqs: [11, 10] });
    expect([...result.current]).toEqual([11]);
    // A second row lands later and keeps its own full two seconds.
    act(() => vi.advanceTimersByTime(ARRIVAL_HIGHLIGHT_MS / 2));
    rerender({ seqs: [12, 11, 10] });
    expect([...result.current]).toEqual([11, 12]);
    act(() => vi.advanceTimersByTime(ARRIVAL_HIGHLIGHT_MS / 2));
    expect([...result.current]).toEqual([12]);
    act(() => vi.advanceTimersByTime(ARRIVAL_HIGHLIGHT_MS / 2));
    expect([...result.current]).toEqual([]);
  });

  it('treats the page after a filter change as a first page', () => {
    const { result, rerender } = renderHook(
      ({ seqs, filterId }: { seqs: number[]; filterId: string }) => useArrivingRows(seqs, filterId),
      { initialProps: { seqs: [12, 11, 10], filterId: 'all' } }
    );
    rerender({ seqs: [30, 29], filterId: 'kind=todo.' });
    expect([...result.current]).toEqual([]);
    rerender({ seqs: [31, 30, 29], filterId: 'kind=todo.' });
    expect([...result.current]).toEqual([31]);
  });

  it('reports nothing when the reader asked for less motion', () => {
    const { result, rerender } = renderHook(
      ({ seqs }: { seqs: number[] }) => useArrivingRows(seqs, 'all', true),
      { initialProps: { seqs: [10] } }
    );
    rerender({ seqs: [11, 10] });
    expect([...result.current]).toEqual([]);
  });
});

describe('ActivityPage arrivals', () => {
  afterEach(() => vi.restoreAllMocks());

  it('marks the row the tail brought in, and not the page under it', async () => {
    mockPipelineApi((req) => {
      if (req.pathname !== '/api/v1/events') return undefined;
      const qs = new URLSearchParams(req.search);
      if (qs.get('after_seq')) {
        return json({
          events: [
            pipelineEvent({
              seq: 13,
              kind: 'release.staged',
              needs_human: true,
              reason: 'Awaiting the deploy command.',
            }),
          ],
          latest_seq: 13,
        });
      }
      return json({
        events: [pipelineEvent({ seq: 12, kind: 'pr.merged' }), pipelineEvent({ seq: 11, kind: 'todo.claimed' })],
        latest_seq: 12,
      });
    });
    renderPage();
    await screen.findByTestId('activity-event-12');
    const fresh = await screen.findByTestId('activity-event-13');
    expect(fresh).toHaveClass('is-arriving');
    // A row that wants a person washes in its own colour.
    expect(fresh).toHaveClass('is-needs-human');
    expect(within(fresh).getByText('needs you')).toBeInTheDocument();
    expect(screen.getByTestId('activity-event-12')).not.toHaveClass('is-arriving');
    expect(screen.getByTestId('activity-event-11')).not.toHaveClass('is-arriving');
    // The wash is temporary: the row settles back into the feed.
    await waitFor(() => expect(fresh).not.toHaveClass('is-arriving'), { timeout: 4_000 });
  });

  it('leaves an older page and a filter change unanimated', async () => {
    const page = Array.from({ length: 100 }, (_, i) => pipelineEvent({ seq: 200 - i, kind: 'todo.claimed' }));
    mockPipelineApi((req) => {
      if (req.pathname !== '/api/v1/events') return undefined;
      const qs = new URLSearchParams(req.search);
      if (qs.get('before_seq')) return json({ events: [pipelineEvent({ seq: 100, kind: 'todo.filed' })], latest_seq: 200 });
      if (qs.get('after_seq')) return json({ events: [], latest_seq: 200 });
      return json({ events: page, latest_seq: 200 });
    });
    renderPage();
    await screen.findByTestId('activity-event-200');
    fireEvent.click(screen.getByRole('button', { name: 'Load older' }));
    const older = await screen.findByTestId('activity-event-100');
    expect(older).not.toHaveClass('is-arriving');
    expect(document.querySelectorAll('.activity-row.is-arriving')).toHaveLength(0);
  });

  it('does not slide rows in when the reader asked for less motion', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      mockPipelineApi((req) => {
        if (req.pathname !== '/api/v1/events') return undefined;
        const qs = new URLSearchParams(req.search);
        if (qs.get('after_seq')) return json({ events: [pipelineEvent({ seq: 13, kind: 'pr.merged' })], latest_seq: 13 });
        return json({ events: [pipelineEvent({ seq: 12, kind: 'pr.merged' })], latest_seq: 12 });
      });
      renderPage();
      const fresh = await screen.findByTestId('activity-event-13');
      expect(fresh).not.toHaveClass('is-arriving');
    } finally {
      window.matchMedia = original;
    }
  });
});
