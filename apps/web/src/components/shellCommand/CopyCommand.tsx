// CopyCommand.tsx — a shell line shown in full with a copy-to-clipboard control.
//
// Used where the next step happens off-site (a deploy command, a todoq call).
// The command is always visible so it can be read or selected when the
// clipboard API is unavailable. `where` is one muted line above it naming the
// machine and directory: it is read before the command, it describes the copy
// button for assistive tech, and it is never part of what is copied.
//
// When the clipboard refuses, the command's text is selected in place, so the
// reader's own copy shortcut takes it.
//
// The command box scrolls when the line is longer than the row it sits in, so
// it is a tab stop: the command is reachable and readable without a mouse.

import { Check, Copy } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import './CopyCommand.css';

export interface CopyCommandProps {
  command: string;
  /** Names the command for assistive tech, e.g. "deploy command". */
  label: string;
  /** Where to run it, e.g. "Run on node-0, any directory". Shown, never copied. */
  where?: string | null;
}

export function CopyCommand({ command, label, where }: CopyCommandProps): JSX.Element {
  const whereId = useId();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const textRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (state === 'idle') return () => {};
    const timer = window.setTimeout(() => setState('idle'), 2_000);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async (): Promise<void> => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(command);
      setState('copied');
    } catch {
      setState('failed');
      selectText(textRef.current);
    }
  };

  const box = (
    <span className="copy-command">
      {/* The box scrolls when the command is longer than the row, so it is
          focusable: the command can be reached and read without a mouse. */}
      <code className="copy-command__text" tabIndex={0} ref={textRef}>
        {command}
      </code>
      <button
        type="button"
        className="copy-command__button"
        // Where a list row's one act is a command, `x` on that row copies it.
        data-list-action=""
        onClick={() => void copy()}
        aria-label={`Copy ${label}`}
        aria-describedby={where ? whereId : undefined}
      >
        {state === 'copied' ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
        <span role="status">
          {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy' : 'Copy'}
        </span>
      </button>
    </span>
  );
  if (!where) return box;
  return (
    <span className="copy-command-placed">
      <span id={whereId} className="copy-command__where" data-testid="copy-command-where">
        {where}
      </span>
      {box}
    </span>
  );
}

/** Select everything inside `node`, for a copy by hand. */
function selectText(node: HTMLElement | null): void {
  if (!node) return;
  // Focus first: moving focus afterwards can drop the selection again.
  node.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}
