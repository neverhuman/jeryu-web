// holdModel.ts — holding tail rows above the fold until the reader asks for
// them.
//
// The feed is newest first, so every row the tail brings in is inserted at the
// top and pushes down whatever the reader is looking at. That is fine at the
// top of the page, where the new row is what they came for, and jarring
// anywhere else. So the page keeps a cutoff: the newest seq it has handed to
// the list. While the reader is anchored — scrolled to the top with no row
// opened — the cutoff follows the feed and rows insert as they land. Once they
// scroll away or open a row it stands still, newer rows wait behind a pill,
// and the pill's click moves it forward, which is also what gives those rows
// their arrival cue. Wall mode has no reader to disturb and never holds.

import { useCallback, useEffect, useRef, useState } from 'react';

/** A seq below everything the feed can produce: nothing has been shown yet. */
const NOTHING_SHOWN = 0;

/** The seqs at or below the cutoff, in the order they were given. */
export function shownSeqs(seqs: readonly number[], cutoff: number): number[] {
  return seqs.filter((seq) => seq <= cutoff);
}

/** The seqs waiting above the cutoff — what the pill counts. */
export function heldSeqs(seqs: readonly number[], cutoff: number): number[] {
  return seqs.filter((seq) => seq > cutoff);
}

/**
 * Where the cutoff goes when a list arrives. It only ever moves forward: an
 * older page merged under the list must not take rows back out of the feed.
 * Held, it stands still; anchored — or on a first page, which is the whole
 * list appearing at once — it jumps to the newest seq there is.
 */
export function nextCutoff(cutoff: number, seqs: readonly number[], anchored: boolean): number {
  const newest = seqs.reduce((top, seq) => (seq > top ? seq : top), NOTHING_SHOWN);
  if (cutoff === NOTHING_SHOWN || anchored) return Math.max(cutoff, newest);
  return cutoff;
}

export interface HeldRows {
  /** The seqs to render now, newest first as they came in. */
  shown: number[];
  /** How many rows are waiting above them. */
  heldCount: number;
  /** Hand the waiting rows to the list. */
  release: () => void;
}

/**
 * Splits a feed into what the reader sees and what waits for them.
 * `filterId` identifies the list: a new one starts over with nothing held.
 * `anchored` is the reader being in a place where a row may insert itself.
 * `enabled` false (wall mode) shows everything, always.
 */
export function useHeldRows(
  seqs: readonly number[],
  filterId: string,
  anchored: boolean,
  enabled = true
): HeldRows {
  const [cutoff, setCutoff] = useState(NOTHING_SHOWN);
  const state = useRef({ filterId, cutoff: NOTHING_SHOWN });
  // The effect runs on the list's identity, not on the array it was given.
  const rows = useRef<readonly number[]>(seqs);
  rows.current = seqs;
  const key = seqs.join(',');

  useEffect(() => {
    if (state.current.filterId !== filterId) {
      state.current = { filterId, cutoff: NOTHING_SHOWN };
      setCutoff(NOTHING_SHOWN);
    }
    const next = nextCutoff(state.current.cutoff, rows.current, anchored);
    if (next === state.current.cutoff) return;
    state.current.cutoff = next;
    setCutoff(next);
  }, [key, filterId, anchored]);

  const release = useCallback(() => {
    const next = nextCutoff(state.current.cutoff, rows.current, true);
    state.current.cutoff = next;
    setCutoff(next);
  }, []);

  if (!enabled) return { shown: [...seqs], heldCount: 0, release };
  // The cutoff is caught up by an effect, so the render that first sees a new
  // row would flash it unheld; `cutoff` from state is the one already applied.
  return { shown: shownSeqs(seqs, cutoff), heldCount: heldSeqs(seqs, cutoff).length, release };
}

/**
 * Whether the document is scrolled to its top. The pill only has to decide
 * "is the reader reading something below", so a few pixels of slack is enough
 * and saves a re-render per wheel notch near the top.
 */
export function useAtPageTop(slackPx = 8): boolean {
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const read = (): void => setAtTop((window.scrollY || 0) <= slackPx);
    read();
    window.addEventListener('scroll', read, { passive: true });
    return () => window.removeEventListener('scroll', read);
  }, [slackPx]);

  return atTop;
}
