// GlobalHeader.tsx — top bar (W-FE-01).
//
// Owns, left to right: the brand (the way home), where you are (inside a
// repository only), one search-or-jump control, the live pill and the account.
// Each child is its own file so the shell layout stays scannable.

import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { JeryuLogo } from '../components/brand/JeryuLogo';
import { useBootstrap } from '../hooks/useBootstrap';
import { useRealtimeStore } from '../stores/realtimeStore';
import { useCommandStore } from '../stores/commandStore';
import { RepoSwitcher } from './RepoSwitcher';
import { UserMenu } from './UserMenu';

export function GlobalHeader(): JSX.Element {
  const openPalette = useCommandStore((s) => s.open);
  const status = useRealtimeStore((s) => s.status);
  const bootstrap = useBootstrap();

  const liveLabel = liveLabelFor(status);
  const platformHint = navigator.userAgent.includes('Mac') ? '⌘ K' : 'Ctrl K';

  return (
    <div className="global-header">
      <Link to="/" className="global-header__brand" aria-label="JeRyu home">
        <JeryuLogo variant="header" />
      </Link>
      <RepoSwitcher />
      <span className="global-header__spacer" aria-hidden="true" />
      <button
        type="button"
        className="global-header__cmdk"
        onClick={() => openPalette()}
        // The name starts with the words on the button (WCAG 2.5.3).
        aria-label="Search or jump to: open the command palette"
        aria-keyshortcuts="Control+K Meta+K"
        aria-haspopup="dialog"
      >
        <Search size={14} aria-hidden="true" />
        <span className="global-header__cmdk-text">Search or jump to…</span>
        <span className="global-header__cmdk-hint" aria-hidden="true">
          {platformHint}
        </span>
      </button>
      {/* The pill is the way to the live feed; the words inside stay a status
          so a screen reader hears the connection change, not a link change. */}
      <Link
        to="/activity"
        className={`global-header__live global-header__live--${status}`}
        title={`${liveNameFor(status)}. Open Activity`}
        data-testid="live-pill"
      >
        <span className="global-header__live-dot" aria-hidden="true" />
        <span
          className="global-header__live-text"
          role="status"
          aria-atomic="true"
          aria-label={liveNameFor(status)}
        >
          {liveLabel}
        </span>
      </Link>
      <UserMenu
        login={bootstrap.data?.viewer.login ?? 'Loading…'}
        displayName={bootstrap.data?.viewer.display_name ?? null}
      />
    </div>
  );
}

/** The pill in words, for a reader who cannot see a green dot. */
export function liveNameFor(status: string): string {
  switch (status) {
    case 'open':
      return 'Live updates connected';
    case 'connecting':
      return 'Live updates connecting';
    case 'reconnecting':
      return 'Live updates reconnecting';
    case 'closed':
      return 'Live updates offline: pages refresh on their own timers';
    default:
      return 'Live updates idle';
  }
}

function liveLabelFor(status: string): string {
  switch (status) {
    case 'open':
      return 'Live';
    case 'connecting':
      return 'Connecting…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'closed':
      return 'Offline';
    default:
      return 'Idle';
  }
}
