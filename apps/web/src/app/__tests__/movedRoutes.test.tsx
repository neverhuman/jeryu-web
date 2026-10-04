// movedRoutes.test.tsx — every path a page used to have still lands, with the
// query string and the fragment it was pasted with.
//
// The table in `movedRoutes.tsx` is the whole contract: each entry is driven
// through the element the real route map registers for it. A new entry with no
// case below fails this file, so the table cannot grow an untested row.

import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { MOVED_ROUTES } from '../movedRoutes';
import { router } from '../router';

function registeredElement(path: string): JSX.Element {
  const route = (router.routes[0]?.children ?? []).find((child) => child.path === path);
  expect(route?.element, `route ${path} is registered`).toBeTruthy();
  return route?.element as JSX.Element;
}

/** Follow one moved path through its real element; return where it landed. */
function follow(path: string, from: string): string {
  const memoryRouter = createMemoryRouter(
    [
      { path: `/${path}`, element: registeredElement(path) },
      { path: '*', element: <p>destination</p> },
    ],
    { initialEntries: [from] }
  );
  render(<RouterProvider router={memoryRouter} />);
  const { pathname, search, hash } = memoryRouter.state.location;
  return `${pathname}${search}${hash}`;
}

/** One pasted URL per entry of the table, and where it has to land. */
const CASES: Record<string, { from: string; to: string }> = {
  fleet: { from: '/fleet?busy=1#runner-acme-1', to: '/runners?busy=1#runner-acme-1' },
  'pull-room': {
    from: '/pull-room?repo=acme%2Fwidgets&view=queue#top',
    to: '/in-flight?repo=acme%2Fwidgets&view=queue#top',
  },
  'work/shift': { from: '/work/shift?family=acme#queue', to: '/work?family=acme#queue' },
  'work/shift/new': { from: '/work/shift/new?family=globex', to: '/work?family=globex#add' },
  'work/shift/workers': {
    from: '/work/shift/workers?family=globex',
    to: '/work?family=globex#workers',
  },
  unreleased: {
    from: '/unreleased?repo=acme%2Fwidgets#pins',
    to: '/releases?repo=acme%2Fwidgets#pins',
  },
  'shared-code': {
    from: '/shared-code?family=initech#tools',
    to: '/shared-tools/findings?family=initech#tools',
  },
  tools: { from: '/tools?q=parse#tools', to: '/shared-tools/findings?q=parse#tools' },
  'tool-fleet': {
    from: '/tool-fleet?family=acme#adoption',
    to: '/shared-tools/adoption?family=acme#adoption',
  },
  'tool-fleet/:tool': {
    from: '/tool-fleet/acme-widget-lint?family=acme#repos',
    to: '/shared-tools/adoption/acme-widget-lint?family=acme#repos',
  },
  notifications: { from: '/notifications?kind=merge#latest', to: '/activity?kind=merge#latest' },
  'shared-tools': { from: '/shared-tools?q=parse#tools', to: '/shared-tools/findings?q=parse#tools' },
  // `/audit` says where the record went instead of redirecting; see below.
  audit: { from: '/audit', to: '/audit' },
};

describe('the moved-path table', () => {
  it('has a case below for every entry', () => {
    expect(MOVED_ROUTES.map((moved) => moved.path).sort()).toEqual(Object.keys(CASES).sort());
  });

  it.each(MOVED_ROUTES.map((moved) => [moved.path, CASES[moved.path]] as const))(
    '%s keeps its query string and fragment',
    (path, expected) => {
      expect(follow(path, expected.from)).toBe(expected.to);
    }
  );

  it('replaces the moved address in history rather than adding to it', () => {
    const memoryRouter = createMemoryRouter(
      [
        { path: '/fleet', element: registeredElement('fleet') },
        { path: '*', element: <p>destination</p> },
      ],
      { initialEntries: ['/fleet'] }
    );
    render(<RouterProvider router={memoryRouter} />);
    expect(memoryRouter.state.location.pathname).toBe('/runners');
    expect(memoryRouter.state.historyAction).toBe('REPLACE');
  });

  it('dates every entry, with a remove-after date later than the day it was added', () => {
    for (const moved of MOVED_ROUTES) {
      expect(moved.added, moved.path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(moved.removeAfter, moved.path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(moved.removeAfter > moved.added, moved.path).toBe(true);
      expect(moved.why.length, moved.path).toBeGreaterThan(0);
    }
  });

  it('sends a link to exactly one todo to that todo, not to the queue it sits in', () => {
    expect(follow('work/shift', '/work/shift?family=acme&todo=20260919-0930-acme')).toBe(
      '/work/20260919-0930-acme'
    );
    // Two of them is a filtered queue, not one todo: the queue is the answer.
    expect(follow('work/shift', '/work/shift?todo=20260919-0930-acme,20260919-0931-acme')).toBe(
      '/work?todo=20260919-0930-acme,20260919-0931-acme'
    );
  });

  it('tells where the audit record went instead of redirecting', () => {
    const memoryRouter = createMemoryRouter(
      [{ path: '/audit', element: registeredElement('audit') }],
      { initialEntries: ['/audit'] }
    );
    render(<RouterProvider router={memoryRouter} />);
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByText(/Recorded events/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Activity' })).toBeInTheDocument();
    expect(memoryRouter.state.location.pathname).toBe('/audit');
  });
});
