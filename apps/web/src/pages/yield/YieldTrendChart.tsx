// YieldTrendChart.tsx — cost per merged change, week by week, inline SVG.
//
// The house chart style of Work → Workers (ShiftCharts) and the Quality gate
// chart: a fixed viewBox, a CSS class per mark so both themes come from
// tokens, role="img" with a spoken summary, and a <title> tooltip on every
// point. One line per group, the few largest by spend.
//
// Text is HTML beside the plot, not SVG: the plot stretches to the container
// at a fixed height (`preserveAspectRatio="none"`, strokes that do not
// scale), so on a phone the axis labels keep the page's own font size
// instead of shrinking with the drawing. Points are zero-length round-capped
// strokes, which stay round however the plot is stretched.

import type { YieldWeek } from '../../api/types';
import { formatUsd, trendData, trendGeometry, trendSummary } from './yieldModel';

const WIDTH = 960;
const HEIGHT = 160;
/** Room above the top grid line and below the bottom one, in viewBox units. */
const PAD = 10;
/** Room at each end of the weeks, so a point is never cut in half. */
const INSET = 12;

/** Where a value fraction (0 bottom, 1 top) sits, in viewBox units. */
function yOf(frac: number): number {
  return PAD + (1 - frac) * (HEIGHT - PAD * 2);
}

export function YieldTrendChart({
  weekly,
  order,
}: {
  weekly: readonly YieldWeek[];
  /** Group names in the order the breakdown table lists them. */
  order: readonly string[];
}): JSX.Element {
  const data = trendData(weekly, order);
  const geo = trendGeometry(data, WIDTH - INSET * 2, HEIGHT - PAD * 2);
  const first = data.weeks[0];
  const last = data.weeks[data.weeks.length - 1];
  const grid = [1, 0.5, 0];
  return (
    <div className="yield-chart" data-testid="yield-trend">
      <div className="yield-chart__frame">
        <div className="yield-chart__y" aria-hidden="true">
          {grid.map((frac) => (
            <span
              key={frac}
              className="yield-chart__y-label"
              style={{ top: `${(yOf(frac) / HEIGHT) * 100}%` }}
            >
              {formatUsd(frac * geo.max)}
            </span>
          ))}
        </div>
        <svg
          className="yield-chart__plot"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={trendSummary(data)}
        >
          {grid.map((frac) => (
            <line
              key={frac}
              className="yield-chart__grid"
              x1={0}
              x2={WIDTH}
              y1={yOf(frac)}
              y2={yOf(frac)}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <g transform={`translate(${INSET} ${PAD})`}>
            {geo.lines.map((line, index) => (
              <g key={line.group} className={`yield-chart__series is-series-${index}`}>
                {line.path ? (
                  <path className="yield-chart__line" d={line.path} vectorEffect="non-scaling-stroke" />
                ) : null}
                {line.dots.map((dot) => (
                  <path
                    key={dot.title}
                    className="yield-chart__dot"
                    d={`M${dot.x.toFixed(1)} ${dot.y.toFixed(1)}h0`}
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>{dot.title}</title>
                  </path>
                ))}
              </g>
            ))}
          </g>
        </svg>
        <div className="yield-chart__x" aria-hidden="true">
          {first ? <span>{first}</span> : null}
          {last && last !== first ? <span>{last}</span> : null}
        </div>
      </div>
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
