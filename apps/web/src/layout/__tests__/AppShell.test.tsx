import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommandStore } from '../../stores/commandStore';
import { AppShell } from '../AppShell';

interface AuthStub {
  isPending: boolean;
  user: { role: string; mustChangePassword?: boolean } | null;
}

let auth: AuthStub = { isPending: false, user: null };

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => auth,
}));

// The shell's children own their own tests; here they only mark where they render.
vi.mock('../GlobalHeader', () => ({ GlobalHeader: () => <div data-testid="global-header" /> }));
vi.mock('../LeftNav', () => ({ LeftNav: () => <nav aria-label="Primary" /> }));
vi.mock('../LiveActivityDock', () => ({ LiveActivityDock: () => <div data-testid="dock" /> }));
vi.mock('../StatusBar', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));
vi.mock('../CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../../components/KeyboardShortcutsOverlay', () => ({
  KeyboardShortcutsOverlay: () => null,
}));
vi.mock('../../pages/boot/BootScreen', () => ({
  BootScreen: ({ initialMode, initialAuthOpen }: { initialMode: string; initialAuthOpen: boolean }) => (
    <div data-testid="boot" data-mode={initialMode} data-open={String(initialAuthOpen)} />
  ),
}));
vi.mock('../../pages/AuthPage', () => ({
  AuthPage: ({ forcePasswordChange }: { forcePasswordChange?: boolean }) => (
    <div data-testid="auth-page" data-force={String(!!forcePasswordChange)} />
  ),
}));

function Where(): JSX.Element {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<Where />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
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

  it('signed out elsewhere, shows the boot screen closed on login', () => {
    auth = { isPending: false, user: null };
    renderAt('/repos');
    const boot = screen.getByTestId('boot');
    expect(boot.dataset.mode).toBe('login');
    expect(boot.dataset.open).toBe('false');
  });

  it('signed in, sends /login home', () => {
    renderAt('/login');
    expect(screen.getByTestId('where').textContent).toBe('/needs-you');
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

  it('opens the palette on / but not on ?', () => {
    renderAt('/work');
    press('?', { shiftKey: true });
    expect(useCommandStore.getState().isOpen).toBe(false);
    press('/');
    expect(useCommandStore.getState().isOpen).toBe(true);
  });

  it('g-chords navigate between destinations', () => {
    renderAt('/work');
    press('g');
    press('r');
    expect(screen.getByTestId('where').textContent).toBe('/repos');
    press('g');
    press('s');
    expect(screen.getByTestId('where').textContent).toBe('/settings');
  });

  it('binds no shortcuts while signed out', () => {
    auth = { isPending: false, user: null };
    renderAt('/work');
    press('/');
    expect(useCommandStore.getState().isOpen).toBe(false);
  });
});
