// LiveActivityDock.tsx — a collapsible strip above the status bar showing the
// last few pipeline events from `GET /api/v1/events`, on every page.
//
// It renders nothing unless the feed is readable: the read is admin-only, and
// a server that predates the pipeline visibility API has no feed. The
// collapsed state is a per-browser preference kept through the audited
// storage adapter (which swallows storage failures).

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { pillClass, toneClass } from '../components/tone/tone';
import { absoluteText, clockText, zoneLabel } from '../format/when';
import { useAuth } from '../hooks/useAuth';
import { PIPELINE_KEY, useAttention, usePipelineEvents, usePipelineNudge } from '../hooks/usePipeline';
import { useFamilyScope } from '../components/family/FamilyScopeProvider';
import { attentionBadgeCount, needsYouHref } from '../pages/needsYou/needsYouModel';
import {
  ACTIVITY_PATH,
  eventLabel,
  eventTone,
  foldEchoes,
} from '../pages/activity/activityModel';
import type { PipelineEventsQuery } from '../api/types/pipeline';
import { readBrowserText, writeBrowserText } from '../storage/browserStorage';

// Collapsed unless the reader opened it: one line that says the pipeline is
// alive costs nothing; eight lines take a third of a page that is about
// something else. The key is new so the old default (open) is not remembered.
const EXPANDED_KEY = 'jeryu.activityDock.expanded.v1';
const DOCK_EVENTS = 8;
// Twice what is shown: a finished gate arrives as two events that fold into one row.
const DOCK_QUERY: PipelineEventsQuery = { limit: DOCK_EVENTS * 2 };

export function LiveActivityDock(): JSX.Element | null {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { pathname } = useLocation();
  const scope = useFamilyScope();
  const [collapsed, setCollapsed] = useState(
    () => readBrowserText('durable', EXPANDED_KEY) !== '1'
  );
  const feed = usePipelineEvents(DOCK_QUERY, {
    enabled: isAdmin,
    refetchInterval: 10_000,
  });
  usePipelineNudge(feed.isSuccess, [...PIPELINE_KEY, 'events', DOCK_QUERY]);
  // What needs a person is Needs you's answer, not "how many of the last eight
  // events were flagged": the dock showed 1 beside a nav badge of 3. It counts
  // and links to the same rows as every other surface, on the same family.
  const attention = useAttention(user?.role === 'admin');

  // The Activity page (and its wall) is this feed at full size.
  if (pathname === ACTIVITY_PATH) return null;
  // The feed is admin-only: another role is never shown a strip of it, whatever
  // a cached answer in the query client might still hold.
  if (!isAdmin || !feed.isSuccess) return null;
  const events = foldEchoes(feed.data.events).slice(0, DOCK_EVENTS);
  const waiting = attentionBadgeCount(attention.data);

  const toggle = (): void => {
    setCollapsed((prev) => {
      writeBrowserText('durable', EXPANDED_KEY, prev ? '1' : '0');
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
        <span className="activity-dock__zone" title="Times below are in your zone">
          {zoneLabel()}
        </span>
        {collapsed && events[0] ? (
          <span className="activity-dock__latest">
            {clockText(events[0].ts)} · {eventLabel(events[0])} · {events[0].summary}
          </span>
        ) : null}
        {waiting > 0 ? (
          <Link
            to={needsYouHref(scope.family)}
            className="activity-dock__needs-you"
            data-testid="activity-dock-needs-you"
          >
            <span className={pillClass('human')}>{waiting} need you</span>
          </Link>
        ) : null}
        <Link to={ACTIVITY_PATH} className="activity-dock__all">
          All activity
        </Link>
      </header>
      {collapsed ? null : (
        <div id="activity-dock-body" role="log" aria-live="off" aria-label="Newest pipeline events">
          <ol className="activity-dock__body">
            {events.length === 0 ? (
              <li className="activity-dock__empty">No pipeline events yet.</li>
            ) : (
              events.map((event) => (
                <li
                  key={event.seq}
                  className={toneClass('activity-dock__item', eventTone(event))}
                >
                  <time className="activity-dock__meta" dateTime={event.ts} title={absoluteText(event.ts)}>
                    {clockText(event.ts)}
                  </time>
                  <span className="activity-dock__scope" title={event.kind}>
                    {eventLabel(event)}
                  </span>
                  <span className="activity-dock__summary">{event.summary}</span>
                </li>
              ))
            )}
          </ol>
        </div>
      )}
    </section>
  );
}
