// EventRow.tsx — one pipeline event, shared by the Activity page, the wall,
// and the per-PR events panel. One line: when, which tool reported it as a
// small icon, what happened in plain words,
// the summary with its subject as the link, how long it took — with a thin bar
// behind the duration, scaled against the longest run of the same kind in the
// loaded list, so a slow gate or a long attempt shows at a glance. Everything else
// (who, which commit, why, the log tail, the event as the API returns it)
// opens below. A row that needs a human
// is red until a later event clears its cause; then it is marked resolved.
// A row the live tail just brought in slides down with a short wash, so the
// feed says "this is new" without moving anything else.
// The toggle stays on the rows that have something to say (a reason, a log);
// on the quiet ones it waits for the pointer or the keyboard.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { PipelineEvent } from '../../api/types';
import { CopyButton } from '../../components/copy/CopyButton';
import { pillClass, toneClass } from '../../components/tone/tone';
import { absoluteText, clockText, isSameLocalDay, relativeText } from '../../format/when';
import { useForgeHost } from '../../hooks/useForgeHost';
import { formatCost, shortSha } from '../shift/shiftModel';
import { sourceMark } from './sourceModel';
import { attemptUsage, attemptUsageText, attemptUsageTitle } from './usageModel';
import {
  durationShare,
  eventLabel,
  eventLinks,
  eventJson,
  eventTone,
  exactSecondsText,
  formatSeconds,
  hasDetail,
  summaryParts,
} from './activityModel';

import './Activity.css';

export function EventRow({
  event,
  defaultOpen = false,
  open: controlledOpen,
  focused,
  tabStop = false,
  onRest,
  resolved = false,
  arriving = false,
  longestSeconds,
  now,
  onOpenChange,
}: {
  event: PipelineEvent;
  defaultOpen?: boolean;
  /** Open from outside: a list whose keyboard expands the focused row holds
   *  the state for every row, so the row follows it instead of its own. */
  open?: boolean;
  /** Given at all, this row is one step of a keyboard-walked list: it takes
   *  the focus itself, and shows where the keyboard is when it has it. */
  focused?: boolean;
  /** Nothing in the list is focused yet and this is where Tab should land:
   *  the keyboard has to be able to reach the list in the first place. */
  tabStop?: boolean;
  /** The row was reached some other way (a click, Tab): where the keyboard
   *  should carry on from. */
  onRest?: (seq: number) => void;
  /** A later event cleared this row's cause: no attention pill. */
  resolved?: boolean;
  /** The row was not in the previous render: slide in and hold a wash. */
  arriving?: boolean;
  /** The longest duration this row's kind reached in the loaded list: what the
   *  bar behind the duration is scaled against. Absent, the duration is text. */
  longestSeconds?: number;
  /** The list's shared clock. Given it, a row from today reads as how long ago
   *  it was and ages with the tick; an older row keeps its clock, because the
   *  day is said once in its heading and "3 days ago" would hide it. */
  now?: number;
  /** Told when this row opens or closes: a feed holds new rows back while a
   *  reader has one open, so it has to know. */
  onOpenChange?: (seq: number, open: boolean) => void;
}): JSX.Element {
  const [selfOpen, setSelfOpen] = useState(defaultOpen);
  const open = controlledOpen ?? selfOpen;
  const toggle = (): void => {
    setSelfOpen(!open);
    onOpenChange?.(event.seq, !open);
  };
  // Reported through an effect, with the close on the way out: a row that
  // leaves the list while open must not keep the feed waiting for it.
  const report = useRef(onOpenChange);
  report.current = onOpenChange;
  useEffect(() => {
    report.current?.(event.seq, open);
    return () => report.current?.(event.seq, false);
  }, [event.seq, open]);
  const needsHuman = event.needs_human && !resolved;
  // A cleared row keeps its words ("Gate failed") but not its red: what it
  // reports is history, and the colour is for what still wants an answer.
  const tone = resolved ? 'unknown' : eventTone(event);
  // Which tool reported the row, as one icon in front of the label pill: the
  // name itself stays in the facts below, and in this mark's title.
  const { Icon: SourceIcon, ...mark } = sourceMark(event.source);
  const forgeHost = useForgeHost();
  const host = forgeHost(event.repo ?? undefined);
  const summary = summaryParts(event, host);
  const others = eventLinks(event, host).filter((link) => link.to !== summary.link?.to);
  const detailId = `activity-event-detail-${event.seq}`;
  const toggleLabel = open ? 'Hide' : event.log_tail ? 'Log' : event.reason ? 'Why' : 'More';
  const quiet = !open && !hasDetail(event);
  const duration = formatSeconds(event.seconds);
  // A bar behind the duration, as long as this row's share of the longest run
  // of its kind: a slow gate or a long attempt stands out without reading.
  const share = durationShare(event.seconds, longestSeconds);
  // What the attempt spent, when the producer attached it to the row.
  const usage = attemptUsage(event);
  // Today's rows read as an age; the clock is still in `title` either way.
  const whenText =
    now !== undefined && isSameLocalDay(event.ts, now)
      ? relativeText(event.ts, now)
      : clockText(event.ts);

  return (
    <li
      className={`${toneClass('activity-row', tone)}${needsHuman ? ' is-needs-human' : ''}${
        arriving ? ' is-arriving' : ''
      }${focused ? ' is-focused' : ''}`}
      data-testid={`activity-event-${event.seq}`}
      // A row of a keyboard-walked list is the focus stop, with the roving
      // tabindex: Tab reaches the list once, and j/k move within it.
      tabIndex={focused === undefined ? undefined : focused || tabStop ? 0 : -1}
      onFocus={focused === undefined ? undefined : () => onRest?.(event.seq)}
    >
      <div className="activity-row__line">
        <time className="activity-row__time" dateTime={event.ts} title={absoluteText(event.ts)}>
          {whenText}
        </time>
        <span
          className="activity-row__source-icon"
          data-source-group={mark.group}
          data-testid={`activity-event-source-${event.seq}`}
          role="img"
          title={mark.title}
          aria-label={mark.title}
        >
          <SourceIcon size={13} aria-hidden="true" />
        </span>
        <span
          className={pillClass(tone)}
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
        {needsHuman ? <span className={pillClass('human')}>needs you</span> : null}
        {event.needs_human && resolved ? (
          <span className="page__pill" title="A later event cleared this">
            resolved
          </span>
        ) : null}
        {typeof event.cost_usd === 'number' ? (
          <span className="activity-row__meta">{formatCost(event.cost_usd)}</span>
        ) : null}
        {usage ? (
          <span className="activity-row__meta" title={attemptUsageTitle(usage)}>
            {attemptUsageText(usage)}
          </span>
        ) : null}
        {duration ? (
          <span className="activity-row__duration" title={exactSecondsText(event.seconds)}>
            {share === null ? null : (
              <span
                className="activity-row__duration-bar"
                style={{ width: `${(share * 100).toFixed(1)}%` }}
                aria-hidden="true"
              />
            )}
            <span className="activity-row__meta">{duration}</span>
          </span>
        ) : null}
        <button
          type="button"
          className={`activity-row__toggle${quiet ? ' activity-row__toggle--quiet' : ''}`}
          aria-expanded={open}
          aria-controls={detailId}
          aria-label={`${toggleLabel} for event ${event.seq}`}
          onClick={toggle}
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
          {/* The row in the words the API uses, for a ticket, a script or an
              agent: the event exactly as the feed received it. */}
          <p className="activity-row__json">
            <CopyButton
              text={eventJson(event)}
              label={`event ${event.seq} as JSON`}
              testId={`activity-event-json-${event.seq}`}
            >
              Copy JSON
            </CopyButton>
          </p>
        </div>
      ) : null}
    </li>
  );
}
