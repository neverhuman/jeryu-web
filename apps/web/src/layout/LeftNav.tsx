// LeftNav.tsx — primary navigation (W-FE-01).
//
// Six destinations an operator uses daily (plus Wiki, when an administrator
// has chosen a repository for it), then a "System" disclosure for the
// five that explain the machinery (Runners, Intelligence, Dependencies,
// Quality gate, Shared tools). The destinations themselves — label, path,
// icon, badge and shortcut — come from NAV_DESTINATIONS, the one registry the
// palette and the keyboard read too. A destination the registry marks
// `adminOnly` reads an admin-only endpoint, so it is left out entirely for
// another role rather than offered as a link into a refusal. The disclosure is closed by default,
// remembers what the operator chose, and is
// open whenever the current page is inside it. When the current URL is inside a
// repository route (`/repos/:provider/:fullName/*`), a contextual
// sub-navigation appears below the workspace links so the operator can
// jump directly to Code / Pulls / Agents / Settings without going through
// the overview page first.

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bot, ChevronDown, ChevronRight, Code2, Cog, GitMerge } from 'lucide-react';

import { useAttention } from '../hooks/usePipeline';
import { useAuth } from '../hooks/useAuth';
import { useSiteSettings } from '../hooks/useSiteSettings';
import {
  AREA_LABEL,
  areaBadgeCount,
  attentionBadgeCount,
} from '../pages/needsYou/needsYouModel';
import { repoUrl } from '../pages/repoBrowserModel';
import { readBrowserText, writeBrowserText } from '../storage/browserStorage';
import { NAV_DESTINATIONS, navGroup, type NavDestination } from './navDestinations';

/** The daily destinations, in the order the work flows. */
export const PRIMARY_NAV = NAV_DESTINATIONS.filter((d) => d.group === 'primary');

/** How the machinery is doing: looked at when something is off, not daily. */
export const SYSTEM_NAV = NAV_DESTINATIONS.filter((d) => d.group === 'system');

const SYSTEM_OPEN_KEY = 'jeryu.leftNav.systemOpen.v1';
const SYSTEM_LIST_ID = 'left-nav-system';

/** A red count when something on that destination waits on a person; nothing otherwise. */
function NavBadge({
  count,
  area,
}: {
  count: number;
  area: NavDestination['badge'];
}): JSX.Element | null {
  if (!area || count <= 0) return null;
  const things = `${count} item${count === 1 ? '' : 's'}`;
  return (
    <span
      className="left-nav__badge"
      data-testid={area === 'attention' ? 'needs-you-badge' : `nav-badge-${area}`}
      aria-label={
        area === 'attention' ? `${things} need you` : `${things} need you in ${AREA_LABEL[area]}`
      }
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** True when `pathname` is one of the System destinations or inside one. */
export function isSystemPath(pathname: string): boolean {
  return SYSTEM_NAV.some((item) => isActivePath(pathname, item.path, item.end));
}

/** A URL segment as the builder wants it: decoded, or as-is when it cannot be. */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Extract the repo base path from the current pathname, if any.
 *  Matches `/repos/:provider/:fullName` (where fullName may include slashes). */
function extractRepoBase(
  pathname: string
): { base: string; repoName: string } | undefined {
  // URL pattern: /repos/{provider}/{owner}/{name}[/{subPath}[/{...tail}]]
  // Always exactly 3 segments after /repos/, then optional sub-path.
  const match = pathname.match(
    /^\/repos\/([^/]+)\/([^/]+)\/([^/]+)(?:\/(code|pulls|agents|settings|blob|tree|work|issues)(?:\/.*)?)?$/
  );
  if (!match) return;
  const [, provider = '', owner = '', name = ''] = match;
  // The segments are already URL-shaped, so the builder reads them decoded.
  const base = repoUrl({
    host: safeDecode(provider),
    owner: safeDecode(owner),
    name: safeDecode(name),
  });
  const repoName = `${owner}/${name}`;
  return { base, repoName };
}

export function LeftNav(): JSX.Element {
  const { pathname } = useLocation();
  const repo = extractRepoBase(pathname);
  // The badge is visible from every page. Attention is admin-only, so other
  // roles never ask; an older server answers once and the query stops polling.
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const attention = useAttention(isAdmin);
  const primary = navGroup('primary', isAdmin);
  const system = navGroup('system', isAdmin);
  const [wikiDestination] = navGroup('wiki', isAdmin);
  const needsYou = attentionBadgeCount(attention.data);
  // Shown only when a wiki is set and this viewer can read its repository.
  const wiki = useSiteSettings().data?.internal_wiki ?? null;

  // Closed unless the operator opened it; always open on a System page, so
  // the current page is never hidden inside a closed group.
  const [systemChosen, setSystemChosen] = useState<boolean>(
    () => readBrowserText('durable', SYSTEM_OPEN_KEY) === '1'
  );
  const onSystemPage = isSystemPath(pathname);
  const systemOpen = systemChosen || onSystemPage;
  const toggleSystem = (): void => {
    const next = !systemOpen;
    setSystemChosen(next);
    writeBrowserText('durable', SYSTEM_OPEN_KEY, next ? '1' : '0');
  };

  // A router link, never a plain anchor: a plain anchor reloads the whole app on
  // every click (it did), which re-authenticates, reconnects the live socket
  // ("Connecting…" on each navigation), refetches every query and shifts the page.
  // `title`/`aria-keyshortcuts`: the chord that goes here, said where the
  // destination is, not only in the shortcuts overlay.
  const renderItem = (item: NavDestination, title?: string): JSX.Element => (
    <Link
      key={item.id}
      to={item.path}
      title={title ?? `${item.label} (${item.shortcut})`}
      aria-keyshortcuts={item.shortcut}
      className={`left-nav__item${
        isActivePath(pathname, item.path, item.end) ? ' is-active' : ''
      }`}
      aria-current={isActivePath(pathname, item.path, item.end) ? 'page' : undefined}
      data-testid={`left-nav-${item.id.replace(/^nav\./, '')}`}
    >
      <item.icon aria-hidden="true" size={16} />
      {item.label}
      <NavBadge
        count={
          item.badge === 'attention'
            ? needsYou
            : item.badge
              ? areaBadgeCount(attention.data, item.badge)
              : 0
        }
        area={item.badge}
      />
    </Link>
  );

  return (
    <nav className="left-nav" aria-label="Primary">
      {primary.map((item) => renderItem(item))}
      {wiki && wikiDestination
        ? renderItem(wikiDestination, `${wiki.full_name} (${wikiDestination.shortcut})`)
        : null}

      <button
        type="button"
        className="left-nav__disclosure"
        aria-expanded={systemOpen}
        aria-controls={SYSTEM_LIST_ID}
        onClick={toggleSystem}
        // On a System page the group stays open: closing it would hide where you are.
        disabled={onSystemPage}
      >
        {systemOpen ? (
          <ChevronDown aria-hidden="true" size={14} />
        ) : (
          <ChevronRight aria-hidden="true" size={14} />
        )}
        System
        {/* Closed, the group still says when a runner or worker needs you. */}
        {systemOpen ? null : (
          <NavBadge count={areaBadgeCount(attention.data, 'system')} area="system" />
        )}
      </button>
      <div id={SYSTEM_LIST_ID} className="left-nav__sublist" hidden={!systemOpen}>
        {systemOpen ? system.map((item) => renderItem(item)) : null}
      </div>

      {repo ? (
        <>
          <div className="left-nav__divider" />
          <span className="left-nav__group">
            {repo.repoName}
          </span>
          <Link
            // The repository front page is the code: README and the Files panel.
            to={repo.base}
            className={`left-nav__item${isCodePath(pathname, repo.base) ? ' is-active' : ''}`}
            aria-current={isCodePath(pathname, repo.base) ? 'page' : undefined}
          >
            <Code2 aria-hidden="true" size={16} />
            Code
          </Link>
          <Link
            to={`${repo.base}/pulls`}
            className={`left-nav__item${isActivePath(pathname, `${repo.base}/pulls`) ? ' is-active' : ''}`}
            // "Pull requests" is also a primary destination: say whose these are.
            aria-label={`Pull requests in ${repo.repoName}`}
          >
            <GitMerge aria-hidden="true" size={16} />
            Pull requests
          </Link>
          <Link
            to={`${repo.base}/agents`}
            className={`left-nav__item${isActivePath(pathname, `${repo.base}/agents`) ? ' is-active' : ''}`}
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

/** Code is where a file is read, whichever route shows it. */
function isCodePath(pathname: string, base: string): boolean {
  return (
    pathname === base ||
    ['code', 'blob', 'tree'].some((part) => isActivePath(pathname, `${base}/${part}`))
  );
}

function isActivePath(pathname: string, to: string, end = false): boolean {
  if (end || to === '/') {
    return pathname === to;
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}
