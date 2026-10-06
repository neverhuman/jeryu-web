// olderModel.ts — fetching the next older page as the reader nears the end of
// the list.
//
// The feed is newest first, so "older" is always below: a reader on their way
// down the page wants the next page before they hit the bottom, not a button
// to press at it. A sentinel sits under the list and an IntersectionObserver
// asks for the next page while it is still a screen away, and a skeleton row
// stands where those events will land so the page does not look finished
// while it is still fetching.
//
// The button stays: it is the keyboard path, it is what a browser without an
// observer has, and it is how a reader retries after a failed page. So the
// sentinel only ever does what the button does, and never both at once.

import { useEffect, useRef, type RefObject } from 'react';

/** How far ahead of the sentinel a page is asked for. */
export const OLDER_AHEAD_PX = 400;

export interface OlderReach {
  /** False in wall mode, which auto-scrolls and never pages. */
  enabled: boolean;
  /** There is another page to fetch. */
  hasOlder: boolean;
  /** A page is already on its way. */
  loading: boolean;
  /** The last page failed: the reader retries with the button, not by scrolling. */
  failed: boolean;
}

/**
 * Whether a sentinel coming into view should ask for the next older page. A
 * failed page stops the automatic path: scrolling must not retry a broken
 * request once per frame.
 */
export function shouldLoadOlder(state: OlderReach): boolean {
  return state.enabled && state.hasOlder && !state.loading && !state.failed;
}

/**
 * Calls `load` when `target` comes within `OLDER_AHEAD_PX` of the viewport and
 * `state` says another page is wanted. Without an IntersectionObserver the
 * sentinel does nothing and the button is the only path.
 */
export function useOlderOnReach(
  target: RefObject<Element | null>,
  state: OlderReach,
  load: () => void
): void {
  // The feed hands back a fresh `loadOlder` and a fresh state each render; the
  // observer is set up once per element and reads the latest through refs.
  const latest = useRef({ state, load });
  latest.current = { state, load };

  // A page arriving does not move the sentinel, so an observer that already
  // reported it would stay quiet; each change of state starts a fresh one,
  // whose first callback reports where the sentinel is now.
  const { enabled, hasOlder, loading, failed } = state;
  useEffect(() => {
    const element = target.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (!shouldLoadOlder(latest.current.state)) return;
        latest.current.load();
      },
      { rootMargin: `0px 0px ${OLDER_AHEAD_PX}px 0px` }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [target, enabled, hasOlder, loading, failed]);
}
