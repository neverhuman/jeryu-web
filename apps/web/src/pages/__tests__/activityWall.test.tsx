// activityWall.test.tsx — wall mode's polish: the clock, the volume band and
// the token panel under the counters, the pointer that goes after five seconds
// of quiet, and the walk back to the newest row after a minute of it.

import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import {
  WALL_CURSOR_IDLE_MS,
  WALL_TOP_IDLE_MS,
  wallClockText,
  wallDateText,
  wallIdleState,
} from '../activity/wallModel';
import { mockPipelineApi } from './pipelinePageHelpers';
import { renderAt } from './shiftPageHelpers';

function renderPage(path = '/activity?wall=1'): void {
  renderAt(path, '/activity', <ActivityPage />);
}

/** A reader who asked the OS to minimize motion, for one test. */
function withReducedMotion(): () => void {
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
  return () => {
    window.matchMedia = original;
  };
}

describe('wallIdleState', () => {
  it('holds both steps until their own quiet is up', () => {
    expect(wallIdleState(0)).toEqual({ cursorHidden: false, atTop: false });
    expect(wallIdleState(WALL_CURSOR_IDLE_MS - 1)).toEqual({ cursorHidden: false, atTop: false });
  });

  it('takes the pointer at five seconds and returns to the top at a minute', () => {
    expect(wallIdleState(WALL_CURSOR_IDLE_MS)).toEqual({ cursorHidden: true, atTop: false });
    expect(wallIdleState(WALL_TOP_IDLE_MS)).toEqual({ cursorHidden: true, atTop: true });
  });

  it('puts a minute of quiet after five seconds of it', () => {
    expect(WALL_CURSOR_IDLE_MS).toBeLessThan(WALL_TOP_IDLE_MS);
    expect(WALL_TOP_IDLE_MS).toBe(60_000);
  });
});

describe('the wall clock', () => {
  const at = new Date('2026-09-19T18:07:42Z');

  it('says the hour and the minute, and leaves the seconds off', () => {
    // The suite's zone is America/New_York: 18:07 UTC is 14:07 there.
    expect(wallClockText(at)).toBe('14:07');
  });

  it('says the weekday, the day and the zone under the digits', () => {
    expect(wallDateText(at)).toMatch(/^Sat 19 Sep · /);
  });

  it('has nothing to say about an instant it cannot read', () => {
    expect(wallDateText(new Date(NaN))).toBe('');
  });
});

describe('Activity wall mode', () => {
  beforeEach(() => {
    // The wall scrolls itself; jsdom has no scrolling, so the page's own guard
    // would skip it. Give it the method and watch what it is asked for.
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('carries the clock, the band and the token panel under the counters', async () => {
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');

    const clock = screen.getByTestId('activity-wall-clock');
    expect(clock.querySelector('time')).toHaveAttribute('dateTime');
    expect(clock.textContent).toMatch(/\d\d:\d\d/);
    // The subtitle and the row key are desk furniture: the wall has the clock.
    expect(screen.queryByTestId('activity-legend')).not.toBeInTheDocument();

    const page = screen.getByTestId('activity-page');
    const band = screen.getByTestId('activity-volume');
    const usage = await screen.findByTestId('activity-usage');
    const counters = screen.getByTestId('activity-counters');
    // Counters first, then the band, then what it cost, then the feed.
    const order = [...page.querySelectorAll('*')];
    expect(order.indexOf(counters)).toBeLessThan(order.indexOf(band));
    expect(order.indexOf(band)).toBeLessThan(order.indexOf(usage));
    expect(order.indexOf(usage)).toBeLessThan(order.indexOf(screen.getByTestId('activity-event-12')));
  });

  it('leaves the band and the panel out on a server without their paths', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events/histogram' || req.pathname === '/api/v1/usage'
        ? new Response('', { status: 404 })
        : undefined
    );
    renderPage();
    await screen.findByTestId('activity-event-12');
    expect(screen.queryByTestId('activity-volume')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-usage')).not.toBeInTheDocument();
    // The clock needs no server at all.
    expect(screen.getByTestId('activity-wall-clock')).toBeInTheDocument();
  });

  it('takes the pointer away after five seconds and gives it back on a move', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');
    const page = screen.getByTestId('activity-page');
    expect(page.className).not.toContain('activity--no-cursor');

    await act(async () => {
      vi.advanceTimersByTime(WALL_CURSOR_IDLE_MS);
    });
    expect(screen.getByTestId('activity-page').className).toContain('activity--no-cursor');

    await act(async () => {
      fireEvent(window, new Event('pointermove'));
    });
    expect(screen.getByTestId('activity-page').className).not.toContain('activity--no-cursor');
  });

  it('walks back to the newest row after a minute of quiet, and not before', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');
    const scrolled = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;
    // The page already puts the newest row in view when the feed arrives; the
    // idle walk is whatever happens after that.
    scrolled.mockClear();

    // Well into the quiet, and the wall has not moved yet: the pointer goes
    // long before the screen does.
    await act(async () => {
      vi.advanceTimersByTime(WALL_CURSOR_IDLE_MS * 2);
    });
    expect(scrolled).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(WALL_TOP_IDLE_MS);
    });
    expect(scrolled).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  });

  it('starts the minute over when someone touches the wall', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');
    const scrolled = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;
    scrolled.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(WALL_TOP_IDLE_MS - 1_000);
      fireEvent(window, new Event('wheel'));
      vi.advanceTimersByTime(2_000);
    });
    expect(scrolled).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(WALL_TOP_IDLE_MS);
    });
    expect(scrolled).toHaveBeenCalledTimes(1);
  });

  it('jumps rather than glides for a reader who asked for less motion', async () => {
    const restore = withReducedMotion();
    try {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mockPipelineApi();
      renderPage();
      await screen.findByTestId('activity-event-12');
      const scrolled = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;
      scrolled.mockClear();

      await act(async () => {
        vi.advanceTimersByTime(WALL_TOP_IDLE_MS);
      });
      expect(scrolled).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    } finally {
      restore();
    }
  });

  it('leaves the desk page its pointer and its place', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPipelineApi();
    renderPage('/activity');
    await screen.findByTestId('activity-event-12');
    const scrolled = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;
    scrolled.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(WALL_TOP_IDLE_MS * 2);
    });
    expect(scrolled).not.toHaveBeenCalled();
    expect(screen.getByTestId('activity-page').className).not.toContain('activity--no-cursor');
    expect(screen.queryByTestId('activity-wall-clock')).not.toBeInTheDocument();
  });
});
