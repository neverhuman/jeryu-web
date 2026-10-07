// ActivityPage.tsx — `/activity`: the pipeline event log, newest first, with a
// live tail, URL-held filters and older pages, which arrive as the reader
// nears the end of the list and are also a button. A reader who has scrolled down
// or opened a row is not pushed by the tail: rows that land wait above the
// fold behind a "N new events" pill until they ask for them. Pause freezes the
// list wherever they are reading — arrivals are counted and handed over on
// resume.
// The last-24-hour strip is on every Activity page; `?wall=1` is the wall mode, which shows the same five
// numbers in large type above a full-height, auto-scrolling feed, meant for a
// screen on the wall or a demo. The wall takes the whole screen: the shell's
// header, rail, dock and status bar are the furniture of a desk, and it asks for
// the screen without them (usePageTakesScreen) — Esc, or the control in the
// corner, gives them back. Its rows are shut, whatever the reader had open at
// the desk: a wall is read, not operated. It carries the clock, the volume band
// at the width of the screen and the token panel under it, and it looks after
// itself: the pointer goes after five seconds of quiet and the screen walks
// back to the newest row after a minute of it.
// Pinned to a repository (the Activity tab of `/repos/...`) the page is a panel
// of that repository's shell: the shell's name is the heading, so this one is an
// h2 under it, the subtitle is left to the shell and the wall is not offered.
// Under the filters is the request the list is one page of, so the screen and
// `/api/v1/events` are visibly the same thing; a row's detail copies that row
// as the API returns it.

import { Activity, Maximize2, Minimize2, Pause, Play } from 'lucide-react';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ActionButton } from '../../components/action/ActionButton';
import { CopyButton } from '../../components/copy/CopyButton';
import { FamilyStrip } from '../../components/family/FamilyPills';
import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { usePageTakesScreen } from '../../layout/fullScreen';
import { useFamilyNames } from '../../components/family/useFamilyNames';
import { ScopedEmptyState } from '../../components/family/ScopedEmptyState';
import { PipelineQueryState } from '../../components/state';
import { toneClass, type Tone } from '../../components/tone/tone';
import type { PipelineEvent, PipelineEventsQuery } from '../../api/types';
import { formatBadgeCount } from '../../format/number';
import { activityTailKey, useActivityFeed } from '../../hooks/useActivityFeed';
import { isPipelineEventPush, useEventsHistogram, usePipelineNudge } from '../../hooks/usePipeline';
import { useNeedsYou } from '../needsYou/useNeedsYou';
import { useRepositories } from '../../hooks/useRepositories';
import {
  ACTIVITY_CHIPS,
  MORE_FILTER_KEYS,
  activeChip,
  applyChip,
  eventsApiPath,
  filterFieldError,
  filtersToQuery,
  foldBursts,
  foldStageRuns,
  dayTotals,
  dayTotalsText,
  formatDay,
  groupRowsByDay,
  hasActiveFilters,
  longestSecondsByKind,
  hasMoreFilters,
  isWallMode,
  loadedCountText,
  parseActivityFilters,
  resolveRepoFilter,
  resolvedSeqs,
  rowSeqs,
  showsWorkerSteps,
  applyWorkerSteps,
  wantsWorkerSteps,
  workerStepCount,
  visibleEvents,
  type ActivityFilters,
} from './activityModel';
import { useArrivingRows } from './arrivalsModel';
import { badgedTitle, useAwayCount } from './badgeModel';
import {
  HISTOGRAM_RANGES,
  chipCounts,
  histogramBuckets,
  parseRange,
  type HistogramRangeId,
} from './histogramModel';
import { useAtPageTop, useHeldRows } from './holdModel';
import { KNOWN_SOURCES } from './sourceModel';
import { useOlderOnReach } from './olderModel';
import { useActivityRowKeys } from './rowKeysModel';
import { useWallIdle, wallClockText, wallDateText } from './wallModel';
import { BurstRow } from './BurstRow';
import { StageRunRow } from './StageRunRow';
import { ActivityHistogram } from './ActivityHistogram';
import { ActivitySkeleton } from './ActivitySkeleton';
import { SummaryStrip } from './SummaryStrip';
import { EventRow } from './EventRow';
import { UsagePanel } from './UsagePanel';
import { usePageTitle } from '../../hooks/usePageTitle';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useTickingNow } from '../../hooks/useTickingNow';
import { useCountUp } from '../../hooks/useCountUp';

import '../page.css';
import './Activity.css';

/** The "Load older" button, so the skip link above the list can reach it. */
const LOAD_OLDER_ID = 'activity-load-older';

const FILTER_LABEL: Record<(typeof MORE_FILTER_KEYS)[number], string> = {
  repo: 'Repo',
  source: 'Source',
  kind: 'Kind',
  todo_id: 'Todo',
  pr: 'PR',
};

const FILTER_HINT: Partial<Record<(typeof MORE_FILTER_KEYS)[number], string>> = {
  repo: 'owner/name',
  source: 'forge or todoq',
  kind: 'todo. or gate.finished',
  pr: 'number',
};

export interface ActivityPageProps {
  /** `owner/name`: the repository shell's Activity tab pins the feed to one
   *  repository. Pinned, the repository is the scope, so the shell's family is
   *  not applied on top of it and the Repo field is not one more filter. */
  repo?: string;
}

export function ActivityPage({ repo }: ActivityPageProps = {}): JSX.Element {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  // A repository tab is one panel of that repository's shell, which already
  // carries its name: the wall is a page of its own and does not belong inside
  // another page's furniture, so the pin takes it away even on `?wall=1`.
  const pinned = Boolean(repo);
  const wall = !pinned && isWallMode(params);
  // The wall is the screen, not a page inside the shell: the furniture goes
  // away while it is up, and comes back when the mode or the page is left.
  usePageTakesScreen(wall);
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
  // A slot's step beats are more than a quarter of what the feed carries, and
  // the wall and the Workers chip are the two places they belong. Elsewhere
  // All leaves them out until the toggle under the chips asks for them.
  const workerSteps = showsWorkerSteps(params) || wall;
  const raw = feed.base.data?.events ?? [];
  const all = visibleEvents(raw, filters.kind, workerSteps);
  // What the toggle would add, counted on the page the reader has.
  const hiddenSteps = workerSteps ? 0 : workerStepCount(visibleEvents(raw, filters.kind, true));
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
  const toggleRow = useCallback(
    (seq: number): void =>
      setOpenRows((prev) => {
        const next = new Set(prev);
        if (!next.delete(seq)) next.add(seq);
        return next;
      }),
    []
  );
  // Paused is the reader asking the list to stand still while they read or
  // copy from it: it holds the tail back from wherever they are, the same way
  // scrolling down does, and counts what lands.
  const [paused, setPaused] = useState(false);
  const held = useHeldRows(
    all.map((event) => event.seq),
    filterId,
    !paused && atTop && openRows.size === 0,
    !wall
  );
  const shown = new Set(held.shown);
  const events = wall ? all : all.filter((event) => shown.has(event.seq));
  // A slot sends several stage beats per attempt; folded, they are one row
  // that says the path it walked, and the outcome rows around them stay
  // readable. Everything keyed by row below counts a run as the one row it is.
  // …and one actor filing the same verdict on a family of repositories sends
  // the same report once per subject; folded, they are one row that counts the
  // subjects and opens to the reports themselves.
  const rows = foldBursts(foldStageRuns(events));
  // The wall shows the feed, not a reader's place in it: a row they had opened
  // at the desk is shut again the moment the wall goes up, so the newest events
  // are not pushed off the screen by one row's detail.
  const rowOpen = (seq: number): boolean => !wall && openRows.has(seq);
  const seqs = rowSeqs(rows);
  // Resolution is read off the rows the reader has: a held event must not
  // quietly clear the red on a row above it before they have seen why.
  const resolved = resolvedSeqs(events);
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
  const arriving = useArrivingRows(seqs, filterId, still);
  // What the tab says while the reader is elsewhere. The count is read off the
  // raw feed, not the held list: a row waiting behind the pill has still
  // arrived, and it is the row that wants a person.
  const away = useAwayCount(
    all.map((event) => event.seq),
    all.filter((event) => event.needs_human).map((event) => event.seq),
    filterId
  );
  usePageTitle(badgedTitle(repo ? `${repo} · Activity` : 'Activity', away));

  // The keyboard's own way down the list: j/k and the arrows move a focus from
  // row to row, Enter or `o` opens the one it rests on, `/` goes to the
  // filters. Tab reaches the list once and leaves it again (the roving
  // tabindex, in `rowKeysModel`), and the skip link above it goes straight to
  // the next older page. The wall has no reader at a keyboard.
  const listRef = useRef<HTMLOListElement | null>(null);
  const moreFilters = useRef<HTMLDetailsElement | null>(null);
  const openMoreFilters = useCallback((): void => {
    const details = moreFilters.current;
    if (!details) return;
    details.open = true;
    const field = details.querySelector<HTMLInputElement>('input');
    field?.focus();
    field?.select();
  }, []);
  const rowKeys = useActivityRowKeys({
    seqs,
    list: listRef,
    enabled: !wall,
    onToggle: toggleRow,
    onOpenFilters: openMoreFilters,
  });

  // Under the list: coming into view is the reader asking for the next older
  // page, so they do not have to reach the bottom and press a button. The
  // button stays for the keyboard, for a browser without an observer, and for
  // retrying a page that failed.
  const endOfList = useRef<HTMLDivElement | null>(null);
  useOlderOnReach(
    endOfList,
    {
      enabled: !wall,
      hasOlder: feed.hasOlder,
      loading: feed.loadingOlder,
      failed: feed.olderError !== null,
    },
    feed.loadOlder
  );

  // The top of the page: where wall mode keeps the newest event, and where
  // the pill takes the reader so the rows it reveals land in front of them.
  const top = useRef<HTMLDivElement | null>(null);
  // Resume hands over what waited, in place: the reader stays where they were
  // reading, with the rows they missed above them, each with its arrival cue.
  const togglePause = (): void => {
    if (paused) held.release();
    setPaused(!paused);
  };
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

  // Left alone, the wall takes the pointer away and finds its way back to the
  // newest row. A person at it keeps both.
  const cursorHidden = useWallIdle({ enabled: wall, still, top });

  // With the shell's chrome gone, Esc is the way out that needs no pointer —
  // the same key that leaves any other full screen. The corner control is the
  // visible one.
  const exitWall = wallHref(params, false);
  useEffect(() => {
    if (!wall) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      navigate(exitWall, { replace: true });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [wall, exitWall, navigate]);

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
      className={`page page--wide activity${wall ? ' activity--wall' : ''}${
        cursorHidden ? ' activity--no-cursor' : ''
      }`}
      data-testid="activity-page"
    >
      {/* Where the top of the list is, for the pill and for the wall's walk
          back: its scroll margin keeps the title clear of a sticky header
          instead of under it. */}
      <div className="activity__top" ref={top} />
      {/* On a repository tab the shell's name is the page's heading and says
          what the feed is about, so this one goes under it as a section and
          repeats neither the sentence nor the h1. */}
      <header className="page__header">
        {pinned ? (
          <h2 className="page__title">Activity</h2>
        ) : (
          <div className="page__title-row">
            <h1 className="page__title">Activity</h1>
            <Link
              className="activity__wall-toggle"
              to={wall ? exitWall : wallHref(params, true)}
              aria-label={wall ? 'Leave wall mode' : 'Enter wall mode'}
              title={wall ? 'Leave wall mode (Esc)' : 'Enter wall mode'}
            >
              {wall ? <Minimize2 aria-hidden="true" size={14} /> : <Maximize2 aria-hidden="true" size={14} />}
              {wall ? 'Exit wall' : 'Wall mode'}
            </Link>
          </div>
        )}
        {wall ? <WallClock /> : null}
        {wall || pinned ? null : (
          <p className="page__subtitle">Every step the pipeline takes, as it happens.</p>
        )}
        {wall ? null : <RowLegend />}
      </header>

      {/* The band is a filter on the feed, so it sits above the chips it sets.
          On the wall it has no chips to set and goes under the counters, at the
          width of the screen. */}
      {wall ? null : <ActivityHistogram family={filters.family} repo={repo} />}

      {/* What the pipeline is spending, under the chart: live per working
          slot, with today's totals. */}
      {wall ? null : <UsagePanel family={filters.family} />}

      {wall ? (
        <>
          <ScopedWallNote />
          <SummaryStrip family={filters.family} repo={repo} events={all} wall />
          {/* The five numbers say how much; the band says when it happened, and
              the panel what it cost. Both leave themselves out on a server that
              does not answer their path. */}
          <ActivityHistogram family={filters.family} repo={repo} />
          <UsagePanel family={filters.family} />
        </>
      ) : (
        <>
          <SummaryStrip family={filters.family} repo={repo} events={all} />
          <Filters
            filters={filters}
            query={query}
            events={all}
            repo={repo}
            moreRef={moreFilters}
            range={parseRange(params)}
            onChange={update}
            onChip={(chip) => setParams(applyChip(params, chip), { replace: true })}
            workerSteps={workerSteps}
            hiddenSteps={hiddenSteps}
            onWorkerSteps={(show) =>
              setParams(applyWorkerSteps(params, show), { replace: true })
            }
          />
        </>
      )}

      {feed.base.isPending ? (
        // The first page is drawn as the rows it will become, so the band,
        // the strip and the filters keep their places and the list does not
        // pop in under them.
        <ActivitySkeleton />
      ) : feed.base.isError ? (
        <PipelineQueryState what="the activity feed" error={feed.base.error} />
      ) : all.length === 0 ? (
        <ScopedEmptyState
          icon={Activity}
          title={hasActiveFilters(filters) ? 'No events match these filters.' : 'No pipeline events yet.'}
          // An empty list with step beats held back is not an empty feed, and
          // saying so is the difference between nothing happened and nothing
          // happened that this view shows.
          description={
            hiddenSteps > 0
              ? `Everything on this page is a worker step. Turn on Worker steps to see ${
                  hiddenSteps === 1 ? 'it' : 'them'
                }.`
              : 'Events appear as workers, gates, reviewers and releases report in.'
          }
        />
      ) : (
        <>
          <div className="activity__live-row">
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
                {paused ? 'Paused' : 'Live'} · {loadedCountText(events, new Date(now))}
              </p>
            )}
            {wall ? null : (
              // Next to the pill it qualifies: the pill says which of the two
              // the list is, the button is how it changes.
              <button
                type="button"
                className={`activity__pause${paused ? ' is-paused' : ''}`}
                aria-pressed={paused}
                onClick={togglePause}
                data-testid="activity-pause"
              >
                {paused ? <Play aria-hidden="true" size={12} /> : <Pause aria-hidden="true" size={12} />}
                {paused ? 'Resume' : 'Pause'}
                {paused && held.heldCount > 0 ? (
                  <span className="activity__pause-count">{held.heldCount} new</span>
                ) : null}
              </button>
            )}
          </div>
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
          {/* Past the list in one press: the rows are one tab stop between them
              (the roving tabindex), but reaching the next older page still
              means stepping over whatever is open on the way down. */}
          {!wall && feed.hasOlder ? (
            <a
              className="skip-link"
              href={`#${LOAD_OLDER_ID}`}
              data-testid="activity-skip-older"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(LOAD_OLDER_ID)?.focus();
              }}
            >
              Skip to Load older
            </a>
          ) : null}
          <ol className="activity__list" aria-label="Pipeline events" ref={listRef}>
            {groupRowsByDay(rows).map((group) => (
              <Fragment key={group.day}>
                {/* The day is said once, here; a row says its clock, or — for today — its age. */}
                <li className="activity__day" data-testid={`activity-day-${group.day}`}>
                  {formatDay(group.rows[0].event.ts, new Date(now))}
                  {/* …and what is loaded of it, so a scroll keeps a sense of volume. */}
                  <span className="activity__day-totals" data-testid={`activity-counts-${group.day}`}>
                    {dayTotalsText(dayTotals(group.rows))}
                  </span>
                </li>
                {group.rows.map(({ event, run, burst }) =>
                  burst ? (
                    <BurstRow
                      key={event.seq}
                      burst={burst}
                      arriving={arriving.has(event.seq)}
                      now={now}
                      open={rowOpen(event.seq)}
                      onOpenChange={wall ? undefined : onRowOpenChange}
                      focused={wall ? undefined : rowKeys.focused === event.seq}
                      tabStop={rowKeys.focused === null && event.seq === seqs[0]}
                      onRest={rowKeys.rest}
                    />
                  ) : run ? (
                    <StageRunRow
                      key={event.seq}
                      run={run}
                      arriving={arriving.has(event.seq)}
                      now={now}
                      open={rowOpen(event.seq)}
                      onOpenChange={wall ? undefined : onRowOpenChange}
                      focused={wall ? undefined : rowKeys.focused === event.seq}
                      tabStop={rowKeys.focused === null && event.seq === seqs[0]}
                      onRest={rowKeys.rest}
                    />
                  ) : (
                    <EventRow
                      key={event.seq}
                      event={event}
                      resolved={resolved.has(event.seq)}
                      arriving={arriving.has(event.seq)}
                      longestSeconds={longestSeconds.get(event.kind)}
                      now={now}
                      onOpenChange={wall ? undefined : onRowOpenChange}
                      open={rowOpen(event.seq)}
                      focused={wall ? undefined : rowKeys.focused === event.seq}
                      tabStop={rowKeys.focused === null && event.seq === seqs[0]}
                      onRest={rowKeys.rest}
                    />
                  )
                )}
              </Fragment>
            ))}
            {/* Where the next page will land, so the list does not look
                finished while it is still being fetched. */}
            {!wall && feed.loadingOlder ? (
              <li
                className="activity-row activity__older-pending"
                data-testid="activity-older-pending"
                aria-hidden="true"
              >
                <span className="activity__older-bar skeleton" />
                <span className="activity__older-bar activity__older-bar--wide skeleton" />
              </li>
            ) : null}
          </ol>
          {wall ? null : <div ref={endOfList} data-testid="activity-older-sentinel" aria-hidden="true" />}
          {wall ? null : feed.hasOlder ? (
            <ActionButton
              id={LOAD_OLDER_ID}
              variant="ghost"
              disabled={feed.loadingOlder}
              onClick={feed.loadOlder}
            >
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

/**
 * The wall's clock: the hour and the minute in wall type, with the weekday and
 * the zone they are told in under them. Its own tick, so the minute turns over
 * on time without re-rendering the feed around it; a clock is a value that
 * updates, not a motion, so there is nothing here to ask less of.
 */
function WallClock(): JSX.Element {
  const now = useTickingNow(1_000);
  return (
    <p className="activity__wall-clock" data-testid="activity-wall-clock">
      <time className="activity__wall-time" dateTime={new Date(now).toISOString()}>
        {wallClockText(now)}
      </time>
      <span className="activity__wall-date">{wallDateText(now)}</span>
    </p>
  );
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
  query,
  events,
  repo,
  moreRef,
  range,
  onChange,
  onChip,
  workerSteps,
  hiddenSteps,
  onWorkerSteps,
}: {
  filters: ActivityFilters;
  /** The filters as the server reads them: what the API line says. */
  query: PipelineEventsQuery;
  /** The rows the feed has, so a family only they name still gets a pill. */
  events: readonly PipelineEvent[];
  /** `owner/name` when the repository shell's Activity tab pins the feed. */
  repo?: string;
  /** The page's handle on More filters: `/` opens it and takes the caret to
   *  its first field. */
  moreRef?: RefObject<HTMLDetailsElement | null>;
  /** The range the band above is drawn at: what the chip counts cover. */
  range: HistogramRangeId;
  onChange: (key: string, value: string) => void;
  onChip: (chip: (typeof ACTIVITY_CHIPS)[number]) => void;
  /** Whether the slots' step beats are in the list. */
  workerSteps: boolean;
  /** How many of them the loaded page is holding back, to offer on the toggle. */
  hiddenSteps: number;
  onWorkerSteps: (show: boolean) => void;
}): JSX.Element {
  const pinnedRepo = Boolean(repo);
  // Unfolded on arrival when a folded filter is already set, and the reader's
  // own from then on: clearing the last value mid-edit used to fold the panel
  // away under the caret, so the fold follows the toggle, not the filters.
  const [moreOpen, setMoreOpen] = useState(() => hasMoreFilters(filters, pinnedRepo));
  // What the Repo and Source fields can suggest. The server wants a Repo's
  // exact `owner/name` and names no sources at all, so both fields offer the
  // names that exist: the repositories this reader can see, and the reporters
  // the feed knows. A server that cannot answer the repository list simply
  // offers no repository names; the field still takes a typed one.
  const repoList = useRepositories({}, { enabled: !pinnedRepo });
  const repoNames = useMemo(
    () =>
      [
        ...new Set(
          (repoList.data?.repositories ?? []).map((summary) => `${summary.id.owner}/${summary.id.name}`)
        ),
      ].sort(),
    [repoList.data]
  );
  const suggestions: Partial<Record<(typeof MORE_FILTER_KEYS)[number], readonly string[]>> = {
    repo: repoNames,
    source: KNOWN_SOURCES,
  };
  // One pill per family, from the list the header select and Repositories
  // offer: `acme` and `acme-split` are one family, and the scope is what a
  // pill sets. A family only this feed has named — a live event from one the
  // lists have not caught up with — gets a pill too, so what is on the page
  // can always be narrowed to.
  const eventFamilies = useMemo(() => events.map((event) => event.family), [events]);
  const families = useFamilyNames(eventFamilies);
  const names = families.names;
  // The pills only exist for a page that can narrow to one family, which the
  // family list answers a second after the first paint. Hold the strip's place
  // from the first frame so the chips beside it are drawn once, where they
  // stay: the slot is kept while the answer is on its way, and after it only
  // while there are pills to put in it.
  const familySlot = !pinnedRepo && (families.isPending || names.length > 1 || Boolean(filters.family));
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
  const apiPath = eventsApiPath(query);
  return (
    <section className="activity__filters" aria-label="Activity filters">
      <div className="activity__chip-row">
        {familySlot ? (
          // Far left of the chips, as on Needs you and In flight: the page
          // shows everything and a pill narrows it to one family.
          <div className="activity__family-slot">
            {names.length > 1 || filters.family ? (
              <FamilyStrip
                counts={names.map((name) => ({ family: name }))}
                family={filters.family}
                onPick={(name) => onChange('family', name)}
              />
            ) : null}
          </div>
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
        {wantsWorkerSteps(filters.kind) ? null : (
          // Beside the chips rather than in them: it does not narrow the feed
          // to one kind, it says whether one noisy kind is in whichever view
          // the chips are showing.
          <button
            type="button"
            className={`activity__chip activity__steps${workerSteps ? ' is-active' : ''}`}
            aria-pressed={workerSteps}
            title={
              workerSteps
                ? 'Hide the stage beats the working slots report'
                : `${hiddenSteps} worker step${hiddenSteps === 1 ? '' : 's'} left out of this page`
            }
            onClick={() => onWorkerSteps(!workerSteps)}
            data-testid="activity-worker-steps"
          >
            Worker steps
            {workerSteps || hiddenSteps === 0 ? null : (
              <span className="activity__chip-count" aria-hidden="true">
                {hiddenSteps}
              </span>
            )}
          </button>
        )}
      </div>
      {current === 'human' ? (
        // The log says what happened; what is waiting now has one home. The
        // note is a line of its own under the controls, so saying it moves no
        // chip and no field.
        <p className="activity__needs-you" data-testid="activity-needs-you">
          These are events that were flagged. What is waiting on a person right now
          is on <Link to={needsYou.href}>Needs you</Link>
          {needsYou.count === null ? '' : ` (${formatBadgeCount(needsYou.count)})`}.
        </p>
      ) : null}
      <details
        className="activity__more"
        ref={moreRef}
        open={moreOpen}
        onToggle={(event) => setMoreOpen(event.currentTarget.open)}
      >
        <summary>More filters</summary>
        <div className="activity__more-fields">
          {MORE_FILTER_KEYS.filter((key) => !(pinnedRepo && key === 'repo')).map((key) => (
            // The field's own hint sits under it, outside the label, so the
            // label stays the field's name.
            <div className="activity__more-field" key={key}>
              <label htmlFor={`activity-filter-${key}`}>{FILTER_LABEL[key]}</label>
              <FilterInput
                // Re-mount when the URL value changes from elsewhere (a deep link).
                key={filters[key]}
                initial={filters[key]}
                name={key}
                placeholder={FILTER_HINT[key]}
                suggestions={suggestions[key]}
                // A Repo typed as a bare name is the repository of that name
                // when only one is called that: the field commits what the
                // server can match.
                resolve={key === 'repo' ? (value) => resolveRepoFilter(value, repoNames) : undefined}
                onCommit={(value) => onChange(key, value)}
              />
            </div>
          ))}
        </div>
      </details>
      {/* The same request the list above is one page of: the screen and the API
          are one thing, and a reader can follow the link to the response or
          paste the query into a script. */}
      <p className="activity__api" data-testid="activity-api">
        <a
          className="activity__api-link"
          href={apiPath}
          target="_blank"
          rel="noreferrer"
          title="Open this view as the API answers it"
        >
          API
        </a>
        <code className="activity__api-path">{apiPath}</code>
        <CopyButton
          text={apiPath}
          label="the API query for this view"
          testId="activity-api-copy"
        />
      </p>
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

/**
 * Commits on Enter or blur so typing does not refetch per keystroke. A value
 * the server would refuse (`kind=todo`, `pr=abc`) is never committed: it would
 * answer `422` and turn the whole feed into an error state, so the field says
 * what it wants and keeps the text for editing.
 */
function FilterInput({
  initial,
  name,
  placeholder,
  suggestions,
  resolve,
  onCommit,
}: {
  initial: string;
  /** The filter this field holds: which rule its value is read against. */
  name: string;
  placeholder?: string;
  /** Values that exist, offered as the field's own list. */
  suggestions?: readonly string[];
  /** What a typed value means to the server, when the two can differ. */
  resolve?: (value: string) => string;
  onCommit: (value: string) => void;
}): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const fieldId = `activity-filter-${name}`;
  const hintId = `${fieldId}-hint`;
  const listId = `${fieldId}-options`;
  const offered = suggestions ?? [];
  const commit = (value: string): void => {
    const text = resolve ? resolve(value) : value.trim();
    const reason = filterFieldError(name, text);
    setError(reason);
    if (reason === null && text !== initial) onCommit(text);
  };
  return (
    <>
      <input
        type="text"
        id={fieldId}
        defaultValue={initial}
        placeholder={placeholder}
        list={offered.length > 0 ? listId : undefined}
        aria-invalid={error === null ? undefined : true}
        aria-describedby={error === null ? undefined : hintId}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(event.currentTarget.value);
        }}
        onChange={(event) => {
          // Typing past the mistake clears the hint; it comes back on commit.
          if (error !== null && filterFieldError(name, event.target.value) === null) setError(null);
        }}
      />
      {offered.length === 0 ? null : (
        <datalist id={listId} data-testid={`activity-filter-options-${name}`}>
          {offered.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      )}
      {error === null ? null : (
        <span className="activity__filter-error" id={hintId} data-testid={`activity-filter-error-${name}`}>
          {error}
        </span>
      )}
    </>
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
