// AccountMenu.test.tsx — the account control: one menu, opened by the
// keyboard, with Log out at the bottom of it.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccountMenu } from '../AccountMenu';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { useShortcutsStore } from '../../stores/shortcutsStore';

const logout = { mutate: vi.fn(), isPending: false };

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ logout }),
}));

function Where(): JSX.Element {
  const { pathname } = useLocation();
  return <p data-testid="where">{pathname}</p>;
}

function renderMenu(): void {
  render(
    <MemoryRouter initialEntries={['/repos']}>
      <AccountMenu login="operator" displayName="Ada Operator" />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  logout.mutate.mockClear();
  useShortcutsStore.setState({ isOpen: false });
  usePreferencesStore.getState().reset();
});

describe('AccountMenu', () => {
  it('names the viewer once and says nothing else until it is opened', () => {
    renderMenu();
    expect(screen.getAllByText('Ada Operator')).toHaveLength(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens from the keyboard onto its first item and holds Log out last', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Account: Ada Operator' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const menu = screen.getByRole('menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('account-menu-settings')).toHaveFocus();

    const items = Array.from(menu.querySelectorAll('[role^="menuitem"]'));
    expect(items.map((item) => item.textContent)).toEqual([
      'Settings',
      'System',
      'Light',
      'Dark',
      'High contrast',
      'Keyboard shortcuts',
      'Help',
      'Log out',
    ]);
    expect(items[items.length - 1]).toHaveAttribute('data-testid', 'account-menu-logout');
  });

  it('walks the items with the arrow keys and closes on Escape', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Account: Ada Operator' });
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(screen.getByTestId('account-menu-logout')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(screen.getByTestId('account-menu-settings')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('logs out from the menu, so the way out is not only inside Settings', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Account: Ada Operator' }));
    fireEvent.click(screen.getByTestId('account-menu-logout'));
    expect(logout.mutate).toHaveBeenCalledTimes(1);
  });

  it('goes to Settings and to Help, and opens the shortcuts overlay', async () => {
    renderMenu();
    const open = (): void => {
      fireEvent.click(screen.getByRole('button', { name: 'Account: Ada Operator' }));
    };

    open();
    fireEvent.click(screen.getByTestId('account-menu-shortcuts'));
    expect(useShortcutsStore.getState().isOpen).toBe(true);

    open();
    fireEvent.click(screen.getByTestId('account-menu-help'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/help'));

    open();
    fireEvent.click(screen.getByTestId('account-menu-settings'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/settings'));
  });

  it('sets the theme from the menu and says which one is set', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Account: Ada Operator' }));
    const dark = screen.getByTestId('account-menu-theme-dark');
    fireEvent.click(dark);
    expect(usePreferencesStore.getState().theme).toBe('dark');
    // The theme rows stay open: picking one is a choice you can see.
    expect(screen.getByTestId('account-menu-theme-dark')).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });
});
