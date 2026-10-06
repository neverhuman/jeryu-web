// ActivityHistogram.test.tsx — the volume band above the Activity feed: the
// geometry it draws, the filter it sets, the range it holds in the URL, and
// what it does on a server that has no histogram route.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import {
  HISTOGRAM_GROUPS,
  applyRange,
  bucketTitle,
  histogramBuckets,
  histogramGeometry,
  histogramSummary,
  parseRange,
} from '../activity/histogramModel';
import { mockPipelineApi } from './pipelinePageHelpers';
import { HISTOGRAM } from './pipelineTestData';
import { errorResponse, renderAt } from './shiftPageHelpers';

function renderPage(path = '/activity'): void {
  renderAt(path, '/activity', <ActivityPage />);
}

describe('histogramModel', () => {
  it('reads the range from the URL and keeps the other filters when it changes', () => {
    expect(parseRange(new URLSearchParams(''))).toBe('24h');
    expect(parseRange(new URLSearchParams('range=7d'))).toBe('7d');
    // A range this build does not draw falls back rather than asking for it.
    expect(parseRange(new URLSearchParams('range=90d'))).toBe('24h');

    const next = applyRange(new URLSearchParams('kind=todo.&range=7d'), '6h');
    expect(next.get('kind')).toBe('todo.');
    expect(next.get('range')).toBe('6h');
    // The default is the absence of the parameter, not `range=24h`.
    expect(applyRange(next, '24h').has('range')).toBe(false);
  });

  it('folds the wire buckets into counts, oldest first, ignoring unknown groups', () => {
    const buckets = histogramBuckets({
      buckets: [
        { at: '2026-10-04T11:00:00Z', groups: { todos: 2, weather: 9 }, failures: 1, needs_human: 2 },
        { at: '2026-10-04T10:00:00Z', groups: { gates: 3 } },
        { at: 'not-a-time', groups: { gates: 1 } },
      ],
    });
    expect(buckets.map((bucket) => bucket.at)).toEqual([
      '2026-10-04T10:00:00Z',
      '2026-10-04T11:00:00Z',
    ]);
    expect(buckets[0]).toMatchObject({ total: 3, failures: 0, needsHuman: 0 });
    expect(buckets[1]).toMatchObject({ total: 2, failures: 1, needsHuman: 2 });
    expect(buckets[1].counts.weather).toBeUndefined();
  });

  it('stacks every group inside the bar and scales bars against the busiest bucket', () => {
    const buckets = histogramBuckets(HISTOGRAM);
    const geometry = histogramGeometry(buckets, { width: 900, height: 100, spanHours: 24 });
    expect(geometry.bars).toHaveLength(3);
    expect(geometry.max).toBe(13);
    expect(geometry.events).toBe(21);

    const busiest = geometry.bars[1];
    expect(busiest.segments.map((segment) => segment.groupId)).toEqual(
      HISTOGRAM_GROUPS.map((group) => group.id)
    );
    // The stack fills the bar exactly: its top is the bar's top.
    const stack = busiest.segments.reduce((sum, segment) => sum + segment.height, 0);
    expect(stack).toBeCloseTo(100, 6);
    expect(Math.min(...busiest.segments.map((segment) => segment.y))).toBeCloseTo(0, 6);
    // Failures are a share of the bar, drawn from its foot; the tick sits above it.
    expect(busiest.failures?.height).toBeCloseTo((2 / 13) * 100, 6);
    expect(busiest.tickY).toBeCloseTo(0, 6);
    expect(geometry.bars[0].tickY).toBeNull();
    // Only the newest bucket is the one still filling.
    expect(geometry.bars.map((bar) => bar.current)).toEqual([false, false, true]);

    const quiet = geometry.bars[0];
    expect(quiet.total).toBe(6);
    expect(quiet.segments.map((segment) => segment.groupId)).toEqual(['todos', 'gates']);
  });

  it('says in words what the picture says', () => {
    const geometry = histogramGeometry(histogramBuckets(HISTOGRAM), {
      width: 900,
      height: 100,
      spanHours: 24,
    });
    const summary = histogramSummary(geometry, '24h');
    expect(summary).toContain('21 events');
    expect(summary).toContain('3 buckets');
    expect(summary).toContain('busiest 13');
    expect(summary).toContain('2 failed');
    expect(summary).toContain('1 needed a person');
    expect(histogramSummary(histogramGeometry([], { width: 900, height: 100, spanHours: 24 }), '6h')).toBe(
      'Pipeline volume over 6h: no events.'
    );

    const title = bucketTitle(histogramBuckets(HISTOGRAM)[1], 24);
    expect(title).toContain('13 events');
    expect(title).toContain('gates 6');
    expect(title).toContain('2 failed');
    expect(title).toContain('1 needed a person');
  });
});

describe('ActivityHistogram', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws one bar per bucket above the chips, with a title and a summary', async () => {
    mockPipelineApi();
    renderPage();
    const band = await screen.findByTestId('activity-volume');
    const svg = await screen.findByTestId('activity-volume-svg');
    expect(svg).toHaveAttribute('role', 'img');
    await waitFor(() => expect(band.querySelectorAll('.activity-volume__bar')).toHaveLength(3));
    expect(svg.getAttribute('aria-label')).toContain('21 events');
    expect(band.querySelector('title')?.textContent).toContain('6 events');
    // The newest bucket is the one that pulses.
    expect(band.querySelectorAll('.activity-volume__bar.is-current')).toHaveLength(1);
    // A failure is the failed tone; red stays for what needed a person.
    expect(band.querySelectorAll('.activity-volume__failed')).toHaveLength(1);
    expect(band.querySelectorAll('.activity-volume__human')).toHaveLength(1);
  });

  it('is a filter: a legend key and a bar set the same chip, and set it back', async () => {
    mockPipelineApi();
    renderPage();
    const band = await screen.findByTestId('activity-volume');
    fireEvent.click(screen.getByRole('button', { name: 'Filter to gates' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Gates' })).toHaveAttribute('aria-pressed', 'true')
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Filter to gates' })).toHaveAttribute('aria-pressed', 'true')
    );
    // Everything else fades back so the chosen group reads on its own.
    expect(band.querySelectorAll('.activity-volume__seg.is-dimmed').length).toBeGreaterThan(0);

    // The same key again is the way back to every event.
    fireEvent.click(screen.getByRole('button', { name: 'Filter to gates' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    );

    const todos = band.querySelector('.activity-volume__seg.is-todos') as Element;
    fireEvent.click(todos);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
    );
  });

  it('holds its range in the URL and asks the server for it with the page scope', async () => {
    const calls = mockPipelineApi();
    renderPage('/activity?range=7d&family=jeryu');
    await screen.findByTestId('activity-volume');
    await waitFor(() =>
      expect(
        calls.some((call) => call.pathname === '/api/v1/events/histogram' && call.search.includes('range=7d'))
      ).toBe(true)
    );
    expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '6h' }));
    await waitFor(() =>
      expect(
        calls.some((call) => call.pathname === '/api/v1/events/histogram' && call.search.includes('range=6h'))
      ).toBe(true)
    );
    const scoped = calls.filter((call) => call.pathname === '/api/v1/events/histogram');
    expect(scoped.every((call) => call.search.includes('family=jeryu'))).toBe(true);
  });

  it('asks for the pinned repository, not the shell family, on a repository tab', async () => {
    const calls = mockPipelineApi();
    renderAt('/activity?family=jeryu', '/activity', <ActivityPage repo="jeryu/jeryu-web" />);
    await screen.findByTestId('activity-volume');
    await waitFor(() => {
      const scoped = calls.filter((call) => call.pathname === '/api/v1/events/histogram');
      expect(scoped.length).toBeGreaterThan(0);
      expect(scoped.every((call) => call.search.includes('repo=jeryu%2Fjeryu-web'))).toBe(true);
      expect(scoped.every((call) => !call.search.includes('family='))).toBe(true);
    });
  });

  it('does not tween or stagger when the reader asked for less motion', async () => {
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
      mockPipelineApi();
      renderPage();
      const band = await screen.findByTestId('activity-volume');
      await waitFor(() => expect(band.querySelectorAll('.activity-volume__bar')).toHaveLength(3));
      expect(band).toHaveClass('activity-volume--still');
      // No grow-in to stagger: every bar is drawn where it lands.
      for (const bar of band.querySelectorAll<HTMLElement>('.activity-volume__bar')) {
        expect(bar.style.animationDelay).toBe('');
      }
    } finally {
      window.matchMedia = original;
    }
  });

  it('leaves the band out on a server without the route, keeping the feed', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events/histogram' ? errorResponse(404, 'no such route') : undefined
    );
    renderPage();
    await screen.findByTestId('activity-event-12');
    await waitFor(() => expect(screen.queryByTestId('activity-volume')).toBeNull());
    expect(screen.queryByText(/no such route/)).toBeNull();
  });
});
