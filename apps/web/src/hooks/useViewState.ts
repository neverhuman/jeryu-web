// useViewState.ts — the query string is where a page's view state lives, so
// what is on screen can be linked and the back button undoes what it looks
// like it undoes.
//
// The push/replace rule (README §6, "URL view state"):
//
//   push     Tab and view switches: a different thing to look at, so Back
//            returns to the one before it.
//   replace  Typing, filters and sort: the same view narrowed, so Back leaves
//            the page instead of walking a search box letter by letter.
//
// A value equal to the page's default is written as `null` and leaves the URL
// entirely, so the plain address is the default view.

import { useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Whether writing a value adds a history entry or overwrites the current one. */
export type ViewHistory = 'push' | 'replace';

/**
 * Parameters to write: a string sets one value, a list joins with commas, and
 * `null`, `''` or an empty list removes the parameter.
 */
export type ViewStateWrite = Record<string, string | readonly string[] | null>;

export interface ViewState {
  /** The parameter's value, or `fallback` (default `''`) when it is absent. */
  read(param: string, fallback?: string): string;
  /** The parameter read as the comma-separated list `write` stores. */
  readList(param: string): string[];
  /** Writes parameters, leaving the rest of the query string alone. */
  write(values: ViewStateWrite, history: ViewHistory): void;
}

export function useViewState(): ViewState {
  const [params, setParams] = useSearchParams();
  const shown = params.toString();
  // The router hands back the query string of the last committed render, and a
  // navigation of ours reaches the address bar before React renders it again.
  // A write therefore builds on the newest query string known — the one it
  // wrote last, until the router catches up — rather than the one its own
  // render saw, so a tab switch and the filter pressed straight after it
  // cannot drop each other's parameters. Any other navigation (Back, a link)
  // moves the query string off the one we wrote from, and the note is dropped.
  const written = useRef<{ from: string; to: string } | null>(null);
  if (written.current && written.current.from !== shown) written.current = null;
  const pending = written.current?.to;
  const latest = useRef(pending ?? shown);
  latest.current = pending ?? shown;
  return useMemo(
    () => {
      const base = new URLSearchParams(pending ?? shown);
      return {
        read: (param, fallback = '') => base.get(param) ?? fallback,
        readList: (param) => (base.get(param) ?? '').split(',').filter(Boolean),
        write: (values, history) => {
          const from = latest.current;
          const next = new URLSearchParams(from);
          for (const [param, value] of Object.entries(values)) {
            const text = typeof value === 'string' ? value : value?.join(',') ?? '';
            if (text === '') next.delete(param);
            else next.set(param, text);
          }
          written.current = { from: shown, to: next.toString() };
          latest.current = written.current.to;
          setParams(next, { replace: history === 'replace' });
        },
      };
    },
    [pending, shown, setParams]
  );
}
