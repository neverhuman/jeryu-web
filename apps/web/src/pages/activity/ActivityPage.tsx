// ActivityPage.tsx — `/activity`: the pipeline event log, newest first, with a
// live tail, URL-held filters and "load older". The last-24-hour strip is on
// every Activity page; `?wall=1` is the wall mode, which shows the same five
// numbers in large type above a full-height, auto-scrolling feed, meant for a
// screen on the wall or a demo.

import { Activity, Maximize2, Minimize2 } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ActionButton } from '../../components/action/ActionButton';
import { canonicalFamily } from '../../components/family/familyScope';
import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { ScopedEmptyState } from '../../components/family/ScopedEmptyState';
import { LoadingState, PipelineQueryState } from '../../components/state';
import { activityTailKey, useActivityFeed } from '../../hooks/useActivityFeed';
import { isPipelineEventPush, usePipelineNudge } from '../../hooks/usePipeline';
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
  hasMoreFilters,
  isWallMode,
  parseActivityFilters,
  resolvedSeqs,
  visibleEvents,
  type ActivityFilters,
} from './activityModel';
import { ActivityHistogram } from './ActivityHistogram';
import { SummaryStrip } from './SummaryStrip';
import { EventRow } from './EventRow';
import { useListKeys } from '../../hooks/useListKeys';
import { UsagePanel } from './UsagePanel';
import { usePageTitle } from '../../hooks/usePageTitle';

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
  const events = visibleEvents(feed.base.data?.events ?? [], filters.kind);
  const resolved = resolvedSeqs(events);
  const newest = events[0]?.seq ?? 0;
  // One `j`/`k` list over the whole feed, day headings and all.
  const rows = useListKeys<HTMLDivElement>();

  // Wall mode keeps the newest event in view as the tail grows.
  const top = useRef<HTMLDivElement | null>(null);
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
          <p className="page__subtitle">
            Every step the pipeline takes, as it happens: todos claimed and finished,
            gates, reviews, the merge queue, staged releases and deploys. Rows that
            need a person are red; a failure an agent will pick up is outlined.
          </p>
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
          <SummaryStrip family={filters.family} repo={repo} events={events} wall />
        </>
      ) : (
        <>
          <SummaryStrip family={filters.family} repo={repo} events={events} />
          <Filters
            filters={filters}
            pinnedRepo={Boolean(repo)}
            onChange={update}
            onChip={(chip) => setParams(applyChip(params, chip), { replace: true })}
          />
        </>
      )}

      {feed.base.isPending ? (
        <LoadingState title="Loading activity…" variant="message" />
      ) : feed.base.isError ? (
        <PipelineQueryState what="the activity feed" error={feed.base.error} />
      ) : events.length === 0 ? (
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
          <ol className="activity__list" aria-label="Pipeline events">
            {groupByDay(events).map((group) => (
              <Fragment key={group.day}>
                {/* Times on a row are a clock only; the day is said once, here. */}
                <li className="activity__day" data-testid={`activity-day-${group.day}`}>
                  {formatDay(group.events[0].ts, new Date())}
                </li>
                {group.events.map((event) => (
                  <EventRow key={event.seq} event={event} resolved={resolved.has(event.seq)} />
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

function Filters({
  filters,
  pinnedRepo,
  onChange,
  onChip,
}: {
  filters: ActivityFilters;
  pinnedRepo: boolean;
  onChange: (key: string, value: string) => void;
  onChip: (chip: (typeof ACTIVITY_CHIPS)[number]) => void;
}): JSX.Element {
  const families = useShiftFamilies();
  // One option per family, in the scope's own spelling: `acme` and
  // `acme-split` are one family, and the scope is what this select sets.
  const names = [
    ...new Set(
      (families.data?.families ?? [])
        .map((family) => canonicalFamily(family.name))
        .filter(Boolean)
    ),
  ];
  const current = activeChip(filters);
  const needsYou = useNeedsYou(filters.family);
  return (
    <section className="activity__filters" aria-label="Activity filters">
      <div className="activity__chips" role="group" aria-label="Show">
        {ACTIVITY_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`activity__chip${current === chip.id ? ' is-active' : ''}`}
            aria-pressed={current === chip.id}
            onClick={() => onChip(chip)}
          >
            {chip.label}
          </button>
        ))}
      </div>
      {current === 'human' ? (
        // The log says what happened; what is waiting now has one home.
        <p className="activity__needs-you" data-testid="activity-needs-you">
          These are events that were flagged. What is waiting on a person right now
          is on <Link to={needsYou.href}>Needs you</Link>
          {needsYou.count === null ? '' : ` (${needsYou.count})`}.
        </p>
      ) : null}
      {pinnedRepo ? null : names.length > 1 || filters.family ? (
        <label className="activity__family">
          Family
          <select
            data-testid="activity-family"
            value={filters.family}
            onChange={(event) => onChange('family', event.target.value)}
          >
            <option value="">All</option>
            {[...new Set([...names, canonicalFamily(filters.family)].filter(Boolean))].map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
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
