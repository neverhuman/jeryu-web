// UserMenu.tsx — top-right identity status and the way into Settings (W-FE-01).
//
// Settings lives here rather than in the left nav: it is about the account,
// not about the forge's work. Log out is at the bottom of the Settings page,
// so the header has no one-click destructive control.

import { Cog } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface UserMenuProps {
  login: string;
  displayName: string | null;
}

export function UserMenu({ login, displayName }: UserMenuProps): JSX.Element {
  const label = displayName ?? login;
  const { pathname } = useLocation();
  const active = pathname === '/settings';
  return (
    <div className="global-header__account">
      <span className="global-header__user" aria-label={`Logged in as ${label}`}>
        <span className="global-header__user-prefix">Logged in</span>
        <span className="global-header__user-prefix" aria-hidden="true">
          ·
        </span>
        <span className="global-header__user-name">{label}</span>
      </span>
      <Link
        to="/settings"
        className={`global-header__settings${active ? ' is-active' : ''}`}
        aria-label="Settings"
        aria-current={active ? 'page' : undefined}
        title="Settings and log out"
      >
        <Cog size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}
