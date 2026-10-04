// RepoSwitcher.tsx — where you are (W-FE-01).
//
// Inside a repository it names it (`owner/name`, never an internal id) and
// links to that repository's front page. Outside one it renders nothing: the
// left nav already has Repositories, and a second way there is one more thing
// to read. It used to open the command palette, which the search box beside it
// already does and which cannot switch repos.

import { FolderGit2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { repoUrl } from '../pages/repoBrowserModel';

const REPO_PATH = /^\/repos\/(?!family\/|new$)([^/]+)\/([^/]+)\/([^/]+)/;

/** `owner/name` of the repository a path is inside, or null. */
export function repoNameFromPath(pathname: string): string | null {
  const match = REPO_PATH.exec(pathname);
  if (!match) return null;
  try {
    return `${decodeURIComponent(match[2])}/${decodeURIComponent(match[3])}`;
  } catch {
    return `${match[2]}/${match[3]}`;
  }
}

/** The front page of the repository a path is inside, or null. */
export function repoHomeFromPath(pathname: string): string | null {
  const match = REPO_PATH.exec(pathname);
  if (!match) return null;
  // The segments come from a URL: decode them so the builder's own encoding
  // does not double up.
  return repoUrl({
    host: decodeSegment(match[1]),
    owner: decodeSegment(match[2]),
    name: decodeSegment(match[3]),
  });
}

function decodeSegment(segment: string | undefined): string {
  try {
    return decodeURIComponent(segment ?? '');
  } catch {
    return segment ?? '';
  }
}

export function RepoSwitcher(): JSX.Element | null {
  const { pathname } = useLocation();
  const current = repoNameFromPath(pathname);
  const home = repoHomeFromPath(pathname);
  if (!current || !home) return null;

  return (
    <Link to={home} className="repo-switcher" aria-label={current} title={`${current} front page`}>
      <FolderGit2 size={14} aria-hidden="true" />
      <span className="repo-switcher__label">{current}</span>
    </Link>
  );
}
