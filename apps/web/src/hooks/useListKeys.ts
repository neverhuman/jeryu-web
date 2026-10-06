// useListKeys.ts — keyboard operation of a list of rows: `j`/`k` move, `o` or
// Enter open the row, `x` runs its one action.
//
// The rows a page shows are already marked up as rows, so the keys read the
// DOM rather than a second copy of the list in state: a row carries
// `data-list-row`, the thing `o` opens carries `data-list-open`, and the thing
// `x` presses carries `data-list-action` (`listRowProps`, `LIST_OPEN_PROP` and
// `LIST_ACTION_PROP` spell them). Moving focuses the row itself, so the focused
// row is the browser's own focus — a screen reader follows it, `Tab` carries on
// from it, and `data-list-focused` draws the ring that says where the keys are.
//
// `j`/`k` are bound here rather than through `useKeyboardShortcut` because
// Enter and `o` must stay the page's own keys everywhere else: they act only
// while a row holds focus, and the registry entries are registered without
// binding so the shortcut overlay still lists all four.

import { useEffect, useRef, type RefObject } from 'react';

import {
  isTypingInTextField,
  useOptionalKeyboardRegistry,
  type KeyboardShortcutDescriptor,
} from './useKeyboard';

/** Marks one row of a keyboard-operated list; focusable without a tab stop. */
export const listRowProps = { 'data-list-row': '', tabIndex: -1 } as const;

/** Put on the link a row's `o`/Enter opens (usually its title). */
export const LIST_OPEN_PROP = { 'data-list-open': '' } as const;

/** Put on the control a row's `x` presses (its one primary action). */
export const LIST_ACTION_PROP = { 'data-list-action': '' } as const;

const ROW = '[data-list-row]';
const FOCUSED = 'data-list-focused';

const LIST_SHORTCUTS: KeyboardShortcutDescriptor[] = [
  { combo: 'j', label: 'Next row in a list', group: 'Lists' },
  { combo: 'k', label: 'Previous row in a list', group: 'Lists' },
  { combo: 'o', label: 'Open the focused row', group: 'Lists' },
  { combo: 'enter', label: 'Open the focused row', group: 'Lists' },
  { combo: 'x', label: "Run the focused row's action", group: 'Lists' },
];

/**
 * The rows a reader can actually reach: not hidden, and not folded away inside
 * a closed `details` (the Needs you "worth a look" list is one). Read from the
 * markup rather than from layout, so it is the same answer in a test.
 */
function reachable(row: HTMLElement): boolean {
  if (row.hidden) return false;
  const folded = row.closest('details');
  return folded ? folded.open : true;
}

function visibleRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(ROW)).filter(reachable);
}

function focusRow(rows: HTMLElement[], index: number): void {
  for (const row of rows) row.removeAttribute(FOCUSED);
  const row = rows[index];
  if (!row) return;
  row.setAttribute(FOCUSED, 'true');
  row.focus({ preventScroll: true });
  if (typeof row.scrollIntoView === 'function') {
    row.scrollIntoView({ block: 'nearest' });
  }
}

/**
 * Attach the returned ref to the element that holds the rows. Every
 * `[data-list-row]` inside it is then reachable with `j`/`k`, whatever list or
 * lane it sits in, in the order the page renders them.
 */
export function useListKeys<T extends HTMLElement = HTMLDivElement>(options: {
  enabled?: boolean;
} = {}): RefObject<T | null> {
  const container = useRef<T | null>(null);
  const registerShortcut = useOptionalKeyboardRegistry()?.registerShortcut ?? null;
  const enabled = options.enabled !== false;

  useEffect(() => {
    if (!enabled || !registerShortcut) return () => {};
    const undo = LIST_SHORTCUTS.map((descriptor) => registerShortcut(descriptor));
    return () => {
      for (const off of undo) off();
    };
  }, [enabled, registerShortcut]);

  useEffect(() => {
    if (!enabled) return () => {};
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingInTextField(event.target)) return;
      const host = container.current;
      if (!host) return;
      const rows = visibleRows(host);
      if (rows.length === 0) return;
      const active = document.activeElement;
      const focused = rows.findIndex((row) => row === active);
      const key = event.key.toLowerCase();

      if (key === 'j' || key === 'k') {
        event.preventDefault();
        const step = key === 'j' ? 1 : -1;
        // No row has focus yet: `j` starts at the top, `k` at the bottom.
        const next =
          focused < 0
            ? key === 'j'
              ? 0
              : rows.length - 1
            : Math.min(rows.length - 1, Math.max(0, focused + step));
        focusRow(rows, next);
        return;
      }

      // The row's own keys: only while the row itself holds focus, so Enter
      // keeps activating a button or a link a reader tabbed to inside it.
      if (focused < 0) return;
      const row = rows[focused];
      const opens = key === 'o' || event.key === 'Enter';
      if (!opens && key !== 'x') return;
      const target = opens
        ? row.querySelector<HTMLElement>('[data-list-open]') ??
          row.querySelector<HTMLElement>('a[href]')
        : row.querySelector<HTMLElement>('[data-list-action]');
      if (!target) return;
      event.preventDefault();
      target.click();
    };

    // Focus left the rows (a click, a Tab out): the ring goes with it.
    const onFocusIn = (): void => {
      const host = container.current;
      if (!host) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.hasAttribute('data-list-row')) return;
      for (const row of host.querySelectorAll<HTMLElement>(ROW)) {
        row.removeAttribute(FOCUSED);
      }
    };
    window.addEventListener('focusin', onFocusIn);

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('focusin', onFocusIn);
    };
  }, [enabled]);

  return container;
}
