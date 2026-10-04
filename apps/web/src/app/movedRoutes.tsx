// movedRoutes.tsx — one table of the paths that moved, and where they go now.
//
// Pages get renamed, merged into tabs, or folded into another page. The URLs
// they had stay in circulation: bookmarks, runbooks, pull request bodies,
// forge notifications, agent output. Each one keeps working through a single
// entry here instead of a redirect scattered through the route map, so the
// list of paths we still answer for is readable in one place.
//
// Every entry carries the date it was added and the date after which it may
// go — six months of grace from the day the page moved, unless the entry says
// why it needs longer. An entry past its `removeAfter` is a route for removal,
// not one to extend.
//
// A redirect keeps the query string and the fragment: `?family=`, `?view=`,
// `#lane-<id>` all name something on the destination page.

import { Navigate, useLocation, useParams } from 'react-router-dom';

import { IN_FLIGHT_PATH } from '../pages/pullRoomModel';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ADOPTION_PATH, FINDINGS_PATH } from '../pages/sharedTools/SharedToolsTabs';
import { WORK_PATH, todoHref } from '../pages/shift';

export interface MovedRoute {
  /** The path as the route map declares it (no leading slash). */
  path: string;
  /**
   * Where it goes now. A `:param` is filled from the URL, and a `#place`
   * names a section of the destination page.
   */
  to: string;
  /** Why the path moved — what a reader of this table needs to know. */
  why: string;
  /** The day the path stopped being a page of its own (ISO date). */
  added: string;
  /** The day after which this entry may go (ISO date). */
  removeAfter: string;
  /**
   * Say where the page went instead of redirecting: for a path whose content
   * has no single successor, a pointer beats landing somewhere unasked.
   */
  tell?: { what: string; label: string };
  /**
   * A link to exactly one todo (`?todo=<id>`, what Needs you sends) opens that
   * todo's own page rather than the queue it sits in.
   */
  keepTodoLink?: boolean;
}

export const MOVED_ROUTES: readonly MovedRoute[] = [
  {
    path: 'fleet',
    to: '/runners',
    why: 'The Fleet page is Runners: it lists runners, not a fleet of anything else.',
    added: '2026-09-17',
    removeAfter: '2027-03-17',
  },
  {
    path: 'pull-room',
    to: IN_FLIGHT_PATH,
    why: "The Pull Room's own name is In flight; filters carry over in the query.",
    added: '2026-10-02',
    removeAfter: '2027-04-02',
  },
  {
    path: 'work/shift',
    to: WORK_PATH,
    why: 'Work is one page: the queue is the page, Add and Workers are places on it.',
    added: '2026-09-19',
    removeAfter: '2027-03-19',
    keepTodoLink: true,
  },
  {
    path: 'work/shift/new',
    to: `${WORK_PATH}#add`,
    why: 'Adding work is a section of the queue page.',
    added: '2026-09-19',
    removeAfter: '2027-03-19',
  },
  {
    path: 'work/shift/workers',
    to: `${WORK_PATH}#workers`,
    why: 'Who is working is a section of the queue page.',
    added: '2026-09-19',
    removeAfter: '2027-03-19',
  },
  {
    path: 'unreleased',
    to: '/releases',
    why: "Unreleased is the last section of Releases; the forge's attention items still link it.",
    added: '2026-09-19',
    removeAfter: '2027-03-19',
  },
  {
    path: 'shared-code',
    to: FINDINGS_PATH,
    why: 'Shared Code became the Findings tab of Shared tools.',
    added: '2026-09-18',
    removeAfter: '2027-03-18',
  },
  {
    path: 'tools',
    to: FINDINGS_PATH,
    why: 'The Tools page became the Findings tab of Shared tools.',
    added: '2026-09-18',
    removeAfter: '2027-03-18',
  },
  {
    path: 'tool-fleet',
    to: ADOPTION_PATH,
    why: 'Tool Fleet became the Adoption tab of Shared tools.',
    added: '2026-09-18',
    removeAfter: '2027-03-18',
  },
  {
    path: 'tool-fleet/:tool',
    to: `${ADOPTION_PATH}/:tool`,
    why: "One tool's adoption is the same page under Shared tools.",
    added: '2026-09-19',
    removeAfter: '2027-03-19',
  },
  {
    path: 'notifications',
    to: '/activity',
    why: 'The in-memory inbox is gone: Needs you says what waits on a person, Activity is the feed.',
    added: '2026-09-19',
    removeAfter: '2027-03-19',
  },
  {
    path: 'audit',
    to: '/activity',
    why: '/audit held a placeholder page and runbooks still link it.',
    added: '2026-09-22',
    removeAfter: '2027-03-22',
    tell: {
      what: 'Recorded events (who changed what, and when) are on Activity.',
      label: 'Open Activity',
    },
  },
  {
    path: 'shared-tools',
    to: FINDINGS_PATH,
    why: 'The tabs have no shell page of their own: Findings is the first of them. Keep while the tabs exist.',
    added: '2026-09-18',
    removeAfter: '2027-09-18',
  },
];

/** Split `/work#add` into its path and its place on the page. */
function splitPlace(to: string): { path: string; place: string } {
  const hash = to.indexOf('#');
  return hash === -1
    ? { path: to, place: '' }
    : { path: to.slice(0, hash), place: to.slice(hash) };
}

/** Fill the `:param` segments of a destination from the URL that matched. */
function fillParams(path: string, params: Readonly<Record<string, string | undefined>>): string {
  return path
    .split('/')
    .map((segment) =>
      segment.startsWith(':') ? encodeURIComponent(params[segment.slice(1)] ?? '') : segment
    )
    .join('/');
}

export type MovedRouteProps = Pick<MovedRoute, 'to' | 'keepTodoLink'>;

/** One moved path -> where it goes now, keeping its query string and fragment. */
export function MovedRouteRedirect({ to, keepTodoLink }: MovedRouteProps): JSX.Element {
  const params = useParams();
  const { search, hash: current } = useLocation();
  const { path, place } = splitPlace(to);
  if (keepTodoLink && !place) {
    const ids = (new URLSearchParams(search).get('todo') ?? '').split(',').filter(Boolean);
    if (ids.length === 1) return <Navigate to={todoHref(ids[0])} replace />;
  }
  return (
    <Navigate
      to={{ pathname: fillParams(path, params), search, hash: place || current }}
      replace
    />
  );
}

/** The element the route map registers for one entry of the table. */
export function movedRouteElement(moved: MovedRoute): JSX.Element {
  if (moved.tell) {
    return <NotFoundPage movedTo={{ ...moved.tell, to: moved.to }} />;
  }
  return <MovedRouteRedirect to={moved.to} keepTodoLink={moved.keepTodoLink} />;
}
