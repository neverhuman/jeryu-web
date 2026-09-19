// LeftNav.tsx — primary navigation (W-FE-01).
//
// Shows workspace-level nav items. When the current URL is inside a
// repository route (`/repos/:provider/:fullName/*`), a contextual
// sub-navigation appears below the workspace links so the operator can
// jump directly to Code / Pulls / Agents / Settings without going through
// the overview page first.

import { Link, useLocation } from 'react-router-dom';
import {
  Bell,
  Bot,
  Code2,
  Cog,
  ClipboardList,
  Brain,
  FolderGit2,
  GitMerge,
  Layers,
  Siren,
  Rocket,
  PackageOpen,
  ServerCog,
  type LucideIcon,
} from 'lucide-react';

import { useAttention } from '../hooks/usePipeline';
import { useAuth } from '../hooks/useAuth';
import { attentionBadgeCount } from '../pages/needsYou/needsYouModel';
import { NEEDS_YOU_PATH } from './HomeRedirect';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** `attention`: show the critical + action count from `/api/v1/attention`. */
  badge?: 'attention';
}

const NAV_ITEMS: NavItem[] = [
  { to: NEEDS_YOU_PATH, label: 'Needs you', icon: Siren, badge: 'attention' },
  { to: '/repos', label: 'Repositories', icon: FolderGit2 },
  { to: '/work', label: 'Work', icon: ClipboardList },
  // Reconciled: the route map (router.tsx) and command palette both use
  // `/pull-room` / "Pull Room"; the nav previously pointed at a dead
  // `/merge-room` path that fell through to NotFound.
  { to: '/pull-room', label: 'Pull Room', icon: GitMerge },
  { to: '/releases', label: 'Releases', icon: Rocket },
  { to: '/unreleased', label: 'Unreleased', icon: PackageOpen },
  { to: '/intelligence', label: 'Intelligence', icon: Brain },
  { to: '/runners', label: 'Runners', icon: ServerCog },
  { to: '/shared-tools', label: 'Shared tools', icon: Layers },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Cog },
];

/** Extract the repo base path from the current pathname, if any.
 *  Matches `/repos/:provider/:fullName` (where fullName may include slashes). */
function extractRepoBase(
  pathname: string
): { base: string; repoName: string } | undefined {
  // URL pattern: /repos/{provider}/{owner}/{name}[/{subPath}[/{...tail}]]
  // Always exactly 3 segments after /repos/, then optional sub-path.
  const match = pathname.match(
    /^\/repos\/([^/]+)\/([^/]+)\/([^/]+)(?:\/(code|pulls|agents|settings|blob|work|issues)(?:\/.*)?)?$/
  );
  if (!match) return;
  const [, provider, owner, name] = match;
  const base = `/repos/${provider}/${owner}/${name}`;
  const repoName = `${owner}/${name}`;
  return { base, repoName };
}

export function LeftNav(): JSX.Element {
  const { pathname } = useLocation();
  const repo = extractRepoBase(pathname);
  // The badge is visible from every page. Attention is admin-only, so other
  // roles never ask; an older server answers once and the query stops polling.
  const { user } = useAuth();
  const attention = useAttention(user?.role === 'admin');
  const needsYou = attentionBadgeCount(attention.data);

  return (
    <nav className="left-nav" aria-label="Primary">
      <span className="left-nav__group">Workspace</span>
      {NAV_ITEMS.map((item) => (
        <a
          key={item.to}
          href={item.to}
          className={`left-nav__item${
            isActivePath(pathname, item.to, item.end) ? ' is-active' : ''
          }`}
          aria-current={isActivePath(pathname, item.to, item.end) ? 'page' : undefined}
        >
          <item.icon aria-hidden="true" size={16} />
          {item.label}
          {item.badge === 'attention' && needsYou > 0 ? (
            <span
              className="left-nav__badge"
              data-testid="needs-you-badge"
              aria-label={`${needsYou} item${needsYou === 1 ? '' : 's'} need you`}
            >
              {needsYou > 99 ? '99+' : needsYou}
            </span>
          ) : null}
        </a>
      ))}

      {repo ? (
        <>
          <div className="left-nav__divider" />
          <span className="left-nav__group">
            {repo.repoName}
          </span>
          <Link
            to={`${repo.base}/code`}
            className={`left-nav__item${isActivePath(pathname, `${repo.base}/code`) ? ' is-active' : ''}`}
          >
            <Code2 aria-hidden="true" size={16} />
            Code
          </Link>
          <Link
            to={`${repo.base}/work`}
            className={`left-nav__item${isActivePath(pathname, `${repo.base}/work`) || isActivePath(pathname, `${repo.base}/issues`) ? ' is-active' : ''}`}
          >
            <ClipboardList aria-hidden="true" size={16} />
            Work
          </Link>
          <Link
            to={`${repo.base}/pulls`}
            className={`left-nav__item${isActivePath(pathname, `${repo.base}/pulls`) ? ' is-active' : ''}`}
          >
            <GitMerge aria-hidden="true" size={16} />
            Pull requests
          </Link>
          <Link
            to={`${repo.base}/agents`}
            className={`left-nav__item left-nav__item--agents${isActivePath(pathname, `${repo.base}/agents`) ? ' is-active' : ''}`}
            data-testid="left-nav-agents"
          >
            <Bot aria-hidden="true" size={16} />
            Agents
          </Link>
          <Link
            to={`${repo.base}/settings`}
            className={`left-nav__item${isActivePath(pathname, `${repo.base}/settings`) ? ' is-active' : ''}`}
          >
            <Cog aria-hidden="true" size={16} />
            Settings
          </Link>
        </>
      ) : null}
    </nav>
  );
}

function isActivePath(pathname: string, to: string, end = false): boolean {
  if (end || to === '/') {
    return pathname === to;
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}
