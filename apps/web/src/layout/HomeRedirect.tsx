// HomeRedirect.tsx — where `/` (and a finished login) lands.
//
// Admins land on "Needs you", the list of everything waiting on a person.
// That list is admin-only server-side, so every other role lands on the
// repositories index: the one page every signed-in viewer may read, on any
// install, without the shell knowing a thing about which families live there.
//
// Either way the landing keeps the family this tab carries: opening `/` in a
// second tab, or coming back through login, must not quietly widen the scope
// back to every family (see components/family/FamilyScopeProvider).

import { Navigate } from 'react-router-dom';

import { withFamilyScope } from '../components/family/familyScope';
import { readRememberedFamily } from '../components/family/FamilyScopeProvider';
import { useAuth } from '../hooks/useAuth';

export const NEEDS_YOU_PATH = '/needs-you';
export const REPOS_HOME_PATH = '/repos';

export function homePathFor(user: { role?: string | null } | null | undefined): string {
  const home = user?.role === 'admin' ? NEEDS_YOU_PATH : REPOS_HOME_PATH;
  return withFamilyScope(home, readRememberedFamily());
}

export function HomeRedirect(): JSX.Element {
  const { user } = useAuth();
  return <Navigate to={homePathFor(user)} replace />;
}
