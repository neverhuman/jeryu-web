// QualityGateChart.tsx — the daily pass/fail history as inline SVG.
//
// Same chart style as the Work → Workers charts (ShiftCharts): a fixed viewBox
// scaled to the container, a CSS class per mark so both themes come from
// tokens, role="img" with a spoken summary, and a <title> tooltip per column.

import type { QualityGateDay } from '../../api/types';
import { dailyGeometry } from './qualityGateModel';

const WIDTH = 960;
const HEIGHT = 160;
const AXIS = 20;
const GUTTER = 40;

export function QualityGateChart({ days }: { days: QualityGateDay[] }): JSX.Element {
  const plot = WIDTH - GUTTER;
  const geo = dailyGeometry(days, plot, HEIGHT);
  const scored = days.reduce((sum, day) => sum + day.passed + day.failed, 0);
  const failed = days.reduce((sum, day) => sum + day.failed, 0);
  const first = days[0]?.day;
  const last = days[days.length - 1]?.day;
  return (
    <div className="quality-gate__chart" data-testid="quality-gate-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT + AXIS}`}
        role="img"
        aria-label={`Scored heads per day: ${scored} scored over ${days.length} day${
          days.length === 1 ? '' : 's'
        }, ${failed} below the floor`}
      >
        {[0, 0.5, 1].map((frac) => (
          <g key={frac}>
            <line
              className="quality-gate__grid"
              x1={GUTTER}
              x2={WIDTH}
              y1={HEIGHT - frac * HEIGHT}
              y2={HEIGHT - frac * HEIGHT}
            />
            <text
              className="quality-gate__axis"
              x={0}
              y={Math.max(10, HEIGHT - frac * HEIGHT + 4)}
            >
              {Math.round(frac * geo.max)}
            </text>
          </g>
        ))}
        <g transform={`translate(${GUTTER} 0)`}>
          {geo.bars.map((bar) => (
            <g key={bar.day}>
              <rect
                className="quality-gate__bar is-passed"
                x={bar.x}
                y={bar.passY}
                width={bar.width}
                height={bar.passHeight}
              >
                <title>{bar.title}</title>
              </rect>
              <rect
                className="quality-gate__bar is-failed"
                x={bar.x}
                y={bar.failY}
                width={bar.width}
                height={bar.failHeight}
              >
                <title>{bar.title}</title>
              </rect>
            </g>
          ))}
        </g>
        {first ? (
          <text className="quality-gate__axis" x={GUTTER} y={HEIGHT + AXIS - 4}>
            {first}
          </text>
        ) : null}
        {last && last !== first ? (
          <text
            className="quality-gate__axis"
            x={WIDTH}
            y={HEIGHT + AXIS - 4}
            textAnchor="end"
          >
            {last}
          </text>
        ) : null}
      </svg>
      <div className="quality-gate__legend" aria-hidden="true">
        <span>
          <span className="quality-gate__swatch is-passed" />
          at or above the floor
        </span>
        <span>
          <span className="quality-gate__swatch is-failed" />
          below the floor
        </span>
      </div>
    </div>
  );
}
