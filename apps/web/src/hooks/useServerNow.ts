// useServerNow.ts — "now" on the forge's clock, ticking while something runs.
//
// Elapsed time is measured from a `startedAt` the forge stamped, so it has to
// be measured on the forge's clock: a laptop a minute fast would otherwise show
// every gate a minute further along. A response that carries `serverTime`
// gives the offset; one that does not (an older forge) leaves it at zero.

import { useEffect, useState } from 'react';

/** How far the forge's clock is ahead of this one, from one answer. */
export function serverOffsetMs(serverTime: string | null | undefined, receivedAtMs: number): number {
  if (!serverTime || !(receivedAtMs > 0)) return 0;
  const server = Date.parse(serverTime);
  return Number.isFinite(server) ? server - receivedAtMs : 0;
}

/**
 * The forge's "now", refreshed every `tickMs` while `ticking`. When nothing is
 * running it is the moment of the last answer, so idle pages do not re-render
 * each second.
 */
export function useServerNow(
  serverTime: string | null | undefined,
  receivedAtMs: number,
  ticking: boolean,
  tickMs = 1000
): number {
  const offset = serverOffsetMs(serverTime, receivedAtMs);
  const [localNow, setLocalNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return () => {};
    const timer = window.setInterval(() => setLocalNow(Date.now()), tickMs);
    return () => window.clearInterval(timer);
  }, [ticking, tickMs]);
  // A fresh answer is newer than the last tick until the next one lands.
  return (ticking ? Math.max(localNow, receivedAtMs) : receivedAtMs) + offset;
}
