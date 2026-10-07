// BurstRow.tsx — one row for a burst of identical reports: the same verdict,
// from the same actor, for the same reason, filed on one subject after another
// within half an hour. Twelve of them differed only in a pull request number
// and filled a screen with one sentence repeated; folded they say it once and
// count the subjects — `pragent requested changes on 12 jain pull requests` —
// and the rows around them are readable again. Opened, the row hands over the
// reports themselves, each as the ordinary event row it would have been.

import { pillClass, toneClass } from '../../components/tone/tone';
import { absoluteText, clockText, isSameLocalDay, relativeText } from '../../format/when';
import { EventRow } from './EventRow';
import { burstTitle, type EventBurst, eventLabel, eventTone } from './activityModel';

import './Activity.css';

export function BurstRow({
  burst,
  open,
  focused,
  tabStop = false,
  onRest,
  arriving = false,
  now,
  onOpenChange,
}: {
  burst: EventBurst;
  /** Held by the list, like an event row's: its keyboard opens the focused row. */
  open: boolean;
  focused?: boolean;
  tabStop?: boolean;
  onRest?: (seq: number) => void;
  arriving?: boolean;
  now?: number;
  onOpenChange?: (seq: number, open: boolean) => void;
}): JSX.Element {
  const latest = burst.latest;
  const tone = eventTone(latest);
  const count = burst.events.length;
  const detailId = `activity-burst-detail-${latest.seq}`;
  const whenText =
    now !== undefined && isSameLocalDay(latest.ts, now) ? relativeText(latest.ts, now) : clockText(latest.ts);

  return (
    <li
      className={`${toneClass('activity-row', tone)} activity-row--burst${arriving ? ' is-arriving' : ''}${
        focused ? ' is-focused' : ''
      }`}
      data-testid={`activity-burst-${latest.seq}`}
      tabIndex={focused === undefined ? undefined : focused || tabStop ? 0 : -1}
      onFocus={focused === undefined ? undefined : () => onRest?.(latest.seq)}
    >
      <div className="activity-row__line">
        <time className="activity-row__time" dateTime={latest.ts} title={absoluteText(latest.ts)}>
          {whenText}
        </time>
        <span className={pillClass(tone)} title={latest.kind}>
          {eventLabel(latest)}
        </span>
        <span className="activity-row__summary">{burstTitle(burst)}</span>
        {/* The one reason they all gave, said once. */}
        {burst.reason ? <span className="activity-row__burst-reason">{burst.reason}</span> : null}
        <span className="activity-row__meta">×{count}</span>
        <button
          type="button"
          className="activity-row__toggle"
          aria-expanded={open}
          aria-controls={detailId}
          aria-label={`${open ? 'Hide' : 'Show'} the ${count} events of ${burstTitle(burst)}`}
          onClick={() => onOpenChange?.(latest.seq, !open)}
          data-testid={`activity-burst-toggle-${latest.seq}`}
        >
          {open ? 'Hide' : 'Each'}
        </button>
      </div>
      {open ? (
        <ol className="activity-row__detail activity-row__burst-events" id={detailId}>
          {burst.events.map((event) => (
            <EventRow key={event.seq} event={event} now={now} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}
