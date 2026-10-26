// activityWall.test.tsx — wall mode: the screen it asks the shell for and the
// ways back out of it, the rows it shuts, the clock, the volume band and the
// token panel under the counters, the pointer that goes after five seconds of
// quiet, and the walk back to the newest row after a minute of it.

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import {
  WALL_CURSOR_IDLE_MS,
  WALL_TOP_IDLE_MS,
  wallClockText,
  wallDateText,
  wallIdleState,
} from '../activity/wallModel';
import { FullScreenProvider, useFullScreenShell } from '../../layout/fullScreen';
import { mockPipelineApi } from './pipelinePageHelpers';
import { renderAt } from './shiftPageHelpers';

/** What the page has asked the shell for, newest last. */
const takenScreens: boolean[] = [];

/** Stands in for the shell's layout: it only records what the page asked for. */
function ScreenProbe(): null {
  const taken = useFullScreenShell();
  useEffect(() => {
    if (takenScreens[takenScreens.length - 1] !== taken) takenScreens.push(taken);
  }, [taken]);
  return null;
}

/** Whether the page is asking for the whole screen right now. */
function screenTaken(): boolean {
  return takenScreens[takenScreens.length - 1] ?? false;
}

function renderPage(path = '/activity?wall=1'): void {
  takenScreens.length = 0;
  renderAt(
    path,
    '/activity',
    <FullScreenProvider>
      <ActivityPage />
      <ScreenProbe />
    </FullScreenProvider>
  );
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


describe('the wall and the shell around it', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the shell for the whole screen, and only while the wall is up', async () => {
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');
    expect(screenTaken()).toBe(true);
  });

  it('leaves the shell its furniture at the desk', async () => {
    mockPipelineApi();
    renderPage('/activity');
    await screen.findByTestId('activity-event-12');
    expect(screenTaken()).toBe(false);
    // Never asked and then taken back: the desk page simply does not ask.
    expect(takenScreens.filter((taken) => taken)).toEqual([]);
  });

  it('shuts a row the reader had open before the wall went up', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    mockPipelineApi();
    renderPage('/activity');
    await screen.findByTestId('activity-event-12');
    fireEvent.click(screen.getByRole('button', { name: 'Log for event 10' }));
    expect(screen.getByTestId('activity-event-log-10')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Enter wall mode' }));
    await waitFor(() => expect(screen.getByTestId('activity-wall-clock')).toBeInTheDocument());
    // The detail is gone: a wall shows the feed, not where a reader was.
    expect(screen.queryByTestId('activity-event-log-10')).not.toBeInTheDocument();

    // …and leaving the wall gives the reader their row back.
    fireEvent.click(screen.getByRole('link', { name: 'Leave wall mode' }));
    await waitFor(() => expect(screen.getByTestId('activity-event-log-10')).toBeInTheDocument());
  });

  it('leaves the wall on Esc, which needs no pointer', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');
    expect(screen.getByTestId('activity-wall-clock')).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByTestId('activity-wall-clock')).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Activity filters' })).toBeInTheDocument();
    expect(screenTaken()).toBe(false);
  });

  it('ignores Esc at the desk, where the key belongs to the page', async () => {
    mockPipelineApi();
    renderPage('/activity?kind=gate.');
    await screen.findByTestId('activity-event-10');
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.getByRole('region', { name: 'Activity filters' })).toBeInTheDocument();
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

  it('carries the clock and the band above the feed', async () => {
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');

    const clock = screen.getByTestId('activity-wall-clock');
    expect(clock.querySelector('time')).toHaveAttribute('dateTime');
    expect(clock.textContent).toMatch(/\d\d:\d\d/);
    // The subtitle and the row key are desk furniture: the wall has the clock.
    expect(screen.queryByTestId('activity-legend')).not.toBeInTheDocument();

    const page = screen.getByTestId('activity-page');
    const band = await screen.findByTestId('activity-volume');
    // No 24-hour tiles and no token panel: the band, then the feed.
    expect(screen.queryByTestId('activity-counters')).toBeNull();
    expect(screen.queryByTestId('activity-usage')).toBeNull();
    const order = [...page.querySelectorAll('*')];
    expect(order.indexOf(band)).toBeLessThan(order.indexOf(screen.getByTestId('activity-event-12')));
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
