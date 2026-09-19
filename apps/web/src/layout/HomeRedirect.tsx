// HomeRedirect.tsx — where `/` (and a finished login) lands.
//
// Admins land on "Needs you", the list of everything waiting on a person.
// That list is admin-only server-side, so other roles keep the split family
// browser as their home.

import { Navigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

export const NEEDS_YOU_PATH = '/needs-you';
export const FAMILY_HOME_PATH = '/repos/family/jeryu-split';

export function homePathFor(user: { role?: string | null } | null | undefined): string {
  return user?.role === 'admin' ? NEEDS_YOU_PATH : FAMILY_HOME_PATH;
}

export function HomeRedirect(): JSX.Element {
  const { user } = useAuth();
  return <Navigate to={homePathFor(user)} replace />;
}
