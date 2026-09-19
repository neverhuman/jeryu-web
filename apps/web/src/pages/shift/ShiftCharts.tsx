// ShiftCharts.tsx — inline SVG timeline + capacity chart for Work → Workers.
//
// Follows the repo's chart style (GraphSvg): a fixed viewBox scaled to the
// container, CSS classes for every mark so both themes come from tokens,
// role="img" with a text summary, and <title> tooltips on each mark.

import type { ShiftCapacityPoint, ShiftSlotHistory } from '../../api/types';
import { capacityGeometry, layoutSegments, slotLabel, timeTicks } from './shiftModel';

const WIDTH = 960;
const LABEL = 170;
const LANE = 24;
const AXIS = 20;

function tickLabel(at: Date, spanHours: number): string {
  return spanHours > 48
    ? at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function ShiftTimeline({
  from,
  to,
  slots,
}: {
  from: string;
  to: string;
  slots: ShiftSlotHistory[];
}): JSX.Element {
  const plot = WIDTH - LABEL;
  const height = slots.length * LANE + AXIS;
  const spanHours = (Date.parse(to) - Date.parse(from)) / 3_600_000;
  const ticks = timeTicks(from, to, 6);
  return (
    <div className="shift-chart" data-testid="shift-timeline">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={`Worker timeline: ${slots.length} slot${slots.length === 1 ? '' : 's'} from ${from} to ${to}`}
      >
        {ticks.map((tick) => (
          <g key={tick.frac}>
            <line
              className="shift-chart__grid"
              x1={LABEL + tick.frac * plot}
              x2={LABEL + tick.frac * plot}
              y1={0}
              y2={slots.length * LANE}
            />
            <text
              className="shift-chart__axis"
              x={LABEL + tick.frac * plot}
              y={height - 6}
              textAnchor={tick.frac === 0 ? 'start' : tick.frac === 1 ? 'end' : 'middle'}
            >
              {tickLabel(tick.at, spanHours)}
            </text>
          </g>
        ))}
        {slots.map((slot, lane) => {
          const y = lane * LANE;
          const bars = layoutSegments(slot.segments, from, to, plot);
          return (
            <g key={`${slot.operator}/${slot.host}/${slot.slot}/${slot.family}`}>
              <text className="shift-chart__lane-label" x={0} y={y + LANE * 0.65}>
                {slotLabel(slot.operator, slot.host, slot.slot)}
              </text>
              {bars.map((bar, i) => (
                <g key={i}>
                  <rect
                    className={`shift-chart__seg is-${bar.state}`}
                    x={LABEL + bar.x}
                    y={y + 3}
                    width={bar.width}
                    height={LANE - 6}
                    rx={2}
                  >
                    <title>{bar.title}</title>
                  </rect>
                  {bar.label && bar.width > bar.label.length * 5.5 ? (
                    <text className="shift-chart__bar-label" x={LABEL + bar.x + 3} y={y + LANE * 0.65}>
                      {bar.label}
                    </text>
                  ) : null}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="shift-chart__legend" aria-hidden="true">
        {['working', 'idle', 'stopping', 'paused'].map((state) => (
          <span key={state}>
            <span className={`shift-chart__swatch is-${state}`} />
            {state}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ShiftCapacityChart({
  points,
}: {
  points: ShiftCapacityPoint[];
}): JSX.Element {
  const height = 160;
  const plot = WIDTH - 40;
  const geo = capacityGeometry(points, plot, height);
  const first = points[0]?.at;
  const last = points[points.length - 1]?.at;
  const peakBusy = Math.max(0, ...points.map((p) => p.busy));
  const peakPlanned = Math.max(0, ...points.map((p) => p.planned));
  return (
    <div className="shift-chart" data-testid="shift-capacity">
      <svg
        viewBox={`0 0 ${WIDTH} ${height + AXIS}`}
        role="img"
        aria-label={`Capacity per hour: peak ${peakBusy} busy of ${peakPlanned} planned slots over ${points.length} hours`}
      >
        {[0, 0.5, 1].map((frac) => (
          <g key={frac}>
            <line
              className="shift-chart__grid"
              x1={40}
              x2={WIDTH}
              y1={height - frac * height}
              y2={height - frac * height}
            />
            <text className="shift-chart__axis" x={0} y={Math.max(10, height - frac * height + 4)}>
              {Math.round(frac * geo.max)}
            </text>
          </g>
        ))}
        <g transform="translate(40 0)">
          {geo.bars.map((bar) => (
            <rect
              key={bar.at}
              className="shift-chart__busy"
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
            >
              <title>{`${bar.at}: ${bar.busy} busy`}</title>
            </rect>
          ))}
          {geo.plannedPath ? <path className="shift-chart__planned" d={geo.plannedPath} /> : null}
          {geo.queuePoints ? (
            <polyline className="shift-chart__queue" points={geo.queuePoints} />
          ) : null}
        </g>
        {first ? (
          <text className="shift-chart__axis" x={40} y={height + AXIS - 4}>
            {new Date(first).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' })}
          </text>
        ) : null}
        {last ? (
          <text className="shift-chart__axis" x={WIDTH} y={height + AXIS - 4} textAnchor="end">
            {new Date(last).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' })}
          </text>
        ) : null}
      </svg>
      <div className="shift-chart__legend" aria-hidden="true">
        <span>
          <span className="shift-chart__swatch is-planned" />
          planned slots
        </span>
        <span>
          <span className="shift-chart__swatch is-busy" />
          busy slots
        </span>
        {geo.queuePoints ? (
          <span>
            <span className="shift-chart__swatch is-queue" />
            queue depth
          </span>
        ) : null}
      </div>
    </div>
  );
}
