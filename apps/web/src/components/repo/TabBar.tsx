// TabBar.tsx — the one tab bar the repository shell and the pull request page
// are both navigated by.
//
// Links, not buttons, so a tab opens in a new window like any destination.
// The current one carries `aria-current="page"`, the bar is one tab stop
// (arrow keys, Home and End move inside it), and below 720px it scrolls
// sideways instead of wrapping.

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { rovingIndex } from '../../pages/repoShellModel';

import './repoShell.css';

export interface TabBarItem {
  /** Stable key; also the suffix of the item's test id. */
  key: string;
  label: string;
  href: string;
  /** Shown beside the label when positive; null for a tab that counts nothing. */
  count?: number | null;
  /** A mark beside the count, e.g. "needs a person". */
  marker?: ReactNode;
}

export interface TabBarProps {
  /** The bar's accessible name, e.g. `Repository` or `Pull request`. */
  label: string;
  items: readonly TabBarItem[];
  /** The key of the item the page is. */
  current: string;
  /** Test id of the bar; each tab gets `${idPrefix}-${key}`. */
  testId: string;
  idPrefix: string;
}

export function TabBar({
  label,
  items,
  current,
  testId,
  idPrefix,
}: TabBarProps): JSX.Element {
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  // The bar is one tab stop: the tab stop is whichever tab was last focused,
  // and the current page's tab until one is.
  const [focused, setFocused] = useState<string | null>(null);
  const stop = focused ?? current;

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const from = items.findIndex((item) => item.key === stop);
    const at = rovingIndex(from < 0 ? 0 : from, items.length, event.key);
    if (at === null) return;
    event.preventDefault();
    links.current[at]?.focus();
  };

  return (
    <nav
      className="repo-tabs"
      aria-label={label}
      onKeyDown={onKeyDown}
      data-testid={testId}
    >
      {items.map((item, index) => {
        const on = item.key === current;
        return (
          <Link
            key={item.key}
            ref={(node) => {
              links.current[index] = node;
            }}
            to={item.href}
            className={`repo-tabs__tab${on ? ' is-active' : ''}`}
            aria-current={on ? 'page' : undefined}
            tabIndex={item.key === stop ? 0 : -1}
            onFocus={() => setFocused(item.key)}
            data-testid={`${idPrefix}-${item.key}`}
          >
            {item.label}
            {typeof item.count === 'number' && item.count > 0 ? (
              <span
                className="repo-tabs__count"
                data-testid={`${idPrefix}-count-${item.key}`}
              >
                {item.count > 99 ? '99+' : item.count}
              </span>
            ) : null}
            {item.marker}
          </Link>
        );
      })}
    </nav>
  );
}
