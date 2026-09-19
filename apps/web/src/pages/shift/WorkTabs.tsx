// WorkTabs.tsx — the Queue → Add → Workers strip shared by the split-wide
// Work pages: the todoq shift queue (file todos, watch them land on
// bullet/night shifts, and see which worker slots are doing what). `/work`
// itself redirects to the Queue; the old Tracker board is retired.

import { NavLink } from 'react-router-dom';

import './Shift.css';

export const SHIFT_QUEUE_PATH = '/work/shift';
export const SHIFT_ADD_PATH = '/work/shift/new';
export const SHIFT_WORKERS_PATH = '/work/shift/workers';

const TABS = [
  { to: SHIFT_QUEUE_PATH, label: 'Queue', hint: 'Shift todos and their branches' },
  { to: SHIFT_ADD_PATH, label: 'Add', hint: 'File todos for a shift' },
  { to: SHIFT_WORKERS_PATH, label: 'Workers', hint: 'Worker slots, timeline and capacity' },
] as const;

/** Queue link that expands (and filters to) the given todos. */
export function queueHref(family: string, ids: string[] = []): string {
  const qs = new URLSearchParams({ family });
  if (ids.length > 0) qs.set('todo', ids.join(','));
  return `${SHIFT_QUEUE_PATH}?${qs.toString()}`;
}

export function WorkTabs(): JSX.Element {
  return (
    <nav className="work-tabs" aria-label="Work">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          title={tab.hint}
          className={({ isActive }) => `work-tabs__tab${isActive ? ' is-active' : ''}`}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
