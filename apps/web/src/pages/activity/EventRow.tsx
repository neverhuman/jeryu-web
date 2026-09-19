// EventRow.tsx — one pipeline event, shared by the Activity page, the wall,
// and the per-PR events panel. A row that needs a human is red.

import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { PipelineEvent } from '../../api/types';
import { formatCost, shortSha } from '../shift/shiftModel';
import { eventLinks, eventTone, formatClock, formatSeconds } from './activityModel';

import './Activity.css';

export function EventRow({
  event,
  defaultOpen = false,
}: {
  event: PipelineEvent;
  defaultOpen?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const tone = eventTone(event);
  const links = eventLinks(event);
  const hasMore = Boolean(event.log_tail || event.reason || event.log_url);
  const detailId = `activity-event-detail-${event.seq}`;
  const toggleLabel = open ? 'Hide' : event.log_tail ? 'Log' : 'Why';
  const duration = formatSeconds(event.seconds);

  return (
    <li
      className={`activity-row activity-row--${tone}${event.needs_human ? ' is-needs-human' : ''}`}
      data-testid={`activity-event-${event.seq}`}
    >
      <div className="activity-row__line">
        <time className="activity-row__time" dateTime={event.ts} title={event.ts}>
          {formatClock(event.ts)}
        </time>
        <span className="activity-row__source">{event.source}</span>
        <span className={tone === 'info' ? 'page__pill' : `page__pill page__pill--${tone}`}>{event.kind}</span>
        <span className="activity-row__summary">{event.summary}</span>
        {event.needs_human ? <span className="page__pill page__pill--danger">needs you</span> : null}
        {event.outcome ? <span className="activity-row__meta">{event.outcome}</span> : null}
        {event.actor ? <span className="activity-row__meta">{event.actor}</span> : null}
        {typeof event.cost_usd === 'number' ? (
          <span className="activity-row__meta">{formatCost(event.cost_usd)}</span>
        ) : null}
        {duration ? <span className="activity-row__meta">{duration}</span> : null}
        {event.sha ? (
          <code className="activity-row__meta" title={event.sha}>
            {shortSha(event.sha)}
          </code>
        ) : null}
        {links.map((link) => (
          <Link key={link.to} to={link.to} className="activity-row__link">
            {link.label}
          </Link>
        ))}
        {hasMore ? (
          <button
            type="button"
            className="activity-row__toggle"
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={`${toggleLabel} for event ${event.seq}`}
            onClick={() => setOpen((v) => !v)}
          >
            {toggleLabel}
          </button>
        ) : null}
      </div>
      {open && hasMore ? (
        <div className="activity-row__detail" id={detailId}>
          {event.reason ? <p className="activity-row__reason">{event.reason}</p> : null}
          {event.log_tail ? (
            <pre className="activity-row__log" tabIndex={0} aria-label={`Log tail of event ${event.seq}`}>
              {event.log_tail}
            </pre>
          ) : null}
          {event.log_url && /^(https?:\/\/|\/)/.test(event.log_url) ? (
            <a href={event.log_url} target="_blank" rel="noreferrer">
              Full log
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
