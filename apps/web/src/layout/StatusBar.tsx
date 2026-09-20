// StatusBar.tsx — bottom strip (W-FE-01).
//
// Silent while live updates work: the header's pill already says "Live", and a
// strip of socket counters told an operator nothing. It appears only when the
// page has stopped hearing from the server, because then what is on screen may
// be stale, and says so in words.

import { useRealtimeStore } from '../stores/realtimeStore';

/** What to tell the reader, or null when there is nothing to tell. */
export function statusMessage(status: string, errorCode: string | null): string | null {
  if (status === 'reconnecting') return 'Live updates paused. Reconnecting…';
  if (status === 'closed') return 'Live updates are off. What you see may be out of date; reload to reconnect.';
  // An error while the socket is open has not stopped the page hearing from
  // the server, and this strip only speaks when it has.
  if (errorCode && status !== 'open') {
    return `Live updates reported a problem (${errorCode}).`;
  }
  return null;
}

export function StatusBar(): JSX.Element | null {
  const status = useRealtimeStore((s) => s.status);
  const lastError = useRealtimeStore((s) => s.lastError);
  const message = statusMessage(status, lastError?.code ?? null);
  if (!message) return null;

  return (
    <footer className="app-shell__status">
      <div className="status-bar" role="status" aria-live="polite" title={lastError?.message}>
        <span className="status-bar__pill">
          <span className={`status-bar__dot status-bar__dot--${status}`} aria-hidden="true" />
          {message}
        </span>
      </div>
    </footer>
  );
}
