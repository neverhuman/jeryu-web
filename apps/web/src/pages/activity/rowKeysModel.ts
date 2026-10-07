// rowKeysModel.ts — where the keyboard is in the event list. `j`/`k` (and the
// arrows once focus is inside the list) carry a visible focus from row to row,
// Enter or `o` expands the row it rests on, and `/` opens More filters at its
// first field.
//
// The keys are read straight off `keydown` rather than through the shortcut
// registry, because two of them have to stay polite: Enter belongs to whatever
// button the reader is actually on, and the arrows belong to the page's
// scrolling until the list itself has focus. The registry still prints them,
// told about them through `useShortcutHelp`.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { claimKey, isTypingInTextField, useShortcutHelp } from '../../hooks/useKeyboard';

/**
 * The row `delta` steps from `current`, stopping at the ends of the list
 * rather than wrapping — a reader holding `j` should arrive at the oldest row
 * on the page and stay there, not reappear at the top. With no row yet, a step
 * down starts at the newest and a step up at the oldest.
 */
export function stepSeq(
  seqs: readonly number[],
  current: number | null,
  delta: number
): number | null {
  if (seqs.length === 0) return null;
  const at = current === null ? -1 : seqs.indexOf(current);
  if (at === -1) return delta > 0 ? seqs[0] : seqs[seqs.length - 1];
  const next = at + delta;
  if (next < 0 || next >= seqs.length) return seqs[at];
  return seqs[next];
}

/**
 * The tabindex for a control on a row's own line — its toggle, the link in its
 * summary. A hundred rows with two stops each is two hundred presses of Tab to
 * cross the list, so only the row the keyboard rests on offers its controls to
 * Tab; the others are reached by walking to them with `j`/`k` first. Outside a
 * keyboard-walked list (`focused` not given at all) nothing is taken away.
 *
 * What a row opens is not covered: a reader who asked for the detail asked for
 * its copy buttons and links too, and there are only ever a few open rows.
 */
export function insideRowTabIndex(
  focused: boolean | undefined,
  tabStop: boolean
): number | undefined {
  if (focused === undefined) return undefined;
  return focused || tabStop ? undefined : -1;
}

/** The keys this list answers, as the help overlay prints them. */
const ROW_KEY_HELP = [
  { combo: 'j', label: 'Next event (Down with the list focused)', group: 'Activity' },
  { combo: 'k', label: 'Previous event (Up with the list focused)', group: 'Activity' },
  { combo: 'enter', label: 'Expand or collapse the focused event', group: 'Activity' },
  { combo: 'o', label: 'Expand or collapse the focused event', group: 'Activity' },
  { combo: '/', label: 'Open More filters', group: 'Activity' },
] as const;

export interface ActivityRowKeys {
  /** The event the keyboard rests on, or null until the first `j`/`k`. */
  focused: number | null;
  /** A row took the pointer or the Tab key: the keyboard follows it there. */
  rest: (seq: number) => void;
}

export function useActivityRowKeys({
  seqs,
  list,
  enabled,
  onToggle,
  onOpenFilters,
}: {
  /** The events on the page, newest first: the order `j` walks. */
  seqs: readonly number[];
  /** The `<ol>` the rows are in: how "the list has focus" is answered. */
  list: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** Expand or collapse this event. */
  onToggle: (seq: number) => void;
  /** Open More filters and put the caret in its first field. */
  onOpenFilters: () => void;
}): ActivityRowKeys {
  useShortcutHelp(enabled ? ROW_KEY_HELP : []);
  const [focused, setFocused] = useState<number | null>(null);
  // The listener is registered once per page, so what it reads has to be the
  // latest render's, not the one it closed over.
  const latest = useRef({ seqs, onToggle, onOpenFilters });
  latest.current = { seqs, onToggle, onOpenFilters };
  const focusedRef = useRef<number | null>(focused);
  // Only a key moves DOM focus. A row that happens to become the resting place
  // some other way (a click) must not pull focus off what the reader clicked.
  const takeFocus = useRef(false);

  const put = useCallback((seq: number | null, byKey: boolean): void => {
    focusedRef.current = seq;
    setFocused(seq);
    if (byKey) takeFocus.current = true;
  }, []);

  const move = useCallback(
    (delta: number): void => {
      const next = stepSeq(latest.current.seqs, focusedRef.current, delta);
      if (next === null) return;
      put(next, true);
    },
    [put]
  );

  const rest = useCallback((seq: number): void => put(seq, false), [put]);

  // The row the keyboard left for (a filter change, a released pill) can be
  // gone from the list; the focus goes back to nowhere rather than to a seq
  // that is not on the page.
  const seqKey = seqs.join(',');
  useEffect(() => {
    if (focusedRef.current !== null && !latest.current.seqs.includes(focusedRef.current)) {
      put(null, false);
    }
  }, [seqKey, put]);

  // After the row that is focused has rendered: hand it the DOM focus, so a
  // screen reader reads it and the page scrolls it into view.
  useEffect(() => {
    if (!takeFocus.current) return;
    takeFocus.current = false;
    if (focused === null) return;
    const row = list.current?.querySelector<HTMLElement>(`[data-testid="activity-event-${focused}"]`);
    row?.focus();
  }, [focused, list]);

  useEffect(() => {
    if (!enabled) return () => {};
    // Capture, so `/` is answered before the shell's own binding for it and
    // can claim the key; the rest of these keys are nobody else's.
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingInTextField(event.target)) return;
      const inList = event.target instanceof Node && list.current?.contains(event.target) === true;
      switch (event.key) {
        case 'j':
          move(1);
          break;
        case 'k':
          move(-1);
          break;
        case 'ArrowDown':
          if (!inList) return;
          move(1);
          break;
        case 'ArrowUp':
          if (!inList) return;
          move(-1);
          break;
        case 'Enter':
        case 'o': {
          const seq = focusedRef.current;
          // Enter answers only when the row itself is what has focus: on the
          // toggle, or on a link inside a row, Enter is still that button's.
          if (seq === null || (event.key === 'Enter' && !isRow(event.target))) return;
          latest.current.onToggle(seq);
          break;
        }
        case '/':
          if (event.shiftKey) return;
          claimKey(event);
          latest.current.onOpenFilters();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, list, move]);

  return { focused, rest };
}

/** True when the event's target is a row of the list, not something inside one. */
function isRow(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.tagName === 'LI';
}
