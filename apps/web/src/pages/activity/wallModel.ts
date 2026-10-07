// wallModel.ts — wall mode's clock and what the screen does when it is left
// alone.
//
// The wall is read from across a room, by nobody in particular: there is no
// pointer on it and no reader to interrupt. So two things happen after a while
// of quiet. The pointer goes away after 5 seconds, because a cursor parked in
// the middle of the feed is the only thing on the screen that is not news. And
// after a minute the screen walks back to the top, so whoever scrolled down to
// look at an older row does not leave the wall stuck there for the rest of the
// day.
//
// Both are undone by the first sign of a person: a move, a key, a wheel or a
// touch starts the quiet over. Asked for less motion, the walk back to the top
// is a jump instead — it still happens, it just does not animate.

import { useEffect, useRef, useState, type RefObject } from 'react';

import { clockText, zoneLabel } from '../../format/when';

/** How long the wall waits before it takes the pointer away. */
export const WALL_CURSOR_IDLE_MS = 5_000;
/** How long it waits before it scrolls itself back to the newest row. */
export const WALL_TOP_IDLE_MS = 60_000;

/** The signs of a person at the wall: each one starts the quiet over. Scrolling
 *  is read from the wheel and the touch, never from the `scroll` event, which
 *  the walk back to the top would otherwise raise against itself. */
export const WALL_WAKE_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export interface WallIdleState {
  /** The pointer is hidden: nothing has happened for 5 seconds. */
  cursorHidden: boolean;
  /** The screen should be back at the newest row: a minute of quiet. */
  atTop: boolean;
}

/** Which of the two steps `idleMs` of quiet has reached. */
export function wallIdleState(idleMs: number): WallIdleState {
  return {
    cursorHidden: idleMs >= WALL_CURSOR_IDLE_MS,
    atTop: idleMs >= WALL_TOP_IDLE_MS,
  };
}

/** `14:02` — the wall's clock, big enough that the seconds would only be
 *  motion. Pair it with `wallZoneText()` under the digits. */
export function wallClockText(at: number | Date): string {
  return clockText(at).slice(0, 5);
}

/** `Today · 19 Sep 2026 · CEST` is the list's; the clock says the weekday and
 *  the zone it is telling the time in. */
export function wallDateText(at: number | Date): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} · ${zoneLabel()}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface WallIdleOptions {
  /** Only the wall does this: the desk page has a reader and a pointer. */
  enabled: boolean;
  /** `prefers-reduced-motion`: the walk back to the top becomes a jump. */
  still: boolean;
  /** The marker at the top of the page the wall returns to. */
  top: RefObject<Element | null>;
}

/**
 * Runs the wall's two idle steps and reports whether the pointer is hidden.
 * The return to the top is a side effect, timed off the same quiet, so a wall
 * someone is standing at keeps both the cursor and their place.
 */
export function useWallIdle({ enabled, still, top }: WallIdleOptions): boolean {
  const [cursorHidden, setCursorHidden] = useState(false);
  // The effect is armed once per mode; the element and the motion preference
  // are read through a ref so a changed preference does not restart the quiet.
  const latest = useRef({ still, top });
  latest.current = { still, top };

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setCursorHidden(false);
      return;
    }
    let cursorTimer: ReturnType<typeof setTimeout> | undefined;
    let topTimer: ReturnType<typeof setTimeout> | undefined;
    const returnToTop = (): void => {
      const element = latest.current.top.current;
      if (typeof element?.scrollIntoView !== 'function') return;
      element.scrollIntoView({ block: 'start', behavior: latest.current.still ? 'auto' : 'smooth' });
    };
    const arm = (): void => {
      cursorTimer = setTimeout(() => setCursorHidden(true), WALL_CURSOR_IDLE_MS);
      topTimer = setTimeout(returnToTop, WALL_TOP_IDLE_MS);
    };
    const disarm = (): void => {
      clearTimeout(cursorTimer);
      clearTimeout(topTimer);
    };
    const wake = (): void => {
      setCursorHidden(false);
      disarm();
      arm();
    };
    arm();
    for (const name of WALL_WAKE_EVENTS) {
      window.addEventListener(name, wake, { passive: true });
    }
    return () => {
      disarm();
      for (const name of WALL_WAKE_EVENTS) window.removeEventListener(name, wake);
    };
  }, [enabled]);

  return enabled && cursorHidden;
}
