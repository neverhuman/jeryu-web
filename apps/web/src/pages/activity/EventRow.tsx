// EventRow.tsx — one pipeline event, shared by the Activity page, the wall,
// and the per-PR events panel. One line: when, what happened in plain words,
// the summary with its subject as the link, how long it took. Everything else
// (who, which commit, why, the log tail) opens below. A row that needs a human
// is red until a later event clears its cause; then it is marked resolved.

import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { PipelineEvent } from '../../api/types';
import { formatCost, shortSha } from '../shift/shiftModel';
import {
  eventLabel,
  eventLinks,
  eventTone,
  formatClock,
  formatSeconds,
  summaryParts,
} from './activityModel';

import './Activity.css';

export function EventRow({
  event,
  defaultOpen = false,
  resolved = false,
}: {
  event: PipelineEvent;
  defaultOpen?: boolean;
  /** A later event cleared this row's cause: no attention pill. */
  resolved?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const needsHuman = event.needs_human && !resolved;
  const tone = eventTone({ ...event, needs_human: needsHuman });
  const summary = summaryParts(event);
  const others = eventLinks(event).filter((link) => link.to !== summary.link?.to);
  const detailId = `activity-event-detail-${event.seq}`;
  const toggleLabel = open ? 'Hide' : event.log_tail ? 'Log' : event.reason ? 'Why' : 'More';
  const duration = formatSeconds(event.seconds);

  return (
    <li
      className={`activity-row activity-row--${tone}${needsHuman ? ' is-needs-human' : ''}`}
      data-testid={`activity-event-${event.seq}`}
    >
      <div className="activity-row__line">
        <time className="activity-row__time" dateTime={event.ts} title={event.ts}>
          {formatClock(event.ts)}
        </time>
        <span
          className={tone === 'info' ? 'page__pill' : `page__pill page__pill--${tone}`}
          title={event.kind}
        >
          {eventLabel(event)}
        </span>
        <span className="activity-row__summary">
          {summary.before}
          {summary.link ? (
            <Link to={summary.link.to} className="activity-row__link">
              {summary.link.label}
            </Link>
          ) : null}
          {summary.after}
        </span>
        {needsHuman ? <span className="page__pill page__pill--danger">needs you</span> : null}
        {event.needs_human && resolved ? (
          <span className="page__pill" title="A later event cleared this">
            resolved
          </span>
        ) : null}
        {typeof event.cost_usd === 'number' ? (
          <span className="activity-row__meta">{formatCost(event.cost_usd)}</span>
        ) : null}
        {duration ? <span className="activity-row__meta">{duration}</span> : null}
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
      </div>
      {open ? (
        <div className="activity-row__detail" id={detailId}>
          {event.reason ? <p className="activity-row__reason">{event.reason}</p> : null}
          <p className="activity-row__facts">
            <span>{event.source}</span>
            <span>{event.kind}</span>
            {event.outcome ? <span>{event.outcome}</span> : null}
            {event.actor ? <span>{event.actor}</span> : null}
            {event.sha ? <code title={event.sha}>{shortSha(event.sha)}</code> : null}
            {others.map((link) => (
              <Link key={link.to} to={link.to} className="activity-row__link">
                {link.label}
              </Link>
            ))}
          </p>
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
