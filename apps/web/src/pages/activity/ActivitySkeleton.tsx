// ActivitySkeleton.tsx — what the feed looks like before its first page is in.
//
// Eight rows at the height the real rows will take, drawn as the shapes an
// event row is made of: when, which tool, what happened, how long. The list
// is already the size it will be when the answer lands, so the page does not
// jump as the message is replaced by rows — the band above it reserves its
// own height the same way.
// Asked for less motion, the bars keep their shape and lose the shimmer:
// there is nothing moving to follow, only a page that is not ready yet.

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

import './Activity.css';

/** How many rows the first page is drawn as. */
const ROWS = 8;

/** The summary bar's width per row, cycled, so the list reads as text rather
 *  than as eight identical bars. */
const SUMMARY_WIDTHS = ['46%', '32%', '54%', '38%'] as const;

export function ActivitySkeleton({ rows = ROWS }: { rows?: number } = {}): JSX.Element {
  const still = usePrefersReducedMotion();
  const bar = (modifier: string, style?: { width: string }): JSX.Element => (
    <span
      className={`activity__pending-bar activity__pending-bar--${modifier}${still ? '' : ' skeleton'}`}
      style={style}
    />
  );
  return (
    <ol
      className="activity__list activity__pending"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="activity-pending"
      data-still={still ? 'true' : undefined}
    >
      <li className="sr-only">Loading activity…</li>
      {Array.from({ length: rows }).map((_, index) => (
        <li className="activity-row activity__pending-row" key={index} aria-hidden="true">
          <div className="activity__pending-line">
            {bar('time')}
            {bar('icon')}
            {bar('pill')}
            {bar('summary', { width: SUMMARY_WIDTHS[index % SUMMARY_WIDTHS.length] })}
            {bar('meta')}
          </div>
        </li>
      ))}
    </ol>
  );
}
