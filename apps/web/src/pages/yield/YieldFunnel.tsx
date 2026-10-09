// YieldFunnel.tsx — where the window's spend went, in two stacked bars.
//
// The first bar splits it by where each todo ended up (main, still pending,
// scrapped); the second by what it paid for (writing the change, reviewing
// it, triaging it). Each bar is an inline SVG in the house chart style; the
// legend under it carries the dollars, so nothing has to be hovered to read.

import type { FunnelSegment } from './yieldModel';
import { formatRate, formatUsd } from './yieldModel';

const WIDTH = 960;
const HEIGHT = 20;

export function YieldFunnelBar({
  label,
  segments,
  testId,
}: {
  label: string;
  segments: FunnelSegment[];
  testId: string;
}): JSX.Element {
  const spoken = segments
    .map((segment) => `${segment.label} ${formatUsd(segment.usd)} (${formatRate(segment.fraction)})`)
    .join(', ');
  return (
    <div className="yield-funnel__row" data-testid={testId}>
      <div className="yield-funnel__label">{label}</div>
      <svg
        className="yield-funnel__bar"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}: ${spoken}`}
      >
        <rect className="yield-funnel__track" x={0} y={0} width={WIDTH} height={HEIGHT} />
        {segments.map((segment) =>
          segment.fraction > 0 ? (
            <rect
              key={segment.key}
              className={`yield-funnel__seg is-${segment.key}`}
              x={segment.offset * WIDTH}
              y={0}
              width={segment.fraction * WIDTH}
              height={HEIGHT}
            >
              <title>{`${segment.label}: ${formatUsd(segment.usd)} (${formatRate(segment.fraction)})`}</title>
            </rect>
          ) : null
        )}
      </svg>
      <ul className="yield-funnel__legend">
        {segments.map((segment) => (
          <li key={segment.key} data-testid={`${testId}-${segment.key}`}>
            <span className={`yield-funnel__swatch is-${segment.key}`} aria-hidden="true" />
            {segment.label} <strong>{formatUsd(segment.usd)}</strong>{' '}
            <span className="yield__muted">{formatRate(segment.fraction)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
