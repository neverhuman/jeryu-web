// AccountMenu.tsx — the top-right account control (W-FE-01).
//
// One button, named for whoever is signed in, opening one menu: Settings, the
// theme, the keyboard shortcuts, Help and — at the bottom, away from the rest
// — Log out. The header used to say "Logged in · name" beside a cog, which
// named the viewer twice and buried the way out at the foot of Settings.
//
// The menu is a real menu for the keyboard: Enter, Space or ↓ on the button
// opens it on its first item, ↑ ↓ Home End move, Escape and Tab close it and
// hand focus back to the button. The theme is a set of menuitemradio rows, so
// the chosen one is announced as chosen.

import { Cog, LifeBuoy, LogOut, Keyboard, Monitor, Moon, Sun, ToggleRight } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import { usePreferencesStore, type ThemePreference } from '../stores/preferencesStore';
import { useShortcutsStore } from '../stores/shortcutsStore';
import { HELP_PATH } from '../pages/helpPath';

interface AccountMenuProps {
  login: string;
  displayName: string | null;
}

const THEMES: { value: ThemePreference; label: string; icon: JSX.Element }[] = [
  { value: 'system', label: 'System', icon: <Monitor size={14} aria-hidden="true" /> },
  { value: 'light', label: 'Light', icon: <Sun size={14} aria-hidden="true" /> },
  { value: 'dark', label: 'Dark', icon: <Moon size={14} aria-hidden="true" /> },
  {
    value: 'high-contrast',
    label: 'High contrast',
    icon: <ToggleRight size={14} aria-hidden="true" />,
  },
];

/** A menu row that goes somewhere or does something, then closes the menu. */
function MenuItem({
  icon,
  label,
  onPick,
  close,
  testId,
  tone,
}: {
  icon: JSX.Element;
  label: string;
  onPick: () => void;
  close: () => void;
  testId: string;
  tone?: 'human';
}): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      className={`account-menu__item${tone ? ` account-menu__item--${tone}` : ''}`}
      data-testid={testId}
      onClick={() => {
        close();
        onPick();
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export function AccountMenu({ login, displayName }: AccountMenuProps): JSX.Element {
  const label = displayName ?? login;
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const theme = usePreferencesStore((s) => s.theme);
  const setTheme = usePreferencesStore((s) => s.setTheme);
  const openShortcuts = useShortcutsStore((s) => s.open);
  const { logout } = useAuth();
  const menuId = useId();
  const button = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  // Which item to put the keyboard on once the menu is rendered; null once it
  // has been put there, so a click inside does not pull focus back.
  const [focusAt, setFocusAt] = useState<number | null>(null);

  const close = (toButton = true): void => {
    setOpen(false);
    setFocusAt(null);
    if (toButton) button.current?.focus();
  };

  const items = (): HTMLElement[] =>
    Array.from(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);

  useEffect(() => {
    if (!open || focusAt === null) return;
    const all = items();
    const index = focusAt < 0 ? all.length - 1 : Math.min(focusAt, all.length - 1);
    all[index]?.focus();
    setFocusAt(null);
  }, [open, focusAt]);

  // A click anywhere else closes the menu, as every menu does.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menu.current?.contains(target) || button.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        all[(at + 1) % all.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        all[(at - 1 + all.length) % all.length]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        all[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        all[all.length - 1]?.focus();
        break;
      case 'Tab':
        // Tab leaves the menu rather than walking it: the control it lands on
        // is the next one in the header, not the next row in here.
        close(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="global-header__account account-menu" data-testid="account-menu">
      <button
        type="button"
        ref={button}
        className={`account-menu__trigger${open ? ' is-open' : ''}`}
        data-testid="account-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account: ${label}`}
        onClick={() => {
          setOpen((was) => !was);
          setFocusAt(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
            setFocusAt(0);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setFocusAt(-1);
          }
        }}
      >
        <Cog size={14} aria-hidden="true" />
        <span className="account-menu__name">{label}</span>
      </button>
      {open ? (
        <div
          className="account-menu__panel"
          role="menu"
          id={menuId}
          aria-label={`Account: ${label}`}
          ref={menu}
          // The menu itself takes the keyboard only so its own handler is
          // reached before an item inside it has been focused.
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
        >
          <MenuItem
            icon={<Cog size={14} aria-hidden="true" />}
            label="Settings"
            testId="account-menu-settings"
            close={() => close(false)}
            onPick={() => navigate('/settings')}
          />
          <div className="account-menu__group" role="group" aria-label="Theme">
            <span className="account-menu__group-label" aria-hidden="true">
              Theme
            </span>
            {THEMES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={theme === option.value}
                className="account-menu__item account-menu__item--radio"
                data-testid={`account-menu-theme-${option.value}`}
                onClick={() => setTheme(option.value)}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
          <MenuItem
            icon={<Keyboard size={14} aria-hidden="true" />}
            label="Keyboard shortcuts"
            testId="account-menu-shortcuts"
            close={() => close(false)}
            onPick={() => openShortcuts()}
          />
          <MenuItem
            icon={<LifeBuoy size={14} aria-hidden="true" />}
            label="Help"
            testId="account-menu-help"
            close={() => close(false)}
            onPick={() => navigate(HELP_PATH)}
          />
          <MenuItem
            icon={<LogOut size={14} aria-hidden="true" />}
            label="Log out"
            testId="account-menu-logout"
            tone="human"
            close={() => close(false)}
            onPick={() => logout.mutate()}
          />
        </div>
      ) : null}
    </div>
  );
}
