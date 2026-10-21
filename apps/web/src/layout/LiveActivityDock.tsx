// LiveActivityDock.tsx — a collapsible strip docked above the status bar
// showing the last few pipeline events from `GET /api/v1/events`, on every
// page.
//
// It is pinned to the foot of the viewport, not left at the end of the page:
// a strip that says what the pipeline is doing right now is no use at y=7058
// of a 7295px page. Collapsed it is one line, and the shell reserves its
// height; opened it grows upward over the content it belongs to.
//
// Each row is a link to what the event is about — the same subject link the
// Activity page gives it (`primaryLink`) — and the feed is read on the page's
// family, the one its 'need you' count already used.
//
// It renders nothing unless the feed is readable: the read is admin-only, and
// a server that predates the pipeline visibility API has no feed. The
// collapsed state is a per-browser preference kept through the audited
// storage adapter (which swallows storage failures).

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { pillClass, toneClass } from '../components/tone/tone';
import { formatBadgeCount } from '../format/number';
import { absoluteText, clockText, zoneLabel } from '../format/when';
import { useAuth } from '../hooks/useAuth';
import { PIPELINE_KEY, useAttention, usePipelineEvents, usePipelineNudge } from '../hooks/usePipeline';
import { useFamilyScope } from '../components/family/FamilyScopeProvider';
import { attentionBadge, personalAttention, needsYouHref } from '../pages/needsYou/needsYouModel';
import {
  ACTIVITY_PATH,
  eventLabel,
  eventTone,
  foldEchoes,
  primaryLink,
} from '../pages/activity/activityModel';
import { useForgeHost } from '../hooks/useForgeHost';
import type { PipelineEvent, PipelineEventsQuery } from '../api/types/pipeline';
import { readBrowserText, writeBrowserText } from '../storage/browserStorage';

// Collapsed unless the reader opened it: one line that says the pipeline is
// alive costs nothing; eight lines take a third of a page that is about
// something else. The key is new so the old default (open) is not remembered.
const EXPANDED_KEY = 'jeryu.activityDock.expanded.v1';
const DOCK_EVENTS = 8;
// Twice what is shown: a finished gate arrives as two events that fold into one row.
const DOCK_LIMIT = DOCK_EVENTS * 2;

export function LiveActivityDock(): JSX.Element | null {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { pathname } = useLocation();
  const scope = useFamilyScope();
  // The page's family, so the rows and the count beside them are about the
  // same work. 'All families' asks for every family, as it does everywhere.
  const query: PipelineEventsQuery = useMemo(
    () => (scope.family ? { limit: DOCK_LIMIT, family: scope.family } : { limit: DOCK_LIMIT }),
    [scope.family]
  );
  const [collapsed, setCollapsed] = useState(
    () => readBrowserText('durable', EXPANDED_KEY) !== '1'
  );
  // The Activity page is this feed at full size, so the dock renders nothing
  // there: asking for its own eight events as well is a read a reader of that
  // page never sees.
  const onActivityPage = pathname === ACTIVITY_PATH;
  const feed = usePipelineEvents(query, {
    enabled: isAdmin && !onActivityPage,
    refetchInterval: 10_000,
  });
  usePipelineNudge(feed.isSuccess && !onActivityPage, [...PIPELINE_KEY, 'events', query]);
  // What needs a person is Needs you's answer, not "how many of the last eight
  // events were flagged": the dock showed 1 beside a nav badge of 3. It counts
  // and links to the same rows as every other surface, on the same family.
  const attention = useAttention(user?.role === 'admin');

  if (onActivityPage) return null;
  // The feed is admin-only: another role is never shown a strip of it, whatever
  // a cached answer in the query client might still hold.
  if (!isAdmin || !feed.isSuccess) return null;
  const events = foldEchoes(feed.data.events).slice(0, DOCK_EVENTS);
  const waiting = attentionBadge(personalAttention(attention.data, user?.login), {
    family: scope.family,
    repoFamilies: new Map(),
  }).count;

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
            <span className={pillClass('human')}>{formatBadgeCount(waiting)} need you</span>
          </Link>
        ) : null}
        <Link to={ACTIVITY_PATH} className="activity-dock__all">
          All activity
        </Link>
      </header>
      {collapsed ? null : <DockEvents events={events} />}
    </section>
  );
}

/** The opened list. Its own component: the subject links need the repository
 *  list for the forge each row is on, and only an opened dock asks for it. */
function DockEvents({ events }: { events: PipelineEvent[] }): JSX.Element {
  const forgeHost = useForgeHost();
  return (
    <div id="activity-dock-body" role="log" aria-live="off" aria-label="Newest pipeline events">
      <ol className="activity-dock__body">
        {events.length === 0 ? (
          <li className="activity-dock__empty">No pipeline events yet.</li>
        ) : (
          events.map((event) => {
            const link = primaryLink(event, forgeHost(event.repo ?? undefined));
            const line = (
              <>
                <time
                  className="activity-dock__meta"
                  dateTime={event.ts}
                  title={absoluteText(event.ts)}
                >
                  {clockText(event.ts)}
                </time>
                <span className="activity-dock__scope" title={event.kind}>
                  {eventLabel(event)}
                </span>
                <span className="activity-dock__summary">{event.summary}</span>
              </>
            );
            return (
              <li
                key={event.seq}
                className={toneClass('activity-dock__item', eventTone(event))}
              >
                {/* The whole row opens what the event is about: a reader who
                    sees a gate fail here goes to the pull request from here,
                    instead of finding it again on Activity. A row with no
                    subject of its own stays plain text. */}
                {link ? (
                  <Link className="activity-dock__row" to={link.to} title={link.label}>
                    {line}
                  </Link>
                ) : (
                  <span className="activity-dock__row">{line}</span>
                )}
              </li>
            );
          })
        )}
      </ol>
    </div>
  );
}
