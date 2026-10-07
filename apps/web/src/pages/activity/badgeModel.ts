// badgeModel.ts — the count the tab wears while nobody is looking at it.
//
// A needs_human event is the one row on this feed that asks for a person, and
// the tail can bring it in while the reader is in another tab. The page has no
// notification permission and does not want one: the tab's own title is the
// whole signal. While the tab is hidden, each needs_human row the tail lands
// adds one to a count the title states — "(2) Activity · JeRyu" — and coming
// back to the tab is the reader having seen it, so the count goes away.
//
// What counts as "arrived" is the same answer the arrival wash uses: a row
// newer than anything ever shown under these filters. So a first page, an
// older page and a filter change add nothing, and a tab opened straight into
// the background does not badge its own first load. Arrival is read off the
// whole feed and only then narrowed to the rows that want a person: a feed
// whose first page happens to hold no needs_human row has still had its first
// page, and the next one through the tail is an arrival.

import { useEffect, useRef, useState } from 'react';

import { arrivedSeqs, markRowsSeen, noRowsSeen, type SeenRows } from './arrivalsModel';

/** `"(2) Activity"`, or the name alone when nothing arrived unseen. */
export function badgedTitle(name: string, count: number): string {
  return count > 0 ? `(${count}) ${name}` : name;
}

/**
 * How many of `badged` are among the seqs that just arrived in `seqs`.
 * `badged` is a subset of `seqs`: the rows worth a count, in feed order.
 */
export function badgedArrivals(
  seen: SeenRows,
  seqs: readonly number[],
  badged: readonly number[]
): number {
  const wanted = new Set(badged);
  return arrivedSeqs(seen, seqs).filter((seq) => wanted.has(seq)).length;
}

/** Whether this document is in a tab nobody is currently looking at. */
export function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'hidden'
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const read = (): void => setHidden(document.visibilityState === 'hidden');
    read();
    document.addEventListener('visibilitychange', read);
    return () => document.removeEventListener('visibilitychange', read);
  }, []);

  return hidden;
}

/**
 * How many of `badged` the tail brought in while the tab was hidden. `seqs` is
 * the whole feed — what "arrived" is measured against — and `badged` the rows
 * worth counting. `filterId` identifies the list: a new one starts over, so
 * rows that are new only because the filters changed are not an arrival. Zero
 * whenever the tab is visible — being here is having seen them.
 */
export function useAwayCount(
  seqs: readonly number[],
  badged: readonly number[],
  filterId: string
): number {
  const hidden = useDocumentHidden();
  const seen = useRef({ filterId, rows: noRowsSeen() });
  const [count, setCount] = useState(0);
  // The effect runs on the list's identity; the rows come through a ref so a
  // re-render with the same list does not re-run it.
  const rows = useRef<readonly number[]>(seqs);
  rows.current = seqs;
  const wanted = useRef<readonly number[]>(badged);
  wanted.current = badged;
  const key = seqs.join(',');

  useEffect(() => {
    if (seen.current.filterId !== filterId) seen.current = { filterId, rows: noRowsSeen() };
    const fresh = badgedArrivals(seen.current.rows, rows.current, wanted.current);
    seen.current.rows = markRowsSeen(seen.current.rows, rows.current);
    if (!hidden || fresh === 0) return;
    setCount((prev) => prev + fresh);
  }, [key, filterId, hidden]);

  useEffect(() => {
    if (!hidden) setCount((prev) => (prev === 0 ? prev : 0));
  }, [hidden]);

  return hidden ? count : 0;
}
