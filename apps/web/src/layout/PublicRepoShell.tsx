// PublicRepoShell.tsx — the frame a signed-out visitor reads a public
// repository in: the brand, a sign-in link that returns here, and the page.
// No navigation, palette or live dock: those need an account.

import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';

import { JeryuLogo } from '../components/brand/JeryuLogo';
import { MAIN_CONTENT_ID } from '../hooks/useFocusMainOnNavigate';

import './AppShell.css';

export function PublicRepoShell(): JSX.Element {
  const { pathname, search, hash } = useLocation();
  const next = encodeURIComponent(`${pathname}${search}${hash}`);
  return (
    <div className="public-shell" data-testid="public-repo-shell">
      <header className="public-shell__header">
        <Link to="/" aria-label="JeRyu home">
          <JeryuLogo />
        </Link>
        <Link className="public-shell__signin" to={`/login?next=${next}`}>
          Sign in
        </Link>
      </header>
      <main className="app-shell__main" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <Outlet />
      </main>
      {/* Moving between a repository's files restores the position Back returns to. */}
      <ScrollRestoration />
    </div>
  );
}
