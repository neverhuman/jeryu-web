// PresenceTimeline.tsx — a Gantt-style strip of when an agent worked, and
// the shared axis above a list of them. presenceTimelineModel.ts does the math.

import type { CSSProperties } from 'react';

import type { AgentPresenceItem } from '../../api/agentPresence';

import { SPAN_LABEL, timelineBar, timelineTicks, type TimelineWindow } from './presenceTimelineModel';

import './PresenceTimeline.css';

const percent = (fraction: number): string => `${(fraction * 100).toFixed(3)}%`;

export function TimelineStrip({ item, window, now }: {
  item: Pick<AgentPresenceItem, 'id' | 'state' | 'started_at' | 'last_active_at'>;
  window: TimelineWindow;
  now: number;
}): JSX.Element {
  const bar = timelineBar(item, window, now);
  const label = bar ? bar.summary : `Not seen in the ${SPAN_LABEL[window.span].toLowerCase()}.`;
  return (
    <div className="presence-timeline" role="img" aria-label={label} title={label} data-testid={`presence-timeline-${item.id}`}>
      {bar ? (
        <>
          <span
            className={`presence-timeline__bar presence-timeline__bar--${item.state}${bar.clippedStart ? ' is-clipped' : ''}${bar.ended ? ' is-ended' : ''}`}
            style={{ left: percent(bar.left), width: percent(bar.width) }}
            data-testid={`presence-timeline-bar-${item.id}`}
          />
          {bar.tailWidth > 0 ? (
            <span className="presence-timeline__tail" style={{ left: percent(bar.left + bar.width), width: percent(bar.tailWidth) }} />
          ) : null}
          {bar.tail === 'running' ? <span className="presence-timeline__now" style={{ left: percent(bar.left + bar.width) }} /> : null}
        </>
      ) : null}
    </div>
  );
}

/** Hour ticks for the window, aligned with every TimelineStrip below it. */
export function TimelineAxis({ window }: { window: TimelineWindow }): JSX.Element {
  const ticks = timelineTicks(window);
  return (
    <div className="presence-axis" aria-hidden="true" data-testid="presence-timeline-axis">
      {ticks.map((tick) => (
        <span key={tick.at} className="presence-axis__tick" style={{ '--tick': percent(tick.offset) } as CSSProperties}>
          {tick.label}
        </span>
      ))}
      <span className="presence-axis__tick presence-axis__tick--now">now</span>
    </div>
  );
}
