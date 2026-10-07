// StageRunRow.tsx — one row for a run of `worker.stage` beats: the several
// reports one slot sends while it walks an attempt (prepare -> agent -> gate
// -> land). Folded they say more than they did apart: the row draws the whole
// ladder, marks the stages the run has walked, and keeps a quiet pulse on the
// one it is on, so the outcome rows around it stay readable. Opened, it hands
// over the beats themselves, each as the ordinary event row it would have been.

import { pillClass, toneClass } from '../../components/tone/tone';
import { absoluteText, clockText, isSameLocalDay, relativeText } from '../../format/when';
import { useForgeHost } from '../../hooks/useForgeHost';
import { EventRow } from './EventRow';
import { InlineProse } from './InlineProse';
import { type StageRun, stageRunTitle, stageSteps, summaryParts } from './activityModel';

import './Activity.css';

export function StageRunRow({
  run,
  open,
  focused,
  tabStop = false,
  onRest,
  arriving = false,
  now,
  onOpenChange,
}: {
  run: StageRun;
  /** Held by the list, like an event row's: its keyboard opens the focused row. */
  open: boolean;
  focused?: boolean;
  tabStop?: boolean;
  onRest?: (seq: number) => void;
  arriving?: boolean;
  now?: number;
  onOpenChange?: (seq: number, open: boolean) => void;
}): JSX.Element {
  const latest = run.latest;
  const forgeHost = useForgeHost();
  const summary = summaryParts(latest, forgeHost(latest.repo ?? undefined));
  const steps = stageSteps(run);
  const detailId = `activity-stages-detail-${latest.seq}`;
  const whenText =
    now !== undefined && isSameLocalDay(latest.ts, now) ? relativeText(latest.ts, now) : clockText(latest.ts);

  return (
    <li
      className={`${toneClass('activity-row', 'unknown')} activity-row--stages${
        arriving ? ' is-arriving' : ''
      }${focused ? ' is-focused' : ''}`}
      data-testid={`activity-stages-${latest.seq}`}
      tabIndex={focused === undefined ? undefined : focused || tabStop ? 0 : -1}
      onFocus={focused === undefined ? undefined : () => onRest?.(latest.seq)}
    >
      <div className="activity-row__line">
        <time className="activity-row__time" dateTime={latest.ts} title={absoluteText(latest.ts)}>
          {whenText}
        </time>
        <span className={pillClass('unknown')} title={latest.kind}>
          Worker {run.slot}
        </span>
        <ol className="activity-row__stages" aria-label={stageRunTitle(run)}>
          {steps.map((step) => (
            <li
              key={step.stage}
              className={`activity-row__stage${step.walked ? ' is-walked' : ''}${
                step.current ? ' is-current' : ''
              }`}
              aria-current={step.current ? 'step' : undefined}
            >
              {step.stage}
            </li>
          ))}
        </ol>
        <span className="activity-row__summary">
          <InlineProse text={latest.summary} link={summary.link} />
        </span>
        <span className="activity-row__meta">{run.events.length} steps</span>
        <button
          type="button"
          className="activity-row__toggle"
          aria-expanded={open}
          aria-controls={detailId}
          aria-label={`${open ? 'Hide' : 'Show'} the ${run.events.length} stage events of slot ${run.slot}`}
          onClick={() => onOpenChange?.(latest.seq, !open)}
          data-testid={`activity-stages-toggle-${latest.seq}`}
        >
          {open ? 'Hide' : 'Steps'}
        </button>
      </div>
      {open ? (
        <ol className="activity-row__detail activity-row__stage-events" id={detailId}>
          {run.events.map((event) => (
            <EventRow key={event.seq} event={event} now={now} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}
