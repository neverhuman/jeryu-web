// RepoSwitcher.tsx — where you are, and the way to every repository (W-FE-01).
//
// It names the repository in the address bar (`owner/name`, never an internal
// id) and links to the repository list. It used to open the command palette,
// which the search box beside it already does and which cannot switch repos.

import { FolderGit2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

/** `owner/name` of the repository a path is inside, or null. */
export function repoNameFromPath(pathname: string): string | null {
  const match = /^\/repos\/(?!family\/|new$)[^/]+\/([^/]+)\/([^/]+)/.exec(pathname);
  if (!match) return null;
  try {
    return `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`;
  } catch {
    return `${match[1]}/${match[2]}`;
  }
}

export function RepoSwitcher(): JSX.Element {
  const { pathname } = useLocation();
  const current = repoNameFromPath(pathname);

  return (
    <Link
      to="/repos"
      className="repo-switcher"
      aria-label={current ? `${current}: switch repository` : 'All repositories'}
      title={current ? 'Switch repository' : 'All repositories'}
    >
      <FolderGit2 size={14} aria-hidden="true" />
      <span className="repo-switcher__label">{current ?? 'Repositories'}</span>
    </Link>
  );
}
