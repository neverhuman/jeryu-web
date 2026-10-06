// ActivityPage.tsx — `/activity`: the pipeline event log, newest first, with a
// live tail, URL-held filters and "load older". A reader who has scrolled down
// or opened a row is not pushed by the tail: rows that land wait above the
// fold behind a "N new events" pill until they ask for them.
// The last-24-hour strip is on every Activity page; `?wall=1` is the wall mode, which shows the same five
// numbers in large type above a full-height, auto-scrolling feed, meant for a
// screen on the wall or a demo.

import { Activity, Maximize2, Minimize2 } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ActionButton } from '../../components/action/ActionButton';
import { canonicalFamily } from '../../components/family/familyScope';
import { FamilyStrip } from '../../components/family/FamilyPills';
import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { ScopedEmptyState } from '../../components/family/ScopedEmptyState';
import { LoadingState, PipelineQueryState } from '../../components/state';
import { toneClass, type Tone } from '../../components/tone/tone';
import { activityTailKey, useActivityFeed } from '../../hooks/useActivityFeed';
import { isPipelineEventPush, useEventsHistogram, usePipelineNudge } from '../../hooks/usePipeline';
import { useNeedsYou } from '../needsYou/useNeedsYou';
import { useShiftFamilies } from '../../hooks/useShift';
import {
  ACTIVITY_CHIPS,
  MORE_FILTER_KEYS,
  activeChip,
  applyChip,
  filtersToQuery,
  formatDay,
  groupByDay,
  hasActiveFilters,
  longestSecondsByKind,
  hasMoreFilters,
  isWallMode,
  parseActivityFilters,
  resolvedSeqs,
  visibleEvents,
  type ActivityFilters,
} from './activityModel';
import { useArrivingRows } from './arrivalsModel';
import {
  HISTOGRAM_RANGES,
  chipCounts,
  histogramBuckets,
  parseRange,
  type HistogramRangeId,
} from './histogramModel';
import { useAtPageTop, useHeldRows } from './holdModel';
import { ActivityHistogram } from './ActivityHistogram';
import { SummaryStrip } from './SummaryStrip';
import { EventRow } from './EventRow';
import { useListKeys } from '../../hooks/useListKeys';
import { UsagePanel } from './UsagePanel';
import { usePageTitle } from '../../hooks/usePageTitle';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useTickingNow } from '../../hooks/useTickingNow';
import { useCountUp } from '../../hooks/useCountUp';

import '../page.css';
import './Activity.css';

const FILTER_LABEL: Record<(typeof MORE_FILTER_KEYS)[number], string> = {
  repo: 'Repo',
  source: 'Source',
  kind: 'Kind',
  todo_id: 'Todo',
  pr: 'PR',
};

const FILTER_HINT: Partial<Record<(typeof MORE_FILTER_KEYS)[number], string>> = {
  repo: 'owner/name',
  kind: 'todo. or gate.finished',
};

export interface ActivityPageProps {
  /** `owner/name`: the repository shell's Activity tab pins the feed to one
   *  repository. Pinned, the repository is the scope, so the shell's family is
   *  not applied on top of it and the Repo field is not one more filter. */
  repo?: string;
}

export function ActivityPage({ repo }: ActivityPageProps = {}): JSX.Element {
  usePageTitle(repo ? `${repo} · Activity` : 'Activity');
  const [params, setParams] = useSearchParams();
  const wall = isWallMode(params);
  // The family comes from the shell's scope: `?family=` when this address
  // states one, else the family this tab last chose anywhere.
  const scope = useFamilyScope();
  const filters = useMemo(
    () => ({
      ...parseActivityFilters(params),
      family: repo ? '' : scope.family,
      ...(repo ? { repo } : {}),
    }),
    [params, scope.family, repo]
  );
  const query = useMemo(() => filtersToQuery(filters), [filters]);
  const feed = useActivityFeed(query);
  // Only a frame that can become a row is worth a tail fetch: a release board
  // snapshot or a usage report shares the scope but never reaches this list.
  usePipelineNudge(feed.base.isSuccess, activityTailKey(query), {
    kinds: isPipelineEventPush,
  });
  // Cursors run on the raw feed (`feed`); what is shown and counted is folded.
  const all = visibleEvents(feed.base.data?.events ?? [], filters.kind);
  const newest = all[0]?.seq ?? 0;
  const filterId = useMemo(() => JSON.stringify(query), [query]);
  // A reader is only safe to insert above when they are at the top of the page
  // with nothing opened; anywhere else a new row would push what they are
  // reading, so it waits behind the pill. The wall has no reader to disturb.
  const atTop = useAtPageTop();
  const [openRows, setOpenRows] = useState<ReadonlySet<number>>(() => new Set<number>());
  const onRowOpenChange = useCallback((seq: number, open: boolean): void => {
    setOpenRows((prev) => {
      if (open === prev.has(seq)) return prev;
      const next = new Set(prev);
      if (open) next.add(seq);
      else next.delete(seq);
      return next;
    });
  }, []);
  const held = useHeldRows(
    all.map((event) => event.seq),
    filterId,
    atTop && openRows.size === 0,
    !wall
  );
  const shown = new Set(held.shown);
  const events = wall ? all : all.filter((event) => shown.has(event.seq));
  // Resolution is read off the rows the reader has: a held event must not
  // quietly clear the red on a row above it before they have seen why.
  const resolved = resolvedSeqs(events);
  // One `j`/`k` list over the whole feed, day headings and all.
  const rows = useListKeys<HTMLDivElement>();
  // The duration bars are scaled within the rows on the page: as a reader
  // loads older events the scale can only grow, never per-row surprise.
  const longestSeconds = longestSecondsByKind(events);
  // Rows the tail brought in since the last render, so they can announce
  // themselves. The filter set is the list's identity: changing it starts a
  // fresh page, which arrives all at once and so animates nothing. Rows the
  // pill was holding are new to the list at the moment it is clicked, so they
  // arrive then, with the same cue.
  const still = usePrefersReducedMotion();
  // One clock for the whole list: today's rows say how long ago they happened,
  // and they all age together on this single tick.
  const now = useTickingNow();
  const arriving = useArrivingRows(
    events.map((event) => event.seq),
    filterId,
    still
  );

  // The top of the page: where wall mode keeps the newest event, and where
  // the pill takes the reader so the rows it reveals land in front of them.
  const top = useRef<HTMLDivElement | null>(null);
  const showHeld = (): void => {
    held.release();
    if (typeof top.current?.scrollIntoView === 'function') {
      top.current.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
    }
  };

  // Wall mode keeps the newest event in view as the tail grows.
  useEffect(() => {
    if (wall && typeof top.current?.scrollIntoView === 'function') {
      top.current.scrollIntoView({ block: 'start' });
    }
  }, [wall, newest]);

  const update = (key: string, value: string): void => {
    // The family is the shell's scope, not one more filter in this URL.
    if (key === 'family') {
      scope.setFamily(value);
      return;
    }
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );
  };

  return (
    <div
      className={`page page--wide activity${wall ? ' activity--wall' : ''}`}
      data-testid="activity-page"
      ref={rows}
    >
      <div ref={top} />
      <header className="page__header">
        <div className="page__title-row">
          <h1 className="page__title">Activity</h1>
          <Link
            className="activity__wall-toggle"
            to={wallHref(params, !wall)}
            aria-label={wall ? 'Leave wall mode' : 'Enter wall mode'}
          >
            {wall ? <Minimize2 aria-hidden="true" size={14} /> : <Maximize2 aria-hidden="true" size={14} />}
            {wall ? 'Exit wall' : 'Wall mode'}
          </Link>
        </div>
        {wall ? null : (
          <>
            <p className="page__subtitle">Every step the pipeline takes, as it happens.</p>
            <RowLegend />
          </>
        )}
      </header>

      {/* The band is a filter on the feed, so it sits above the chips it sets.
          Wall mode has no filters and its own counters, so it has no band. */}
      {wall ? null : <ActivityHistogram family={filters.family} repo={repo} />}

      {/* What the pipeline is spending, under the chart: live per working
          slot, with today's totals. Wall mode has its own counters. */}
      {wall ? null : <UsagePanel family={filters.family} />}

      {wall ? (
        <>
          <ScopedWallNote />
          <SummaryStrip family={filters.family} repo={repo} events={all} wall />
        </>
      ) : (
        <>
          <SummaryStrip family={filters.family} repo={repo} events={all} />
          <Filters
            filters={filters}
            repo={repo}
            range={parseRange(params)}
            onChange={update}
            onChip={(chip) => setParams(applyChip(params, chip), { replace: true })}
          />
        </>
      )}

      {feed.base.isPending ? (
        <LoadingState title="Loading activity…" variant="message" />
      ) : feed.base.isError ? (
        <PipelineQueryState what="the activity feed" error={feed.base.error} />
      ) : all.length === 0 ? (
        <ScopedEmptyState
          icon={Activity}
          title={hasActiveFilters(filters) ? 'No events match these filters.' : 'No pipeline events yet.'}
          description="Events appear as workers, gates, reviewers and releases report in."
        />
      ) : (
        <>
          {feed.tail.paused ? (
            // The tail is the page's promise of "Live"; when it stops arriving
            // the page says so, and says when it will try again.
            <p className="activity__tail-paused" role="status" data-testid="activity-tail-paused">
              Live updates paused — retrying in {feed.tail.retryInSeconds}s{' '}
              <button type="button" onClick={feed.tail.retryNow}>
                Retry now
              </button>
            </p>
          ) : (
            <p className="activity__live" role="status">
              Live · {events.length} event{events.length === 1 ? '' : 's'}
            </p>
          )}
          {held.heldCount > 0 ? (
            // Sticky, so it stays reachable from wherever they were reading.
            <div className="activity__held" role="status" data-testid="activity-held">
              <button
                type="button"
                className="activity__held-pill"
                onClick={showHeld}
                data-testid="activity-held-show"
              >
                {held.heldCount} new event{held.heldCount === 1 ? '' : 's'} — show
              </button>
            </div>
          ) : null}
          <ol className="activity__list" aria-label="Pipeline events">
            {groupByDay(events).map((group) => (
              <Fragment key={group.day}>
                {/* The day is said once, here; a row says its clock, or — for today — its age. */}
                <li className="activity__day" data-testid={`activity-day-${group.day}`}>
                  {formatDay(group.events[0].ts, new Date(now))}
                </li>
                {group.events.map((event) => (
                  <EventRow
                    key={event.seq}
                    event={event}
                    resolved={resolved.has(event.seq)}
                    arriving={arriving.has(event.seq)}
                    longestSeconds={longestSeconds.get(event.kind)}
                    now={now}
                    onOpenChange={wall ? undefined : onRowOpenChange}
                  />
                ))}
              </Fragment>
            ))}
          </ol>
          {wall ? null : feed.hasOlder ? (
            <ActionButton variant="ghost" disabled={feed.loadingOlder} onClick={feed.loadOlder}>
              {feed.loadingOlder ? 'Loading…' : 'Load older'}
            </ActionButton>
          ) : (
            <p className="activity__live">That is every stored event (30-day retention).</p>
          )}
          {feed.olderError ? (
            <p className="activity__error" role="alert">
              Could not load older events: {feed.olderError.message}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function wallHref(params: URLSearchParams, wall: boolean): string {
  const next = new URLSearchParams(params);
  if (wall) next.set('wall', '1');
  else next.delete('wall');
  const suffix = next.toString();
  return suffix ? `?${suffix}` : '.';
}

/** What the edge of a row means, drawn by the rows' own CSS so the key cannot
 *  drift from what is on the list: each marker is an `activity-row` carrying
 *  the tone modifier, trimmed to the coloured edge alone. */
const ROW_KEYS: readonly { tone: Tone; label: string }[] = [
  { tone: 'human', label: 'needs you' },
  { tone: 'failed', label: 'an agent will pick it up' },
  { tone: 'ok', label: 'ok' },
];

function RowLegend(): JSX.Element {
  return (
    <ul className="activity__legend" aria-label="What a row's edge means" data-testid="activity-legend">
      {ROW_KEYS.map((key) => (
        <li className="activity__key" key={key.tone}>
          <span className={`${toneClass('activity-row', key.tone)} activity__marker`} aria-hidden="true" />
          {key.label}
        </li>
      ))}
    </ul>
  );
}

function Filters({
  filters,
  repo,
  range,
  onChange,
  onChip,
}: {
  filters: ActivityFilters;
  /** `owner/name` when the repository shell's Activity tab pins the feed. */
  repo?: string;
  /** The range the band above is drawn at: what the chip counts cover. */
  range: HistogramRangeId;
  onChange: (key: string, value: string) => void;
  onChip: (chip: (typeof ACTIVITY_CHIPS)[number]) => void;
}): JSX.Element {
  const pinnedRepo = Boolean(repo);
  const families = useShiftFamilies();
  // One pill per family, in the scope's own spelling: `acme` and `acme-split`
  // are one family, and the scope is what a pill sets. The scoped family keeps
  // its pill even when the family list does not name it, so a deep link into
  // one can always be left again.
  const names = [
    ...new Set(
      [
        ...(families.data?.families ?? []).map((family) => canonicalFamily(family.name)),
        canonicalFamily(filters.family),
      ].filter(Boolean)
    ),
  ];
  const current = activeChip(filters);
  const needsYou = useNeedsYou(filters.family);
  const still = usePrefersReducedMotion();
  // The same query the band above asks, so the counts are one request shared
  // with it and say the same thing the bars do. A server without the route
  // leaves the badges out rather than showing a chip row of zeros.
  const histogram = useEventsHistogram({
    range,
    ...(repo ? { repo } : filters.family ? { family: filters.family } : {}),
  });
  const counts =
    histogram.isError || histogram.data === undefined
      ? null
      : chipCounts(histogramBuckets(histogram.data));
  const rangeLabel = HISTOGRAM_RANGES.find((candidate) => candidate.id === range)?.label ?? range;
  return (
    <section className="activity__filters" aria-label="Activity filters">
      <div className="activity__chip-row">
        {pinnedRepo ? null : names.length > 1 || filters.family ? (
          // Far left of the chips, as on Needs you and In flight: the page
          // shows everything and a pill narrows it to one family.
          <FamilyStrip
            counts={names.map((name) => ({ family: name }))}
            family={filters.family}
            onPick={(name) => onChange('family', name)}
          />
        ) : null}
        <div className={`activity__chips${still ? ' activity__chips--still' : ''}`} role="group" aria-label="Show">
          {ACTIVITY_CHIPS.map((chip) => {
            const count = counts?.[chip.id] ?? null;
            return (
              <button
                key={chip.id}
                type="button"
                className={`activity__chip${current === chip.id ? ' is-active' : ''}${
                  count === 0 ? ' activity__chip--empty' : ''
                }`}
                aria-pressed={current === chip.id}
                // The badge is a number that moves, which is noise read aloud,
                // so the count reaches a screen reader as the chip's
                // description instead and the chip's name stays its label.
                title={count === null ? undefined : `${count} in the last ${rangeLabel}`}
                onClick={() => onChip(chip)}
              >
                {chip.label}
                {count === null ? null : <ChipCount value={count} still={still} />}
              </button>
            );
          })}
        </div>
      </div>
      {current === 'human' ? (
        // The log says what happened; what is waiting now has one home.
        <p className="activity__needs-you" data-testid="activity-needs-you">
          These are events that were flagged. What is waiting on a person right now
          is on <Link to={needsYou.href}>Needs you</Link>
          {needsYou.count === null ? '' : ` (${needsYou.count})`}.
        </p>
      ) : null}
      <details className="activity__more" open={hasMoreFilters(filters) || undefined}>
        <summary>More filters</summary>
        <div className="activity__more-fields">
          {MORE_FILTER_KEYS.filter((key) => !(pinnedRepo && key === 'repo')).map((key) => (
            <label key={key}>
              {FILTER_LABEL[key]}
              <FilterInput
                // Re-mount when the URL value changes from elsewhere (a deep link).
                key={filters[key]}
                initial={filters[key]}
                placeholder={FILTER_HINT[key]}
                onCommit={(value) => onChange(key, value)}
              />
            </label>
          ))}
        </div>
      </details>
    </section>
  );
}

/**
 * How much is behind a chip, as a badge on it. The number travels to its new
 * value so a chip that just grew says so; asked for less motion, it simply
 * updates. An empty chip still counts, and is still clickable.
 */
function ChipCount({ value, still }: { value: number; still: boolean }): JSX.Element {
  const shown = useCountUp(value, still);
  return (
    <span className="activity__chip-count" aria-hidden="true">
      {Math.round(shown)}
    </span>
  );
}

/** Commits on Enter or blur so typing does not refetch per keystroke. */
function FilterInput({
  initial,
  placeholder,
  onCommit,
}: {
  initial: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}): JSX.Element {
  return (
    <input
      type="text"
      defaultValue={initial}
      placeholder={placeholder}
      onBlur={(event) => {
        if (event.target.value.trim() !== initial) onCommit(event.target.value.trim());
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onCommit(event.currentTarget.value.trim());
      }}
    />
  );
}

/**
 * Wall mode has no filter row, so the wall itself says which family it is
 * counting, and gives back every family in one click.
 */
function ScopedWallNote(): JSX.Element | null {
  const scope = useFamilyScope();
  if (!scope.active) return null;
  return (
    <p className="activity__wall-family" data-testid="activity-wall-family">
      {scope.label} only{' '}
      <button type="button" onClick={() => scope.clearFamily()}>
        Show all families
      </button>
    </p>
  );
}
