// useTickingNow.ts — one clock a list can share.
//
// A page that shows relative times ("2 min ago") has to re-render as they age.
// Mounting a timer per row costs one timer per row and wakes them at different
// moments, so neighbouring rows disagree on what "now" is. This hook holds a
// single interval: the page calls it once and hands the instant down, and every
// row that reads it turns over together.

import { useEffect, useState } from 'react';

/** The current instant, refreshed every `periodMs` (30 s by default). */
export function useTickingNow(periodMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), periodMs);
    return () => clearInterval(id);
  }, [periodMs]);
  return now;
}
