// LeftNav.tsx — primary navigation (W-FE-01).
//
// Six destinations an operator uses daily (plus Wiki, when an administrator
// has chosen a repository for it), then a "System" disclosure for the
// five that explain the machinery (Runners, Intelligence, Dependencies,
// Quality gate, Shared tools). The disclosure is closed by default, remembers what the operator chose, and is
// open whenever the current page is inside it. When the current URL is inside a
// repository route (`/repos/:provider/:fullName/*`), a contextual
// sub-navigation appears below the workspace links so the operator can
// jump directly to Code / Pulls / Agents / Settings without going through
// the overview page first.

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronRight,
  Code2,
  Cog,
  ClipboardList,
  Brain,
  FolderGit2,
  GitMerge,
  Layers,
  Share2,
  Siren,
  Rocket,
  ServerCog,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

import { useAttention } from '../hooks/usePipeline';
import { useAuth } from '../hooks/useAuth';
import { useSiteSettings } from '../hooks/useSiteSettings';
import {
  AREA_LABEL,
  areaBadgeCount,
  attentionBadgeCount,
  type AttentionArea,
} from '../pages/needsYou/needsYouModel';
import { DEPENDENCIES_PATH } from '../pages/DependenciesPage';
import { WIKI_PATH } from '../pages/wiki/wikiModel';
import { readBrowserText, writeBrowserText } from '../storage/browserStorage';
import { NEEDS_YOU_PATH } from './HomeRedirect';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /**
   * `attention`: every critical + action row from `/api/v1/attention`. An area:
   * only the rows whose cause lives on that page, so each page says what on it
   * is waiting on a person.
   */
  badge?: 'attention' | AttentionArea;
}

/** What an operator opens every day, in the order the work flows. */
export const PRIMARY_NAV: NavItem[] = [
  { to: NEEDS_YOU_PATH, label: 'Needs you', icon: Siren, badge: 'attention' },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/work', label: 'Work', icon: ClipboardList, badge: 'work' },
  // The route stays `/pull-room`; the page lists pull requests, so it says so.
  { to: '/pull-room', label: 'Pull requests', icon: GitMerge, badge: 'pulls' },
  { to: '/releases', label: 'Releases', icon: Rocket, badge: 'releases' },
  { to: '/repos', label: 'Repositories', icon: FolderGit2 },
  // Settings is reached from the top-right account control (UserMenu).
];

/** How the machinery is doing: looked at when something is off, not daily. */
export const SYSTEM_NAV: NavItem[] = [
  { to: '/runners', label: 'Runners', icon: ServerCog, badge: 'system' },
  // `end`: Dependencies lives under /intelligence and is its own destination.
  { to: '/intelligence', label: 'Intelligence', icon: Brain, end: true },
  { to: DEPENDENCIES_PATH, label: 'Dependencies', icon: Share2 },
  { to: '/quality-gate', label: 'Quality gate', icon: ShieldCheck },
  { to: '/shared-tools', label: 'Shared tools', icon: Layers },
];

const SYSTEM_OPEN_KEY = 'jeryu.leftNav.systemOpen.v1';
const SYSTEM_LIST_ID = 'left-nav-system';

/** A red count when something on that destination waits on a person; nothing otherwise. */
function NavBadge({
  count,
  area,
}: {
  count: number;
  area: NavItem['badge'];
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
  return SYSTEM_NAV.some((item) => isActivePath(pathname, item.to));
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
  const renderItem = (item: NavItem): JSX.Element => (
    <Link
      key={item.to}
      to={item.to}
      className={`left-nav__item${
        isActivePath(pathname, item.to, item.end) ? ' is-active' : ''
      }`}
      aria-current={isActivePath(pathname, item.to, item.end) ? 'page' : undefined}
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
      {PRIMARY_NAV.map(renderItem)}
      {wiki ? (
        <Link
          to={WIKI_PATH}
          title={wiki.full_name}
          className={`left-nav__item${isActivePath(pathname, WIKI_PATH) ? ' is-active' : ''}`}
          aria-current={isActivePath(pathname, WIKI_PATH) ? 'page' : undefined}
          data-testid="left-nav-wiki"
        >
          <BookOpen aria-hidden="true" size={16} />
          Wiki
        </Link>
      ) : null}

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
        {systemOpen ? SYSTEM_NAV.map(renderItem) : null}
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
