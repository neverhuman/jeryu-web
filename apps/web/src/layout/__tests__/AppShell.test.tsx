import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommandStore } from '../../stores/commandStore';
import { AppShell, isPublicRepoPath, returnPathFrom } from '../AppShell';
import { NAV_DESTINATIONS } from '../navDestinations';

interface AuthStub {
  isPending: boolean;
  user: { role: string; mustChangePassword?: boolean } | null;
  logout?: { isPending: boolean; isSuccess: boolean; reset: ReturnType<typeof vi.fn> };
}

let auth: AuthStub = { isPending: false, user: null };

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    ...auth,
    logout: auth.logout ?? { isPending: false, isSuccess: false, reset: vi.fn() },
  }),
}));

// The shell's children own their own tests; here they only mark where they render.
vi.mock('../GlobalHeader', () => ({
  GlobalHeader: ({ onOpenNav }: { onOpenNav?: () => void }) => (
    <div data-testid="global-header">
      {onOpenNav ? (
        <button type="button" aria-label="Open navigation" onClick={onOpenNav} />
      ) : null}
    </div>
  ),
}));
vi.mock('../LeftNav', () => ({ LeftNav: () => <nav aria-label="Primary" /> }));
vi.mock('../LiveActivityDock', () => ({ LiveActivityDock: () => <div data-testid="dock" /> }));
vi.mock('../StatusBar', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));
vi.mock('../CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../../components/KeyboardShortcutsOverlay', () => ({
  KeyboardShortcutsOverlay: () => null,
}));
vi.mock('../../pages/boot/BootScreen', () => ({
  BootScreen: ({
    initialMode,
    initialAuthOpen,
    returnTo,
  }: {
    initialMode: string;
    initialAuthOpen: boolean;
    returnTo?: string | null;
  }) => (
    <div
      data-testid="boot"
      data-mode={initialMode}
      data-open={String(initialAuthOpen)}
      data-return={returnTo ?? ''}
    />
  ),
}));
vi.mock('../../pages/AuthPage', () => ({
  AuthPage: ({ forcePasswordChange }: { forcePasswordChange?: boolean }) => (
    <div data-testid="auth-page" data-force={String(!!forcePasswordChange)} />
  ),
}));

// Node 26 defines a global localStorage that is undefined without a backing
// file and shadows jsdom's, so the test brings its own Storage.
function makeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function Where(): JSX.Element {
  const { pathname, search, hash } = useLocation();
  return <p data-testid="where">{`${pathname}${search}${hash}`}</p>;
}

// The shell renders <ScrollRestoration />, which only a data router answers,
// so the test drives the same createMemoryRouter the app's own router is.
function renderAt(path: string): void {
  const router = createMemoryRouter(
    [{ element: <AppShell />, children: [{ path: '*', element: <Where /> }] }],
    { initialEntries: [path] }
  );
  render(<RouterProvider router={router} />);
}

function press(key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  });
}

describe('AppShell', () => {
  beforeEach(() => {
    auth = { isPending: false, user: { role: 'admin' } };
    useCommandStore.setState({ isOpen: false, query: '', commands: [] });
    Object.defineProperty(window, 'localStorage', { configurable: true, value: makeStorage() });
    // jsdom has no layout, so scroll restoration has nothing to call.
    window.scrollTo = vi.fn();
  });

  it('shows a loading message while the account resolves', () => {
    auth = { isPending: true, user: null };
    renderAt('/repos');
    expect(screen.getByText('Loading account…')).toBeTruthy();
    expect(screen.queryByTestId('global-header')).toBeNull();
  });

  it('signed out, shows the boot screen with the auth panel open on /signup', () => {
    auth = { isPending: false, user: null };
    renderAt('/signup');
    const boot = screen.getByTestId('boot');
    expect(boot.dataset.mode).toBe('signup');
    expect(boot.dataset.open).toBe('true');
  });

  it('finishes logout on the public story and consumes its redirect there', () => {
    const reset = vi.fn();
    auth = { isPending: false, user: null, logout: { isPending: false, isSuccess: true, reset } };
    renderAt('/settings');
    const boot = screen.getByTestId('boot');
    expect(boot.dataset.open).toBe('false');
    expect(reset).toHaveBeenCalled();
  });

  it('does not start a login redirect while logout publishes its result', () => {
    auth = { isPending: false, user: null, logout: { isPending: true, isSuccess: false, reset: vi.fn() } };
    renderAt('/settings');
    expect(screen.getByText('Logging out…')).toBeTruthy();
    expect(screen.queryByTestId('boot')).toBeNull();
  });

  it('signed out on /, shows the story with the auth panel closed', () => {
    auth = { isPending: false, user: null };
    renderAt('/');
    const boot = screen.getByTestId('boot');
    expect(boot.dataset.mode).toBe('login');
    expect(boot.dataset.open).toBe('false');
  });

  it('signed out on a deep link, opens login and remembers the destination', () => {
    auth = { isPending: false, user: null };
    renderAt('/repos/jeryu/jeryu/jeryu-deploy/pulls/7?tab=files#c3');
    const boot = screen.getByTestId('boot');
    expect(boot.dataset.open).toBe('true');
    expect(boot.dataset.mode).toBe('login');
    expect(boot.dataset.return).toBe('/repos/jeryu/jeryu/jeryu-deploy/pulls/7?tab=files#c3');
  });

  it('signed out on a repository page, shows it in the public frame', () => {
    auth = { isPending: false, user: null };
    renderAt('/repos/jeryu/jeryu/jeryu-deploy/blob/main/README.md');
    expect(screen.getByTestId('public-repo-shell')).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe(
      '/repos/jeryu/jeryu/jeryu-deploy/blob/main/README.md'
    );
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe(
      `/login?next=${encodeURIComponent('/repos/jeryu/jeryu/jeryu-deploy/blob/main/README.md')}`
    );
    expect(screen.queryByTestId('global-header')).toBeNull();
    expect(screen.queryByTestId('boot')).toBeNull();
  });

  it('reads the front page and files of a repository as public, nothing else', () => {
    expect(isPublicRepoPath('/repos/jeryu/jeryu/jeryu-deploy')).toBe(true);
    expect(isPublicRepoPath('/repos/jeryu/jeryu/jeryu-deploy/')).toBe(true);
    expect(isPublicRepoPath('/repos/jeryu/jeryu/jeryu-deploy/tree/main/docs')).toBe(true);
    expect(isPublicRepoPath('/repos/jeryu/jeryu/jeryu-deploy/code')).toBe(true);
    expect(isPublicRepoPath('/repos/jeryu/jeryu/jeryu-deploy/settings')).toBe(false);
    expect(isPublicRepoPath('/repos/jeryu/jeryu/jeryu-deploy/agents')).toBe(false);
    expect(isPublicRepoPath('/repos/jeryu/jeryu/jeryu-deploy/pulls/7')).toBe(false);
    expect(isPublicRepoPath('/repos/family/jeryu-split/x')).toBe(false);
    expect(isPublicRepoPath('/repos/jeryu/jeryu')).toBe(false);
    expect(isPublicRepoPath('/repos')).toBe(false);
  });

  it('signed in on /login?next=, lands on the remembered page', () => {
    auth = { isPending: false, user: { role: 'user' } };
    renderAt(`/login?next=${encodeURIComponent('/work?family=jeryu#add')}`);
    expect(screen.getByTestId('where').textContent).toBe('/work?family=jeryu#add');
  });

  it('ignores a next that would leave the app or loop to login', () => {
    expect(returnPathFrom('?next=//evil.example/x')).toBeNull();
    expect(returnPathFrom('?next=%2F%5Cevil.example')).toBeNull();
    expect(returnPathFrom('?next=https://evil.example')).toBeNull();
    expect(returnPathFrom('?next=/login?next=/x')).toBeNull();
    expect(returnPathFrom('')).toBeNull();
    expect(returnPathFrom('?next=%2Factivity')).toBe('/activity');
    auth = { isPending: false, user: { role: 'admin' } };
    renderAt('/login?next=//evil.example');
    expect(screen.getByTestId('where').textContent).toBe('/needs-you');
  });

  it('signed in, sends /login home', () => {
    renderAt('/login');
    expect(screen.getByTestId('where').textContent).toBe('/needs-you');
  });

  // Needs you is admin-only server-side, so another role is sent to the
  // repositories index — the one home that exists on every install.
  it('signed in as another role, sends /login to the repositories index', () => {
    auth = { isPending: false, user: { role: 'user' } };
    renderAt('/login');
    expect(screen.getByTestId('where').textContent).toBe('/repos');
  });

  it('forces the password change before anything else', () => {
    auth = { isPending: false, user: { role: 'user', mustChangePassword: true } };
    renderAt('/repos');
    expect(screen.getByTestId('auth-page').dataset.force).toBe('true');
    expect(screen.queryByTestId('global-header')).toBeNull();
  });

  it('renders the shell around the route and registers palette commands', () => {
    renderAt('/work');
    expect(screen.getByTestId('global-header')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    expect(screen.getByTestId('status-bar')).toBeTruthy();
    expect(screen.getByRole('main').contains(screen.getByTestId('where'))).toBe(true);
    expect(useCommandStore.getState().commands.length).toBeGreaterThan(0);
  });

  it('skip link moves focus to the main content', () => {
    renderAt('/work');
    fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(document.activeElement?.id).toBe('main-content');
  });

  it('collapses and expands the sidebar from the button and mod+b', () => {
    renderAt('/work');
    const shell = document.querySelector('.app-shell');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(shell?.classList.contains('app-shell--sidebar-collapsed')).toBe(true);
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();

    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    press('b', mac ? { metaKey: true } : { ctrlKey: true });
    expect(shell?.classList.contains('app-shell--sidebar-collapsed')).toBe(false);
  });

  it('remembers the collapsed sidebar across a reload', () => {
    renderAt('/work');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    cleanup();
    renderAt('/work');
    expect(document.querySelector('.app-shell')?.classList.contains('app-shell--sidebar-collapsed')).toBe(
      true
    );
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
  });

  it('opens the nav drawer from the header, and closes it on Escape and on arrival', () => {
    renderAt('/work');
    expect(screen.queryByTestId('nav-drawer')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByTestId('nav-drawer')).toBeTruthy();

    press('Escape');
    expect(screen.queryByTestId('nav-drawer')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(screen.queryByTestId('nav-drawer')).toBeNull();
  });

  it('opens the palette on / but not on ?', () => {
    renderAt('/work');
    press('?', { shiftKey: true });
    expect(useCommandStore.getState().isOpen).toBe(false);
    press('/');
    expect(useCommandStore.getState().isOpen).toBe(true);
  });

  it('g-chords navigate to every destination in the registry', () => {
    renderAt('/work');
    for (const destination of NAV_DESTINATIONS) {
      const [, letter] = destination.shortcut.split(' ');
      press('g');
      press(letter);
      expect(screen.getByTestId('where').textContent, destination.shortcut).toBe(
        destination.path
      );
    }
  });

  it('still answers the chord a destination used to have', () => {
    renderAt('/work');
    for (const destination of NAV_DESTINATIONS) {
      for (const alias of destination.aliases ?? []) {
        press('g');
        press(alias.split(' ')[1]);
        expect(screen.getByTestId('where').textContent, alias).toBe(destination.path);
      }
    }
  });

  it('binds no shortcuts while signed out', () => {
    auth = { isPending: false, user: null };
    renderAt('/work');
    press('/');
    expect(useCommandStore.getState().isOpen).toBe(false);
  });
});
