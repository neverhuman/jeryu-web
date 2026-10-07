// CopyButton.tsx — one control that puts a piece of text on the clipboard and
// says so for a moment.
//
// For text that is not worth showing in full next to its button (an event's
// JSON, a long query URL); where the line itself should be read, use
// `CopyCommand`, which shows it. When the clipboard refuses — no permission,
// no secure context — the button says "Copy failed" rather than pretending,
// and `fallback`, if given, is the text a reader can select by hand instead.

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import './CopyButton.css';

export interface CopyButtonProps {
  /** What lands on the clipboard. */
  text: string;
  /** Names what is copied for assistive tech, e.g. "event 10 as JSON". */
  label: string;
  /** Shown on the button; the icon alone when absent. */
  children?: React.ReactNode;
  /** Extra class for the page that places the button. */
  className?: string;
  testId?: string;
}

/** How long the button holds its answer before going back to "Copy". */
export const COPY_SAID_MS = 2_000;

export function CopyButton({ text, label, children, className, testId }: CopyButtonProps): JSX.Element {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return () => {};
    const timer = window.setTimeout(() => setState('idle'), COPY_SAID_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async (): Promise<void> => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  return (
    <button
      type="button"
      className={`copy-button${className ? ` ${className}` : ''}`}
      onClick={() => void copy()}
      aria-label={`Copy ${label}`}
      data-testid={testId}
    >
      {state === 'copied' ? <Check aria-hidden="true" size={12} /> : <Copy aria-hidden="true" size={12} />}
      <span role="status">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : children}
      </span>
    </button>
  );
}
