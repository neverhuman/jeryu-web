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
// Below 720px there is no room beside the content: the LeftNav column leaves
// the layout and the header's menu button slides the same nav in over the page
// as an off-canvas drawer.
//
// Shell-level shortcuts (`⌘K` palette, `?` help) are wired here so they
// outlive any route change; the per-destination `g` chords come from
// NAV_DESTINATIONS through <NavShortcuts />.

import { useState, useCallback, useEffect } from 'react';
import { Navigate, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';

import { CommandPalette } from './CommandPalette';
import { GlobalHeader } from './GlobalHeader';
import { LeftNav } from './LeftNav';
import { NavShortcuts } from './NavShortcuts';
import { LiveActivityDock } from './LiveActivityDock';
import { StatusBar } from './StatusBar';
import { useCommandStore } from '../stores/commandStore';
import { useFocusMainOnNavigate, MAIN_CONTENT_ID } from '../hooks/useFocusMainOnNavigate';
import { useKeyboardShortcut } from '../hooks/useKeyboard';
import { KeyboardShortcutsOverlay } from '../components/KeyboardShortcutsOverlay';
import { useShellCommands } from './useShellCommands';
import { LoadingState } from '../components/state';
import { useAuth } from '../hooks/useAuth';
import { AuthPage } from '../pages/AuthPage';
import { BootScreen } from '../pages/boot/BootScreen';
import { homePathFor } from './HomeRedirect';
import { PublicRepoShell } from './PublicRepoShell';
import { readBrowserText, writeBrowserText } from '../storage/browserStorage';
import { FamilyScopeProvider } from '../components/family/FamilyScopeProvider';

import './AppShell.css';

const AUTH_PATHS = new Set(['/login', '/signup']);

/** Whether the operator collapsed the sidebar, so a reload keeps their choice. */
const SIDEBAR_COLLAPSED_KEY = 'jeryu.appShell.sidebarCollapsed.v1';

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
  const location = useLocation();
  const auth = useAuth();
  const authRouteMode = location.pathname === '/signup' ? 'signup' : 'login';
  const isAuthRoute = AUTH_PATHS.has(location.pathname);
  const returnTo = isAuthRoute ? returnPathFrom(location.search) : null;

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

  // The family scope wraps the whole shell: the header chip, the left nav, the
  // `g x` chords and the palette all read the one scope.
  return (
    <FamilyScopeProvider>
      <Shell />
    </FamilyScopeProvider>
  );
}

/** The signed-in shell: its layout, its commands and its shortcuts. */
function Shell(): JSX.Element {
  const location = useLocation();
  const auth = useAuth();
  const openPalette = useCommandStore((s) => s.open);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => readBrowserText('durable', SIDEBAR_COLLAPSED_KEY) === '1'
  );
  // Narrow viewports have no room beside the content: the nav is off-canvas
  // there, opened by the header's menu button.
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const authRouteMode = location.pathname === '/signup' ? 'signup' : 'login';
  const isAuthRoute = AUTH_PATHS.has(location.pathname);
  const returnTo = isAuthRoute ? returnPathFrom(location.search) : null;

  // Register navigation commands so the palette is non-empty on first render.
  useShellCommands(auth.user?.role === 'admin');

  // Arriving on a page puts the keyboard on it, not on the link behind it.
  useFocusMainOnNavigate();

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      writeBrowserText('durable', SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const closeNavDrawer = useCallback(() => {
    setNavDrawerOpen(false);
  }, []);

  // Following a link in the drawer has arrived: get out of the way.
  useEffect(closeNavDrawer, [closeNavDrawer, location.pathname]);

  useEffect(() => {
    if (!navDrawerOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeNavDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navDrawerOpen, closeNavDrawer]);

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
      // Ignore Shift+/ ("?") so it opens the shortcuts overlay cleanly. "/"
      // opens the palette: it jumps to pages and repositories from here, and
      // always offers the typed text to /search, which asks the server.
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

  return (
    <div className={`app-shell${sidebarCollapsed ? ' app-shell--sidebar-collapsed' : ''}`}>
      {/* First tab stop: thirteen controls precede the content otherwise. */}
      <a
        className="skip-link"
        href={`#${MAIN_CONTENT_ID}`}
        onClick={(event) => {
          event.preventDefault();
          document.getElementById(MAIN_CONTENT_ID)?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="app-shell__header">
        <GlobalHeader onOpenNav={() => setNavDrawerOpen(true)} />
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
      {navDrawerOpen ? (
        <div className="app-shell__drawer-layer">
          <button
            type="button"
            className="app-shell__drawer-backdrop"
            aria-label="Close navigation"
            onClick={closeNavDrawer}
          />
          {/* The nav at full width: every label and its badge read in full,
              which they cannot in a rail narrow enough to fit beside a phone. */}
          <div
            className="app-shell__drawer"
            role="dialog"
            aria-label="Navigation"
            data-testid="nav-drawer"
          >
            <LeftNav />
          </div>
        </div>
      ) : null}
      {/* One `g` chord per destination, bound only for a signed-in operator. */}
      <NavShortcuts />
      <main className="app-shell__main" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <Outlet />
      </main>
      <LiveActivityDock />
      <StatusBar />
      <CommandPalette />
      <KeyboardShortcutsOverlay />
      {/* The document is what scrolls: a push starts at the top, Back and
          Forward put the position the visitor left back. */}
      <ScrollRestoration />
    </div>
  );
}
