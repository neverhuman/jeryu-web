// activityTabBadge.test.tsx — the tab's own count: a needs_human row the tail
// lands while the reader is in another tab prefixes the title, and coming back
// to the tab clears it.

import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { markRowsSeen, noRowsSeen } from '../activity/arrivalsModel';
import { badgedArrivals, badgedTitle, useAwayCount } from '../activity/badgeModel';
import { mockPipelineApi } from './pipelinePageHelpers';
import { json, renderAt } from './shiftPageHelpers';
import { pipelineEvent } from './pipelineTestData';

/** Put the tab in the background, or bring it back, as the browser would. */
function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

afterEach(() => setHidden(false));

describe('badgedTitle', () => {
  it('says the name alone when nothing arrived unseen', () => {
    expect(badgedTitle('Activity', 0)).toBe('Activity');
  });

  it('prefixes the count', () => {
    expect(badgedTitle('Activity', 2)).toBe('(2) Activity');
    expect(badgedTitle('acme/widgets · Activity', 1)).toBe('(1) acme/widgets · Activity');
  });
});

describe('useAwayCount', () => {
  it('counts only what lands while the tab is hidden', () => {
    const { result, rerender } = renderHook(
      ({ seqs }: { seqs: number[] }) => useAwayCount(seqs, seqs, 'all'),
      { initialProps: { seqs: [10] } }
    );
    // Visible: a row arriving is read where it lands, not in the title.
    rerender({ seqs: [11, 10] });
    expect(result.current).toBe(0);

    setHidden(true);
    rerender({ seqs: [12, 11, 10] });
    expect(result.current).toBe(1);
    rerender({ seqs: [13, 12, 11, 10] });
    expect(result.current).toBe(2);

    // Back in the tab is having seen them, and it does not come back.
    setHidden(false);
    expect(result.current).toBe(0);
    setHidden(true);
    expect(result.current).toBe(0);
  });

  it('counts the rows that want a person, not every arrival', () => {
    setHidden(true);
    const { result, rerender } = renderHook(
      ({ seqs, badged }: { seqs: number[]; badged: number[] }) => useAwayCount(seqs, badged, 'all'),
      { initialProps: { seqs: [10], badged: [] as number[] } }
    );
    rerender({ seqs: [11, 10], badged: [] });
    expect(result.current).toBe(0);
    rerender({ seqs: [12, 11, 10], badged: [12] });
    expect(result.current).toBe(1);
  });

  it('adds nothing for a first page, an older page or a filter change', () => {
    setHidden(true);
    const { result, rerender } = renderHook(
      ({ seqs, filterId }: { seqs: number[]; filterId: string }) => useAwayCount(seqs, seqs, filterId),
      { initialProps: { seqs: [12, 11], filterId: 'all' } }
    );
    expect(result.current).toBe(0);
    rerender({ seqs: [12, 11, 10, 9], filterId: 'all' });
    expect(result.current).toBe(0);
    rerender({ seqs: [40, 39], filterId: 'needs_human=1' });
    expect(result.current).toBe(0);
    rerender({ seqs: [41, 40, 39], filterId: 'needs_human=1' });
    expect(result.current).toBe(1);
  });
});

describe('badgedArrivals', () => {
  it('narrows the arrivals to the rows worth a count', () => {
    const seen = markRowsSeen(noRowsSeen(), [12, 11]);
    expect(badgedArrivals(seen, [14, 13, 12, 11], [14, 11])).toBe(1);
    expect(badgedArrivals(seen, [14, 13, 12, 11], [])).toBe(0);
  });
});

describe('ActivityPage tab badge', () => {
  afterEach(() => vi.restoreAllMocks());

  it('badges the title for a needs_human arrival and clears it on return', async () => {
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
      return json({ events: [pipelineEvent({ seq: 12, kind: 'pr.merged' })], latest_seq: 12 });
    });
    // The reader is in another tab: the first page is not an arrival, the row
    // the tail then brings in is, and the title is where they can read it.
    setHidden(true);
    renderAt('/activity', '/activity', <ActivityPage />);
    await screen.findByTestId('activity-event-13');
    await waitFor(() => expect(document.title).toBe('(1) Activity · JeRyu'));

    setHidden(false);
    await waitFor(() => expect(document.title).toBe('Activity · JeRyu'));
  });

  it('leaves the title alone for a row that needs no person', async () => {
    mockPipelineApi((req) => {
      if (req.pathname !== '/api/v1/events') return undefined;
      const qs = new URLSearchParams(req.search);
      if (qs.get('after_seq'))
        return json({ events: [pipelineEvent({ seq: 13, kind: 'pr.merged' })], latest_seq: 13 });
      return json({ events: [pipelineEvent({ seq: 12, kind: 'pr.merged' })], latest_seq: 12 });
    });
    setHidden(true);
    renderAt('/activity', '/activity', <ActivityPage />);
    await screen.findByTestId('activity-event-13');
    expect(document.title).toBe('Activity · JeRyu');
  });
});
