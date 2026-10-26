// PageTabs.tsx — the tab strip of a page whose views are each an address.
//
// Each tab is a router link, so a view is a link a reader can share and the
// Back button walks it. The caller says which tab is current: a tab may be a
// whole path (`/sessions`) or the same path with a query (`?view=all`), and
// only the page knows which of its views it is showing.

import { Link } from 'react-router-dom';

import './pageTabs.css';

export interface PageTab {
  id: string;
  label: string;
  to: string;
}

export function PageTabs({
  label,
  tabs,
  current,
  testId,
}: {
  /** What the strip switches between, for the landmark. */
  label: string;
  tabs: readonly PageTab[];
  /** The id of the tab the page is showing. */
  current: string;
  testId?: string;
}): JSX.Element {
  return (
    <nav className="page-tabs" aria-label={label} data-testid={testId}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to}
          className={`page-tabs__tab${tab.id === current ? ' is-active' : ''}`}
          aria-current={tab.id === current ? 'page' : undefined}
          data-testid={testId ? `${testId}-${tab.id}` : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
