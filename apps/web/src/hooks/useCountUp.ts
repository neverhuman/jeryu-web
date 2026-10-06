// useCountUp.ts — a number that travels to its new value instead of jumping.
//
// Used by the Activity summary strip, whose counters change under the reader
// while they watch: the motion is what says "this one went up". It starts at
// the first value rather than at zero, so a page load is not an animation, and
// a change mid-tween continues from where the number is now.
//
// `still` is the caller's `prefers-reduced-motion`: the value simply updates.

import { useEffect, useRef, useState } from 'react';

/** How long a number takes to reach its new value. */
export const COUNT_UP_MS = 600;

/** Fast at first, settling at the end: the eye follows the landing, not the start. */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

export function useCountUp(value: number, still = false): number {
  const [shown, setShown] = useState(value);
  // Where the number is right now, so an interrupting change starts there.
  const at = useRef(value);

  useEffect(() => {
    if (still || typeof requestAnimationFrame !== 'function') {
      at.current = value;
      setShown(value);
      return;
    }
    const from = at.current;
    if (from === value) return;
    const clock = (): number => (typeof performance === 'object' ? performance.now() : Date.now());
    const started = clock();
    let frame = requestAnimationFrame(function step(): void {
      const t = (clock() - started) / COUNT_UP_MS;
      const next = t >= 1 ? value : from + (value - from) * easeOutCubic(t);
      at.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, still]);

  return shown;
}
