// ActivityHistogram.tsx — the volume band above the Activity feed: the last
// 6 h / 24 h / 7 d of pipeline events as one stacked bar per bucket.
//
// Follows the repo's chart style (ShiftCharts, GraphSvg): a fixed viewBox
// scaled to the container, a CSS class per mark so both themes come from
// tokens, role="img" with a text summary, and a <title> on every bar.
//
// The band is a filter, not decoration: a bar's group, or its legend button,
// sets the same chip the row of chips below sets, and clicking the active one
// again goes back to All. The legend buttons are the keyboard path to that —
// the marks inside the SVG are not focus stops.

import { useSearchParams } from 'react-router-dom';

import { useEventsHistogram } from '../../hooks/usePipeline';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { ACTIVITY_CHIPS, activeChip, applyChip, parseActivityFilters } from './activityModel';
import {
  HISTOGRAM_GROUPS,
  HISTOGRAM_RANGES,
  activeGroupId,
  applyRange,
  chipOfGroup,
  histogramBuckets,
  histogramGeometry,
  histogramSummary,
  parseRange,
  rangeHours,
  type HistogramRangeId,
} from './histogramModel';

const WIDTH = 960;
const PLOT = 120;
const AXIS = 16;
/** Milliseconds between one bar's grow-in and the next one's. */
const STAGGER_MS = 6;

export interface ActivityHistogramProps {
  /** The shell's family scope, or '' when a pinned repository is the scope. */
  family: string;
  /** `owner/name` when the repository shell's Activity tab pins the feed. */
  repo?: string;
}

export function ActivityHistogram({ family, repo }: ActivityHistogramProps): JSX.Element | null {
  const [params, setParams] = useSearchParams();
  const reduced = usePrefersReducedMotion();
  const range = parseRange(params);
  const query = { range, ...(repo ? { repo } : family ? { family } : {}) };
  const histogram = useEventsHistogram(query);
  const current = activeChip(parseActivityFilters(params));
  const activeGroup = activeGroupId(current);

  // An older forge answers this path with a 404: leave the band out rather
  // than explain it above the feed. Until the answer is in, the band keeps its
  // height, so the list below it does not jump once the bars arrive.
  const unanswered = histogram.isError;
  if (unanswered) return null;

  const buckets = histogramBuckets(histogram.data);
  const geometry = histogramGeometry(buckets, {
    width: WIDTH,
    height: PLOT,
    spanHours: rangeHours(range),
  });
  const rangeLabel = HISTOGRAM_RANGES.find((candidate) => candidate.id === range)?.label ?? range;

  const setChip = (chipId: string): void => {
    const chip = ACTIVITY_CHIPS.find((candidate) => candidate.id === chipId);
    const all = ACTIVITY_CHIPS.find((candidate) => candidate.id === 'all');
    if (!chip || !all) return;
    setParams(applyChip(params, current === chipId ? all : chip), { replace: true });
  };

  const setRange = (next: HistogramRangeId): void => {
    setParams(applyRange(params, next), { replace: true });
  };

  return (
    <section
      className={`activity-volume${reduced ? ' activity-volume--still' : ''}`}
      aria-label="Pipeline volume"
      data-testid="activity-volume"
    >
      <div className="activity-volume__head">
        <h2 className="activity-volume__title">
          Volume · {rangeLabel}
          {geometry.events > 0 ? <span className="activity-volume__count"> {geometry.events} events</span> : null}
        </h2>
        <div className="activity-volume__ranges" role="group" aria-label="Range">
          {HISTOGRAM_RANGES.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={`activity-volume__range${candidate.id === range ? ' is-active' : ''}`}
              aria-pressed={candidate.id === range}
              onClick={() => setRange(candidate.id)}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      </div>
      <div className="activity-volume__plot">
        <svg
          viewBox={`0 0 ${WIDTH} ${PLOT + AXIS}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={histogramSummary(geometry, rangeLabel)}
          data-testid="activity-volume-svg"
        >
          {geometry.bars.map((bar, index) => (
            <g
              key={bar.at}
              className={`activity-volume__bar${bar.current ? ' is-current' : ''}`}
              style={reduced ? undefined : { animationDelay: `${index * STAGGER_MS}ms` }}
              data-testid={`activity-volume-bar-${index}`}
            >
              <title>{bar.title}</title>
              {/* The whole slot takes the pointer, so a short bar is still easy to hit. */}
              <rect className="activity-volume__hit" x={bar.x} y={0} width={bar.width} height={PLOT} />
              {bar.segments.map((segment) => (
                <rect
                  key={segment.groupId}
                  className={`activity-volume__seg is-${segment.groupId}${
                    activeGroup && activeGroup !== segment.groupId ? ' is-dimmed' : ''
                  }`}
                  x={bar.x}
                  y={segment.y}
                  width={bar.width}
                  height={segment.height}
                  onClick={() => setChip(HISTOGRAM_GROUPS.find((g) => g.id === segment.groupId)?.chipId ?? 'all')}
                />
              ))}
              {bar.failures ? (
                // A failure the pipeline owns is told apart by the failed tone,
                // never by red: red on this site means a person is needed.
                <rect
                  className="activity-volume__failed"
                  x={bar.x}
                  y={bar.failures.y}
                  width={bar.width}
                  height={bar.failures.height}
                />
              ) : null}
              {bar.tickY === null ? null : (
                <rect
                  className="activity-volume__human"
                  x={bar.x}
                  y={Math.max(0, bar.tickY - 5)}
                  width={bar.width}
                  height={2}
                  onClick={() => setChip('human')}
                />
              )}
            </g>
          ))}
          {geometry.ticks.map((tick) => (
            <text key={tick.x} className="activity-volume__axis" x={tick.x} y={PLOT + AXIS - 4} textAnchor="middle">
              {tick.label}
            </text>
          ))}
        </svg>
      </div>
      <div className="activity-volume__legend">
        {HISTOGRAM_GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            className={`activity-volume__key${activeGroup === group.id ? ' is-active' : ''}`}
            // The chips below say the same words; the key says what it does
            // with them, so neither name is ambiguous to a screen reader.
            aria-label={`Filter to ${group.label.toLowerCase()}`}
            aria-pressed={activeGroup === group.id}
            onClick={() => setChip(chipOfGroup(group.id)?.id ?? 'all')}
          >
            <span className={`activity-volume__swatch is-${group.id}`} aria-hidden="true" />
            {group.label}
          </button>
        ))}
      </div>
    </section>
  );
}
