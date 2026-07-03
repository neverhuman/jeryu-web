// UserMenu.tsx — top-right identity chip (W-FE-01).
//
// Renders an inline identity chip. The theme / sign-out / profile dropdown
// is layered on by a later work package.

import { LogOut, User } from 'lucide-react';

import { useAuth } from '../hooks/useAuth';

interface UserMenuProps {
  login: string;
  displayName: string | null;
}

export function UserMenu({ login, displayName }: UserMenuProps): JSX.Element {
  const label = displayName ?? login;
  const { logout } = useAuth();
  return (
    <button
      type="button"
      className="global-header__user"
      aria-label={`Account menu for ${label}`}
      title="Logout"
      onClick={() => logout.mutate()}
    >
      <User size={14} aria-hidden="true" />
      <span className="global-header__user-name">{label}</span>
      <LogOut size={14} aria-hidden="true" />
    </button>
  );
}
