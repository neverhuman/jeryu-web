// AppShell.tsx — 2-column mission-control layout with collapsible sidebar.
//
//   ┌────────────────────────────────────────────────────┐
//   │ <GlobalHeader />                                    │
//   ├──────────┬─────────────────────────────────────────┤
//   │ <LeftNav  │ <Outlet />                              │
//   │   />      ├─────────────────────────────────────────┤
//   │           │ <LiveActivityDock /> (collapsible)      │
//   ├──────────┴─────────────────────────────────────────┤
//   │ <StatusBar />                                       │
//   └────────────────────────────────────────────────────┘
//
// Shell-level shortcuts (`⌘K` palette, `?` help) are wired here so they
// outlive any route change.

import { useState, useCallback } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { CommandPalette } from './CommandPalette';
import { GlobalHeader } from './GlobalHeader';
import { LeftNav } from './LeftNav';
import { LiveActivityDock } from './LiveActivityDock';
import { StatusBar } from './StatusBar';
import { useCommandStore } from '../stores/commandStore';
import { useKeyboardShortcut } from '../hooks/useKeyboard';
import { KeyboardShortcutsOverlay } from '../components/KeyboardShortcutsOverlay';
import { useShellCommands } from './useShellCommands';
import { LoadingState } from '../components/state';
import { useAuth } from '../hooks/useAuth';
import { AuthPage } from '../pages/AuthPage';
import { BootScreen } from '../pages/boot/BootScreen';
import { NEEDS_YOU_PATH, homePathFor } from './HomeRedirect';
import { PublicRepoShell } from './PublicRepoShell';

import './AppShell.css';
import { IN_FLIGHT_PATH } from '../pages/pullRoomModel';

const AUTH_PATHS = new Set(['/login', '/signup']);

/**
 * The in-app path a `?next=` names, or null when it is missing or could leave
 * the app (`//host`, `/\\host`, an absolute URL) or would loop back to login.
 */
export function returnPathFrom(search: string): string | null {
  const next = new URLSearchParams(search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return null;
  }
  const pathname = next.split(/[?#]/, 1)[0];
  return AUTH_PATHS.has(pathname) ? null : next;
}

/**
 * A repository page a signed-out visitor may open: the front page and its
 * files (`blob`, `tree`, `code`). The API serves those for public
 * repositories; a private one sends the visitor on to login.
 */
export function isPublicRepoPath(pathname: string): boolean {
  const match = /^\/repos\/([^/]+)\/[^/]+\/[^/]+(?:\/([^/]+)(?:\/.*)?)?\/?$/.exec(pathname);
  if (!match || match[1] === 'family') return false;
  const sub = match[2];
  return sub === undefined || sub === 'blob' || sub === 'tree' || sub === 'code';
}

export function AppShell(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const openPalette = useCommandStore((s) => s.open);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const authRouteMode = location.pathname === '/signup' ? 'signup' : 'login';
  const isAuthRoute = AUTH_PATHS.has(location.pathname);
  const returnTo = isAuthRoute ? returnPathFrom(location.search) : null;

  // Register navigation commands so the palette is non-empty on first render.
  useShellCommands();

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  useKeyboardShortcut(
    'mod+k',
    () => {
      openPalette();
    },
    { label: 'Open command palette', group: 'Navigation', enabled: !!auth.user }
  );

  useKeyboardShortcut(
    '/',
    (event) => {
      // Ignore Shift+/ ("?") so it opens the shortcuts overlay cleanly. There
      // is no server-side search; "/" opens the palette, the one place that
      // finds things, as the header box beside it does.
      if (event.shiftKey) return;
      event.preventDefault();
      openPalette();
    },
    { label: 'Open command palette', group: 'Navigation', enabled: !!auth.user }
  );

  useKeyboardShortcut('mod+b', toggleSidebar, {
    label: 'Toggle sidebar',
    group: 'Navigation',
    enabled: !!auth.user,
  });

  useKeyboardShortcut('g d', () => navigate(NEEDS_YOU_PATH), {
    label: 'Go to Needs you',
    group: 'Navigation',
    enabled: !!auth.user,
  });
  useKeyboardShortcut('g r', () => navigate('/repos'), {
    label: 'Go to Repositories',
    group: 'Navigation',
    enabled: !!auth.user,
  });
  useKeyboardShortcut('g w', () => navigate('/work'), {
    label: 'Go to Work',
    group: 'Navigation',
    enabled: !!auth.user,
  });
  useKeyboardShortcut('g m', () => navigate(IN_FLIGHT_PATH), {
    label: 'Go to In flight',
    group: 'Navigation',
    enabled: !!auth.user,
  });
  useKeyboardShortcut('g f', () => navigate('/runners'), {
    label: 'Go to Runners',
    group: 'Navigation',
    enabled: !!auth.user,
  });
  useKeyboardShortcut('g a', () => navigate('/activity'), {
    label: 'Go to Activity',
    group: 'Navigation',
    enabled: !!auth.user,
  });
  useKeyboardShortcut('g l', () => navigate('/releases'), {
    label: 'Go to Releases',
    group: 'Navigation',
    enabled: !!auth.user,
  });
  useKeyboardShortcut('g i', () => navigate('/intelligence'), {
    label: 'Go to Intelligence',
    group: 'Navigation',
    enabled: !!auth.user,
  });
  useKeyboardShortcut('g t', () => navigate('/shared-tools'), {
    label: 'Go to Shared tools',
    group: 'Navigation',
    enabled: !!auth.user,
  });
  useKeyboardShortcut('g s', () => navigate('/settings'), {
    label: 'Go to Settings',
    group: 'Navigation',
    enabled: !!auth.user,
  });

  if (auth.isPending) {
    return (
      <main className="auth-page">
        <LoadingState title="Loading account…" variant="message" />
      </main>
    );
  }

  if (!auth.user) {
    // A public repository reads without an account.
    if (isPublicRepoPath(location.pathname)) {
      return <PublicRepoShell />;
    }
    // Any other deep link opened signed out goes to login and remembers where
    // it was headed; `/` keeps the story landing.
    if (!isAuthRoute && location.pathname !== '/') {
      const next = `${location.pathname}${location.search}${location.hash}`;
      return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
    }
    return (
      <BootScreen
        initialMode={authRouteMode}
        initialAuthOpen={isAuthRoute}
        returnTo={returnTo}
      />
    );
  }

  if (isAuthRoute) {
    return <Navigate to={returnTo ?? homePathFor(auth.user)} replace />;
  }

  if (auth.user.mustChangePassword) {
    return <AuthPage forcePasswordChange />;
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? ' app-shell--sidebar-collapsed' : ''}`}>
      {/* First tab stop: thirteen controls precede the content otherwise. */}
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="app-shell__header">
        <GlobalHeader />
      </header>
      {/* The nav inside names the landmark; a second label announced it twice. */}
      <div className="app-shell__leftnav">
        <LeftNav />
        <button
          type="button"
          className="app-shell__sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={`${sidebarCollapsed ? 'Expand' : 'Collapse'} sidebar (⌘B)`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="app-shell__sidebar-toggle-icon"
          >
            <path
              d="M10 4L6 8L10 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <main className="app-shell__main" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <LiveActivityDock />
      <StatusBar />
      <CommandPalette />
      <KeyboardShortcutsOverlay />
    </div>
  );
}
