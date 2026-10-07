// activityPending.test.tsx — the first load: the feed is drawn as the rows it
// will become, at the height they will take, with the band above it already
// holding its own height, so nothing on the page moves when the events land.

import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { ActivitySkeleton } from '../activity/ActivitySkeleton';
import { mockPipelineApi } from './pipelinePageHelpers';
import { json, renderAt } from './shiftPageHelpers';
import { pipelineEvent } from './pipelineTestData';

/** A feed request that never answers: the page stays on its first load. */
function pendingFeed(): Promise<Response> {
  return new Promise<Response>(() => {});
}

function renderPage(path = '/activity'): void {
  renderAt(path, '/activity', <ActivityPage />);
}

function withReducedMotion(run: () => void): void {
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
    run();
  } finally {
    window.matchMedia = original;
  }
}

describe('ActivitySkeleton', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws eight rows and says what is loading', () => {
    render(<ActivitySkeleton />);
    const pending = screen.getByTestId('activity-pending');
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(within(pending).getByText('Loading activity…')).toBeInTheDocument();
    expect(pending.querySelectorAll('.activity__pending-row')).toHaveLength(8);
  });

  it('gives every row the real row class, so it stands at the real height', () => {
    render(<ActivitySkeleton />);
    for (const row of screen.getByTestId('activity-pending').querySelectorAll('.activity__pending-row')) {
      expect(row).toHaveClass('activity-row');
      // The shapes a row is made of: when, which tool, what, the summary, how long.
      expect(row.querySelectorAll('.activity__pending-bar')).toHaveLength(5);
    }
  });

  it('shimmers by default', () => {
    render(<ActivitySkeleton />);
    const pending = screen.getByTestId('activity-pending');
    expect(pending).not.toHaveAttribute('data-still');
    expect(pending.querySelectorAll('.activity__pending-bar.skeleton').length).toBe(
      pending.querySelectorAll('.activity__pending-bar').length
    );
  });

  it('keeps the shapes and drops the shimmer when less motion is asked for', () => {
    withReducedMotion(() => {
      render(<ActivitySkeleton />);
      const pending = screen.getByTestId('activity-pending');
      expect(pending).toHaveAttribute('data-still', 'true');
      expect(pending.querySelectorAll('.activity__pending-bar').length).toBe(8 * 5);
      expect(pending.querySelectorAll('.skeleton')).toHaveLength(0);
    });
  });
});

describe('ActivityPage first load', () => {
  afterEach(() => vi.restoreAllMocks());

  it('holds the list open with skeleton rows instead of a message', async () => {
    mockPipelineApi((req) => (req.pathname === '/api/v1/events' ? pendingFeed() : undefined));
    renderPage();
    const pending = await screen.findByTestId('activity-pending');
    expect(pending.querySelectorAll('.activity__pending-row')).toHaveLength(8);
    expect(screen.queryByText('Loading activity…', { selector: 'h2' })).toBeNull();
    // The band above the list is there too, so its height is reserved before
    // the bars are in and the list does not slide up under it.
    expect(await screen.findByTestId('activity-volume')).toBeInTheDocument();
  });

  it('swaps the skeleton for the rows once the page is in', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events'
        ? json({ events: [pipelineEvent({ seq: 7, kind: 'pr.merged' })], latest_seq: 7 })
        : undefined
    );
    renderPage();
    await screen.findByTestId('activity-event-7');
    await waitFor(() => expect(screen.queryByTestId('activity-pending')).toBeNull());
  });
});
