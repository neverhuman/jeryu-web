// LiveActivityDock.tsx — a collapsible strip above the status bar showing the
// last few pipeline events from `GET /api/v1/events`, on every page.
//
// It renders nothing unless the feed is readable: the read is admin-only, and
// a server that predates the pipeline visibility API has no feed. The
// collapsed state is a per-browser preference kept through the audited
// storage adapter (which swallows storage failures).

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import { PIPELINE_KEY, usePipelineEvents, usePipelineNudge } from '../hooks/usePipeline';
import { ACTIVITY_PATH, eventTone, formatClock } from '../pages/activity/activityModel';
import { readBrowserText, writeBrowserText } from '../storage/browserStorage';

const COLLAPSED_KEY = 'jeryu.activityDock.collapsed.v1';
const DOCK_EVENTS = 8;
const DOCK_QUERY = { limit: DOCK_EVENTS } as const;

export function LiveActivityDock(): JSX.Element | null {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(
    () => readBrowserText('durable', COLLAPSED_KEY) === '1'
  );
  const feed = usePipelineEvents(DOCK_QUERY, {
    enabled: user?.role === 'admin',
    refetchInterval: 10_000,
  });
  usePipelineNudge(feed.isSuccess, [...PIPELINE_KEY, 'events', DOCK_QUERY]);

  if (!feed.isSuccess) return null;
  const events = feed.data.events.slice(0, DOCK_EVENTS);
  const waiting = events.filter((event) => event.needs_human).length;

  const toggle = (): void => {
    setCollapsed((prev) => {
      writeBrowserText('durable', COLLAPSED_KEY, prev ? '0' : '1');
      return !prev;
    });
  };

  return (
    <section className="activity-dock" aria-label="Live activity" data-testid="activity-dock">
      <header className="activity-dock__header">
        <button
          type="button"
          className="activity-dock__toggle"
          aria-expanded={!collapsed}
          aria-controls="activity-dock-body"
          onClick={toggle}
        >
          {collapsed ? <ChevronUp aria-hidden="true" size={14} /> : <ChevronDown aria-hidden="true" size={14} />}
          Live activity
        </button>
        {collapsed && events[0] ? (
          <span className="activity-dock__latest">
            {formatClock(events[0].ts)} · {events[0].summary}
          </span>
        ) : null}
        {waiting > 0 ? (
          <span className="page__pill page__pill--danger">{waiting} need you</span>
        ) : null}
        <Link to={ACTIVITY_PATH} className="activity-dock__all">
          All activity
        </Link>
      </header>
      {collapsed ? null : (
        <ol className="activity-dock__body" id="activity-dock-body" role="log" aria-live="off">
          {events.length === 0 ? (
            <li className="activity-dock__empty">No pipeline events yet.</li>
          ) : (
            events.map((event) => (
              <li
                key={event.seq}
                className={`activity-dock__item activity-dock__item--${eventTone(event)}`}
              >
                <time className="activity-dock__meta" dateTime={event.ts}>
                  {formatClock(event.ts)}
                </time>
                <span className="activity-dock__scope">{event.kind}</span>
                <span className="activity-dock__summary">{event.summary}</span>
              </li>
            ))
          )}
        </ol>
      )}
    </section>
  );
}
