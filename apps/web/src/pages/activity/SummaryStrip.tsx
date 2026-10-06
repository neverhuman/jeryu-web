// SummaryStrip.tsx — the last-24-hour numbers above the Activity feed: todos
// finished, blocked, pull requests merged, deploys and spend.
//
// The strip is on every Activity page, not only the wall: a compact row under
// the volume band, and the same five numbers in wall type when `?wall=1`. Both
// read the one source — the histogram's window totals — so the wall and the
// desk never disagree, and the numbers are the whole 24 hours rather than the
// page of events the browser happens to hold.
//
// A server that sends buckets but no totals is not an error: the strip falls
// back to counting the loaded events, and says that is what it did.

import { Link } from 'react-router-dom';

import { useEventsHistogram } from '../../hooks/usePipeline';
import { useCountUp } from '../../hooks/useCountUp';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useNeedsYou } from '../needsYou/useNeedsYou';
import { formatCost } from '../shift/shiftModel';
import { activityCounters, type ActivityCounters } from './activityModel';
import type { PipelineEvent } from '../../api/types';
import { histogramTotals } from './histogramModel';

export interface SummaryStripProps {
  /** The shell's family scope, or '' when a pinned repository is the scope. */
  family: string;
  /** `owner/name` when the repository shell's Activity tab pins the feed. */
  repo?: string;
  /** The events on the page: the fallback source when the server has no totals. */
  events: PipelineEvent[];
  /** Wall mode: large type, sticky, and shown even before anything happened. */
  wall?: boolean;
}

/** Whole numbers are rounded mid-tween; money keeps its cents. */
interface Tile {
  label: string;
  value: number;
  format: (value: number) => string;
  tone?: 'human';
  href?: string;
}

export function SummaryStrip({ family, repo, events, wall = false }: SummaryStripProps): JSX.Element | null {
  const reduced = usePrefersReducedMotion();
  const needsYou = useNeedsYou(family);
  // Always the last 24 h, whatever range the band below is drawn at. At 24 h
  // that is the band's own query, so the strip costs no second request.
  const histogram = useEventsHistogram({ range: '24h', ...(repo ? { repo } : family ? { family } : {}) });
  const totals = histogram.isError ? null : histogramTotals(histogram.data);
  const counters = activityCounters(totals, events, new Date());

  // On the normal page the strip is one more row to read, so it waits until
  // there is something to say. The wall is the whole screen: it always counts.
  if (!wall && totals === null && events.length === 0) return null;

  const tiles: Tile[] = [
    { label: 'Todos finished', value: counters.todosFinished, format: whole },
    {
      label: 'Blocked',
      value: counters.blocked,
      format: whole,
      ...(counters.blocked > 0 ? { tone: 'human' as const, href: needsYou.href } : {}),
    },
    { label: 'Pull requests merged', value: counters.prsMerged, format: whole },
    { label: 'Deploys', value: counters.deploys, format: whole },
    { label: 'Spent', value: counters.spentUsd, format: formatCost },
  ];

  return (
    <section
      className={`activity__counters${wall ? '' : ' activity__counters--compact'}${
        reduced ? ' activity__counters--still' : ''
      }`}
      aria-label="Last 24 hours"
      data-testid="activity-counters"
    >
      {tiles.map((tile) => (
        <Counter key={tile.label} tile={tile} still={reduced} />
      ))}
      <Caveat counters={counters} />
    </section>
  );
}

function Counter({ tile, still }: { tile: Tile; still: boolean }): JSX.Element {
  const shown = useCountUp(tile.value, still);
  const className = `activity__counter${tile.tone ? ` activity__counter--${tile.tone}` : ''}`;
  const body = (
    <>
      <span className="activity__counter-value">{tile.format(shown)}</span>
      <span className="activity__counter-label">{tile.label}</span>
    </>
  );
  return tile.href ? (
    <Link className={`${className} activity__counter--link`} to={tile.href}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * Where the numbers came from. With server totals they are the whole window,
 * which needs no caveat; without, they only cover the events loaded here.
 */
function Caveat({ counters }: { counters: ActivityCounters }): JSX.Element | null {
  if (counters.events === null) return null;
  return (
    <p className="activity__counter-note">
      Last 24 h, from the {counters.events} event{counters.events === 1 ? '' : 's'} loaded here.
    </p>
  );
}

function whole(value: number): string {
  return String(Math.round(value));
}
