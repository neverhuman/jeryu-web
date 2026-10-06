// arrivalsModel.ts — which feed rows are new to the reader, and the hook that
// holds that answer for the two seconds a row is highlighted.
//
// The live tail merges rows into the same cache entry the first page filled,
// so a row's only cue that it just landed is that it was not there a render
// ago. What the reader has already looked at is kept in a ref: a filter change
// starts a fresh page (nothing is "new"), and "Load older" adds rows below
// everything seen, so neither animates. Only rows newer than the newest seq
// ever shown under these filters arrive.

import { useEffect, useRef, useState } from 'react';

/** How long a newly arrived row keeps its background wash. */
export const ARRIVAL_HIGHLIGHT_MS = 2_000;

/** The rows the reader has been shown under one set of filters. */
export interface SeenRows {
  seqs: ReadonlySet<number>;
  /** The highest seq ever shown, so older pages are not mistaken for new. */
  newest: number;
}

export function noRowsSeen(): SeenRows {
  return { seqs: new Set(), newest: 0 };
}

/**
 * The seqs that just landed: unseen, and newer than anything shown before.
 * Empty on the first page — a whole list appearing at once is not an arrival.
 */
export function arrivedSeqs(seen: SeenRows, seqs: readonly number[]): number[] {
  if (seen.seqs.size === 0) return [];
  return seqs.filter((seq) => seq > seen.newest && !seen.seqs.has(seq));
}

export function markRowsSeen(seen: SeenRows, seqs: readonly number[]): SeenRows {
  const next = new Set(seen.seqs);
  let newest = seen.newest;
  for (const seq of seqs) {
    next.add(seq);
    if (seq > newest) newest = seq;
  }
  return { seqs: next, newest };
}

/**
 * Tracks arrivals across renders. `filterId` identifies the list the seqs
 * belong to: when it changes the memory is dropped and the page that follows
 * is treated as a first page. `still` is the reader asking for less motion —
 * then nothing is ever reported as arriving and rows just appear.
 */
export function useArrivingRows(
  seqs: readonly number[],
  filterId: string,
  still = false
): ReadonlySet<number> {
  const seen = useRef<{ filterId: string; rows: SeenRows }>({ filterId, rows: noRowsSeen() });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [arriving, setArriving] = useState<ReadonlySet<number>>(() => new Set<number>());
  const key = seqs.join(',');
  // The effect runs on `key`, the list's identity; the rows themselves are
  // read through a ref so a re-render with the same list does not re-run it.
  const rows = useRef<readonly number[]>(seqs);
  rows.current = seqs;

  useEffect(() => {
    if (seen.current.filterId !== filterId) {
      seen.current = { filterId, rows: noRowsSeen() };
      setArriving((prev) => (prev.size === 0 ? prev : new Set<number>()));
    }
    const fresh = still ? [] : arrivedSeqs(seen.current.rows, rows.current);
    seen.current.rows = markRowsSeen(seen.current.rows, rows.current);
    if (fresh.length === 0) return;
    setArriving((prev) => new Set([...prev, ...fresh]));
    // Each batch fades on its own clock: a row that lands a second after
    // another keeps its full two seconds.
    const timer = setTimeout(() => {
      setArriving((prev) => {
        const next = new Set(prev);
        for (const seq of fresh) next.delete(seq);
        return next;
      });
    }, ARRIVAL_HIGHLIGHT_MS);
    timers.current.push(timer);
  }, [key, filterId, still]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current = [];
    },
    []
  );

  return arriving;
}
