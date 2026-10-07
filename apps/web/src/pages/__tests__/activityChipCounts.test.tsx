// activityChipCounts.test.tsx — the count badge on each Activity filter chip:
// what it counts, where the number comes from, what an empty chip looks like,
// and what the badges do when the reader asked for less motion or the server
// has no histogram route.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { chipCounts, histogramBuckets } from '../activity/histogramModel';
import { mockPipelineApi } from './pipelinePageHelpers';
import { HISTOGRAM } from './pipelineTestData';
import { errorResponse, json, renderAt } from './shiftPageHelpers';

function renderPage(path = '/activity'): void {
  renderAt(path, '/activity', <ActivityPage />);
}

function chip(label: string): HTMLElement {
  return screen.getByRole('button', { name: label });
}

function badge(label: string): HTMLElement | null {
  return chip(label).querySelector('.activity__chip-count');
}

/** A reader who asked the OS to minimize motion, for one test. */
function withReducedMotion(body: () => Promise<void>): Promise<void> {
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
  return body().finally(() => {
    window.matchMedia = original;
  });
}

describe('chipCounts', () => {
  it('counts every chip off the band\'s groups, with all and human of their own', () => {
    const counts = chipCounts(histogramBuckets(HISTOGRAM));
    // `all` is the window's events: the same number the band says.
    expect(counts.all).toBe(21);
    expect(counts.human).toBe(1);
    expect(counts.todos).toBe(7);
    expect(counts.gates).toBe(9);
    expect(counts.reviews).toBe(1);
    expect(counts.merges).toBe(1);
    expect(counts.deploys).toBe(1);
  });

  it('leaves out a chip the band stacks no group for', () => {
    const counts = chipCounts(histogramBuckets(HISTOGRAM));
    // Workers is not one of the band's groups, so it has no number to show:
    // a zero there would read as "no worker events", which it is not.
    expect(counts.workers).toBeUndefined();
  });

  it('counts zero for a chip no bucket mentions, and for no buckets at all', () => {
    const quiet = chipCounts(
      histogramBuckets({ buckets: [{ at: '2026-10-04T10:00:00Z', groups: { todos: 2 } }] })
    );
    expect(quiet.todos).toBe(2);
    expect(quiet.gates).toBe(0);
    expect(quiet.human).toBe(0);
    expect(chipCounts([])).toMatchObject({ all: 0, todos: 0, human: 0 });
  });
});

describe('Activity chip counts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('badges each chip with what is behind it over the drawn range', async () => {
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-volume');
    await waitFor(() => expect(badge('All')).toHaveTextContent('21'));
    expect(badge('Gates')).toHaveTextContent('9');
    expect(badge('Needed a human')).toHaveTextContent('1');
    // No group behind it: no badge, and not drawn as an empty chip either.
    expect(badge('Workers')).toBeNull();
    expect(chip('Workers')).not.toHaveClass('activity__chip--empty');
    // The number moves, so it is not read aloud twice: the chip's name stays
    // its label and the count is its description.
    expect(badge('Gates')).toHaveAttribute('aria-hidden', 'true');
    expect(chip('Gates')).toHaveAttribute('title', '9 in the last 24h');
    expect(chip('Gates')).toHaveAccessibleName('Gates');
  });

  it('counts the range the band is drawn at, sharing its request', async () => {
    const calls = mockPipelineApi();
    renderPage('/activity?range=7d');
    await screen.findByTestId('activity-volume');
    await waitFor(() => expect(badge('All')).toHaveTextContent('21'));
    expect(chip('All')).toHaveAttribute('title', '21 in the last 7d');
    // The chips ask nothing of their own: the only histogram windows fetched
    // are the band's 7 d and the last-24-hour strip's.
    const asked = calls.filter((call) => call.pathname === '/api/v1/events/histogram');
    expect(asked.some((call) => call.search.includes('range=7d'))).toBe(true);
    expect(new Set(asked.map((call) => call.search))).toEqual(
      new Set(['?range=7d', '?range=24h'])
    );
  });

  it('mutes a chip with nothing behind it and still lets it filter', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events/histogram'
        ? json({ buckets: [{ at: '2026-10-04T10:00:00Z', groups: { todos: 3 } }] })
        : undefined
    );
    renderPage();
    await screen.findByTestId('activity-volume');
    await waitFor(() => expect(badge('Todos')).toHaveTextContent('3'));
    expect(badge('Deploys')).toHaveTextContent('0');
    expect(chip('Deploys')).toHaveClass('activity__chip--empty');
    expect(chip('Todos')).not.toHaveClass('activity__chip--empty');
    // Muted is not disabled: pressing it shows the reader there is nothing.
    expect(chip('Deploys')).not.toBeDisabled();
    fireEvent.click(chip('Deploys'));
    await waitFor(() => expect(chip('Deploys')).toHaveAttribute('aria-pressed', 'true'));
  });

  it('travels to the new count when the counted window changes', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events/histogram'
        ? json({
            buckets: [
              {
                at: '2026-10-04T10:00:00Z',
                groups: { todos: req.search.includes('range=6h') ? 40 : 2 },
              },
            ],
          })
        : undefined
    );
    renderPage();
    await screen.findByTestId('activity-volume');
    await waitFor(() => expect(badge('Todos')).toHaveTextContent('2'));

    fireEvent.click(chip('6h'));
    // Mid-tween the badge is neither the old number nor the new one yet.
    await waitFor(() => expect(badge('Todos')).not.toHaveTextContent('2'));
    await waitFor(() => expect(badge('Todos')).toHaveTextContent('40'), { timeout: 5_000 });
  });

  it('does not tween the badges when the reader asked for less motion', async () => {
    await withReducedMotion(async () => {
      mockPipelineApi();
      renderPage();
      await screen.findByTestId('activity-volume');
      await waitFor(() => expect(badge('All')).toHaveTextContent('21'));
      const chips = screen.getByRole('group', { name: 'Show' });
      expect(chips).toHaveClass('activity__chips--still');
    });
  });

  it('leaves the badges out on a server without the histogram route', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events/histogram' ? errorResponse(404, 'no such route') : undefined
    );
    renderPage();
    await screen.findByTestId('activity-event-12');
    await waitFor(() => expect(screen.queryByTestId('activity-volume')).toBeNull());
    expect(badge('All')).toBeNull();
    expect(chip('All')).not.toHaveAttribute('title');
    expect(chip('Deploys')).not.toHaveClass('activity__chip--empty');
  });
});
