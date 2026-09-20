// CopyCommand.tsx — a shell line shown in full with a copy-to-clipboard control.
//
// Used where the next step happens off-site (a deploy command, a todoq call).
// The command is always visible so it can be read or selected when the
// clipboard API is unavailable. `where` is one muted line above it naming the
// machine and directory: it is read before the command, it describes the copy
// button for assistive tech, and it is never part of what is copied.

import { Check, Copy } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import './CopyCommand.css';

export interface CopyCommandProps {
  command: string;
  /** Names the command for assistive tech, e.g. "deploy command". */
  label: string;
  /** Where to run it, e.g. "Run on xbabe0, any directory". Shown, never copied. */
  where?: string | null;
}

export function CopyCommand({ command, label, where }: CopyCommandProps): JSX.Element {
  const whereId = useId();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

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
    }
  };

  const box = (
    <span className="copy-command">
      <code className="copy-command__text">{command}</code>
      <button
        type="button"
        className="copy-command__button"
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
