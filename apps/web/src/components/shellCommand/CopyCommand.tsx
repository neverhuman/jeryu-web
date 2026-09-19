// CopyCommand.tsx — a shell line shown in full with a copy-to-clipboard control.
//
// Used where the next step happens off-site (a deploy command, a todoq call).
// The command is always visible so it can be read or selected when the
// clipboard API is unavailable.

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import './CopyCommand.css';

export interface CopyCommandProps {
  command: string;
  /** Names the command for assistive tech, e.g. "deploy command". */
  label: string;
}

export function CopyCommand({ command, label }: CopyCommandProps): JSX.Element {
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

  return (
    <span className="copy-command">
      <code className="copy-command__text">{command}</code>
      <button
        type="button"
        className="copy-command__button"
        onClick={() => void copy()}
        aria-label={`Copy ${label}`}
      >
        {state === 'copied' ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
        <span role="status">
          {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy' : 'Copy'}
        </span>
      </button>
    </span>
  );
}
