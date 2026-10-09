// YieldTrendChart.tsx — cost per merged change, week by week, inline SVG.
//
// The house chart style of Work → Workers (ShiftCharts) and the Quality gate chart:
// a fixed viewBox scaled to the container, a CSS class per mark so both themes
// come from tokens, role="img" with a spoken summary, and a <title> tooltip on
// every point. One line per group, the few largest by spend.

import type { YieldWeek } from '../../api/types';
import { formatUsd, trendData, trendGeometry, trendSummary } from './yieldModel';

const WIDTH = 960;
const HEIGHT = 160;
const AXIS = 20;
const GUTTER = 56;
const PAD = 12;

export function YieldTrendChart({
  weekly,
  order,
}: {
  weekly: readonly YieldWeek[];
  /** Group names in the order the breakdown table lists them. */
  order: readonly string[];
}): JSX.Element {
  const data = trendData(weekly, order);
  const plot = WIDTH - GUTTER - PAD * 2;
  const geo = trendGeometry(data, plot, HEIGHT - PAD);
  const first = data.weeks[0];
  const last = data.weeks[data.weeks.length - 1];
  return (
    <div className="yield-chart" data-testid="yield-trend">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT + AXIS}`} role="img" aria-label={trendSummary(data)}>
        {[0, 0.5, 1].map((frac) => (
          <g key={frac}>
            <line
              className="yield-chart__grid"
              x1={GUTTER}
              x2={WIDTH}
              y1={HEIGHT - frac * (HEIGHT - PAD)}
              y2={HEIGHT - frac * (HEIGHT - PAD)}
            />
            <text
              className="yield-chart__axis"
              x={0}
              y={Math.max(10, HEIGHT - frac * (HEIGHT - PAD) + 4)}
            >
              {formatUsd(frac * geo.max)}
            </text>
          </g>
        ))}
        <g transform={`translate(${GUTTER + PAD} ${PAD})`}>
          {geo.lines.map((line, index) => (
            <g key={line.group} className={`yield-chart__series is-series-${index}`}>
              {line.path ? <path className="yield-chart__line" d={line.path} /> : null}
              {line.dots.map((dot) => (
                <circle key={dot.title} className="yield-chart__dot" cx={dot.x} cy={dot.y} r={4}>
                  <title>{dot.title}</title>
                </circle>
              ))}
            </g>
          ))}
        </g>
        {first ? (
          <text className="yield-chart__axis" x={GUTTER + PAD} y={HEIGHT + AXIS - 4}>
            {first}
          </text>
        ) : null}
        {last && last !== first ? (
          <text className="yield-chart__axis" x={WIDTH - PAD} y={HEIGHT + AXIS - 4} textAnchor="end">
            {last}
          </text>
        ) : null}
      </svg>
      <div className="yield-chart__legend" aria-hidden="true">
        {data.series.map((series, index) => (
          <span key={series.group}>
            <span className={`yield-chart__swatch is-series-${index}`} />
            {series.group}
          </span>
        ))}
        {data.omitted > 0 ? (
          <span className="yield-chart__more">
            {data.omitted} smaller group{data.omitted === 1 ? '' : 's'} in the table below
          </span>
        ) : null}
      </div>
    </div>
  );
}
