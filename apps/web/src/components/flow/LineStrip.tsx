// LineStrip.tsx — the delivery line in one strip: the nine stations left to
// right, what is at each of them now, and the station that holds the most
// waiting.
//
// It is the typical path code takes (Queue → Work → Shift → Review → Gate →
// Merge → Pin → Stage → Deploy) plus where the work is right now, so the same
// strip heads the Flow page's Live mode and sits above the Activity histogram.
// `LineStrip` draws one report; `FlowLineStrip` reads the report itself for a
// page that has none, and leaves itself out when the viewer may not read
// `/api/v1/flow` — an empty or invented strip would say the line is quiet when
// nobody knows.
//
// House chart style: a fixed viewBox scaled to the container for the route
// itself, HTML labels above it so the words stay legible at 390px, and a
// vertical list once the line is narrower than the words. Tones follow the
// site's rule: red is a hold, amber is a wait past the station's own p90,
// green is flowing, and a station nothing has reached stays neutral and says
// nothing rather than zero.

import { Link } from 'react-router-dom';

import type { FlowReport } from '../../api/types';
import { toneClass } from '../tone/tone';
import { useFlow } from '../../hooks/useFlow';
import {
  bottleneckNote,
  lineTotals,
  stationCells,
  stationHref,
  type StationCell,
} from './lineStripModel';

import './LineStrip.css';

/** The route line the cells sit on: one fixed viewBox, scaled to the width. */
const WIDTH = 900;
const HEIGHT = 12;

export interface LineStripProps {
  report: FlowReport;
  /** Cycle time, X-factor and WIP beside the stations (the Flow header). */
  totals?: boolean;
  /** Smaller type and no totals: the strip above another page's content. */
  compact?: boolean;
  /** The family in scope, carried into the station links. */
  family?: string;
  /** Pick a station on this page instead of opening Flow. */
  onStation?: (id: string) => void;
  /** The station whose lots are listed, pressed in the strip. */
  activeStation?: string | null;
  testId?: string;
}

export function LineStrip({
  report,
  totals = false,
  compact = false,
  family,
  onStation,
  activeStation,
  testId = 'flow-line-strip',
}: LineStripProps): JSX.Element {
  const cells = stationCells(report);
  const bottleneck = bottleneckNote(report);
  return (
    <section
      className={`line-strip${compact ? ' line-strip--compact' : ''}`}
      aria-label="Delivery line"
      data-testid={testId}
    >
      <div className="line-strip__head">
        <h2 className="line-strip__title">
          Delivery line
          <span className="line-strip__route-words"> · Queue to Deploy</span>
          <span className="line-strip__route-words"> · waiting · active · held</span>
        </h2>
        {bottleneck ? (
          <p className="line-strip__bottleneck" data-testid={`${testId}-bottleneck`}>
            {bottleneck}
          </p>
        ) : (
          <p className="line-strip__bottleneck line-strip__bottleneck--none">
            No station holds more waiting than the rest
          </p>
        )}
      </div>

      {totals ? (
        <dl className="line-strip__totals" data-testid={`${testId}-totals`}>
          {lineTotals(report).map((total) => (
            <div key={total.id} className="line-strip__total" data-testid={`${testId}-${total.id}`}>
              <dt className="line-strip__total-label">{total.label}</dt>
              <dd className="line-strip__total-value">
                {total.value}
                <span className="line-strip__total-detail"> {total.detail}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="line-strip__route">
        {/* The route the work travels, drawn once behind the labels: the words
            above it are HTML, so they stay readable however narrow it gets. */}
        <svg
          className="line-strip__rail"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <rect className="line-strip__rail-line" x={0} y={HEIGHT / 2 - 1} width={WIDTH} height={2} />
          {cells.map((cell, index) => (
            <circle
              key={cell.id}
              className={`line-strip__rail-node is-${cell.tone}`}
              cx={((index + 0.5) / cells.length) * WIDTH}
              cy={HEIGHT / 2}
              r={3}
            />
          ))}
        </svg>
        <ol className="line-strip__stations">
          {cells.map((cell) => (
            <li key={cell.id} className="line-strip__item">
              <StationButton
                cell={cell}
                family={family}
                onStation={onStation}
                active={activeStation === cell.id}
                testId={`${testId}-station-${cell.id}`}
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** One station: a link into Flow, or a control that lists its lots in place. */
function StationButton({
  cell,
  family,
  onStation,
  active,
  testId,
}: {
  cell: StationCell;
  family?: string;
  onStation?: (id: string) => void;
  active: boolean;
  testId: string;
}): JSX.Element {
  const className = `${toneClass('line-strip__station', cell.tone)}${
    cell.bottleneck ? ' line-strip__station--bottleneck' : ''
  }${active ? ' is-active' : ''}`;
  const body = (
    <>
      <span className="line-strip__label">{cell.label}</span>
      {cell.wip === null ? (
        <span className="line-strip__unknown">—</span>
      ) : (
        <span className="line-strip__counts">
          <span className="line-strip__count line-strip__count--waiting">{cell.wip.waiting}</span>
          <span className="line-strip__count line-strip__count--active">{cell.wip.active}</span>
          <span className="line-strip__count line-strip__count--held">{cell.wip.held}</span>
        </span>
      )}
      {cell.bottleneck ? <span className="line-strip__flag">Bottleneck</span> : null}
    </>
  );
  if (onStation) {
    return (
      <button
        type="button"
        className={className}
        title={cell.title}
        aria-label={cell.title}
        aria-pressed={active}
        onClick={() => onStation(cell.id)}
        data-testid={testId}
      >
        {body}
      </button>
    );
  }
  return (
    <Link
      className={className}
      to={stationHref(cell.id, family)}
      title={cell.title}
      aria-label={`${cell.title}. Open it on Flow`}
      data-testid={testId}
    >
      {body}
    </Link>
  );
}

export interface FlowLineStripProps {
  /** The shell's family scope, or '' when a repository is the scope. */
  family?: string;
  compact?: boolean;
  testId?: string;
}

/**
 * The strip for a page that has no Flow report of its own. It reads
 * `/api/v1/flow` and, if that read is refused or the server predates it,
 * renders nothing at all: a reader who cannot see the line is shown no line,
 * rather than an empty one.
 */
export function FlowLineStrip({
  family,
  compact = true,
  testId = 'flow-line-strip',
}: FlowLineStripProps): JSX.Element | null {
  const report = useFlow(family ? { family } : {});
  if (report.isError || !report.data) return null;
  return (
    <LineStrip
      report={report.data}
      compact={compact}
      {...(family ? { family } : {})}
      testId={testId}
    />
  );
}
