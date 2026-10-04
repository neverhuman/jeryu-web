// PageHeader.tsx — the one header every route wears.
//
// "Where am I, what is this, what can I do here, and how old is what I am
// reading" used to be answered four different ways: breadcrumbs on the repo
// pages only, a one-off back link on the quality-gate and adoption detail
// pages, a roadmap note standing in for a subtitle on Intelligence, and a
// freshness stamp on Runners and the release board alone. This component is
// all four in one place:
//
//   breadcrumb — the trail above the title. A detail page names its `parent`
//                by nav-registry id, so the first link is always the nav
//                entry the left nav highlights while the page is open; extra
//                `crumbs` continue the trail from there.
//   title      — the route's one <h1>, with `badges` beside it.
//   subtitle   — one sentence on what the page is for.
//   actions    — what the page as a whole can do, top right.
//   freshness  — when the data below was last read, and a button to read it
//                again. Operator reads also refetch when the tab regains
//                focus (`OPERATOR_REFRESH`), so the stamp is the one place
//                that says how old the page is.
//
// `children` are extra header rows (a tab strip, filters, a summary
// sentence) and sit under the subtitle.

import { type ReactNode, useEffect, useState } from 'react';

import { Breadcrumbs, type BreadcrumbSegment } from '../browser';
import { When } from '../../format/When';
import { rfc3339Seconds } from '../../format/when';
import { NAV_DESTINATIONS } from '../../layout/navDestinations';

import './pageHeader.css';

/** How often the freshness stamp re-reads the clock, so "2 min ago" ages. */
const FRESHNESS_TICK_MS = 30_000;

export interface PageFreshness {
  /** When the data on this page was last read from the server. */
  updatedAt: number | string | Date | null | undefined;
  /** True while a read is in flight; the button says so and is held. */
  isFetching?: boolean;
  /** Read it again now. Without one the stamp has no button. */
  onRefresh?: () => void;
}

/** The least a React Query result has to carry to feed a freshness stamp. */
export interface FreshnessQuery {
  dataUpdatedAt: number;
  isFetching: boolean;
  refetch: () => unknown;
}

/** A page's primary read, as a freshness stamp: when it landed, and refetch. */
export function queryFreshness(query: FreshnessQuery): PageFreshness {
  return {
    updatedAt: query.dataUpdatedAt || null,
    isFetching: query.isFetching,
    onRefresh: () => void query.refetch()
  };
}

export interface PageHeaderProps {
  title: ReactNode;
  /** One sentence on what this page is for. */
  subtitle?: ReactNode;
  /**
   * The nav destination this page hangs under (`nav.repos`, `nav.work`, …).
   * Set on a detail route: it becomes the first, linked breadcrumb.
   */
  parent?: string;
  /** The trail from `parent` down to this page; the last crumb is the page. */
  crumbs?: BreadcrumbSegment[];
  /** State pills shown beside the title. */
  badges?: ReactNode;
  /** What this page can do, as buttons or links, top right. */
  actions?: ReactNode;
  freshness?: PageFreshness;
  /** Extra header rows: a tab strip, filters, a summary sentence. */
  children?: ReactNode;
  className?: string;
  testId?: string;
  /** Shown above the title when the page has no breadcrumb of its own. */
  eyebrow?: ReactNode;
}

/** The nav destination with this id, or null when nothing claims it. */
export function navParentCrumb(
  parent: string | undefined
): BreadcrumbSegment | null {
  if (!parent) return null;
  const destination = NAV_DESTINATIONS.find((d) => d.id === parent);
  return destination
    ? { label: destination.label, to: destination.path }
    : null;
}

/** A clock that re-reads itself, so relative text on a long-open page ages. */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(
      () => setNow(Date.now()),
      FRESHNESS_TICK_MS
    );
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * When the page was last read, and a button to read it again. `data-updated-at`
 * carries the instant itself so a reader — or a test — can tell one read from
 * the next even when both say "just now".
 */
export function PageFreshnessStamp({
  updatedAt,
  isFetching = false,
  onRefresh
}: PageFreshness): JSX.Element {
  const now = useTick(true);
  const stamp = rfc3339Seconds(updatedAt);
  return (
    <p
      className="page-header__freshness"
      data-testid="page-freshness"
      data-updated-at={stamp ?? ''}
      data-fetching={isFetching ? 'true' : 'false'}
    >
      <span className="page-header__freshness-text">
        {isFetching ? (
          'Refreshing…'
        ) : stamp === null ? (
          'Not read yet'
        ) : (
          <>
            Updated <When at={updatedAt} now={now} label="Last read" />
          </>
        )}
      </span>
      {onRefresh ? (
        <button
          type="button"
          className="page-header__refresh"
          data-testid="page-refresh"
          onClick={onRefresh}
          disabled={isFetching}
        >
          Refresh
        </button>
      ) : null}
    </p>
  );
}

export function PageHeader({
  title,
  subtitle,
  parent,
  crumbs,
  badges,
  actions,
  freshness,
  children,
  className,
  testId,
  eyebrow
}: PageHeaderProps): JSX.Element {
  const first = navParentCrumb(parent);
  const trail = [...(first ? [first] : []), ...(crumbs ?? [])];
  return (
    <header
      className={`page__header page-header${className ? ` ${className}` : ''}`}
      data-page-header=""
      data-testid={testId}
    >
      {trail.length > 0 ? <Breadcrumbs segments={trail} /> : null}
      <div className="page-header__bar">
        <div className="page-header__heading">
          {trail.length === 0 && eyebrow ? (
            <p className="page-header__eyebrow">{eyebrow}</p>
          ) : null}
          <div className="page-header__title-line">
            <h1 className="page__title page-header__title">{title}</h1>
            {badges}
          </div>
        </div>
        {actions || freshness ? (
          <div className="page-header__aside">
            {actions ? (
              <div className="page-header__actions">{actions}</div>
            ) : null}
            {freshness ? <PageFreshnessStamp {...freshness} /> : null}
          </div>
        ) : null}
      </div>
      {subtitle ? (
        <p className="page__subtitle page-header__subtitle">{subtitle}</p>
      ) : null}
      {children}
    </header>
  );
}
