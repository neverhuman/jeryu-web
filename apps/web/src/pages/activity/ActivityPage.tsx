// ActivityPage.tsx — `/activity`: the pipeline event log, newest first, with a
// live tail, URL-held filters and "load older". `?wall=1` is the wall mode: a
// full-height, auto-scrolling, large-type view with 24-hour counters, meant
// for a screen on the wall or a demo.

import { Activity, Maximize2, Minimize2 } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ActionButton } from '../../components/action/ActionButton';
import { EmptyState, LoadingState, PipelineQueryState } from '../../components/state';
import { activityTailKey, useActivityFeed } from '../../hooks/useActivityFeed';
import { usePipelineNudge } from '../../hooks/usePipeline';
import { useNeedsYou } from '../needsYou/useNeedsYou';
import { formatCost } from '../shift/shiftModel';
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
  wallCounters,
  type ActivityFilters,
} from './activityModel';
import { EventRow } from './EventRow';

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

export function ActivityPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const wall = isWallMode(params);
  const filters = useMemo(() => parseActivityFilters(params), [params]);
  const query = useMemo(() => filtersToQuery(filters), [filters]);
  const feed = useActivityFeed(query);
  usePipelineNudge(feed.base.isSuccess, activityTailKey(query));
  // Cursors run on the raw feed (`feed`); what is shown and counted is folded.
  const events = visibleEvents(feed.base.data?.events ?? [], filters.kind);
  const resolved = resolvedSeqs(events);
  const newest = events[0]?.seq ?? 0;

  // Wall mode keeps the newest event in view as the tail grows.
  const top = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (wall && typeof top.current?.scrollIntoView === 'function') {
      top.current.scrollIntoView({ block: 'start' });
    }
  }, [wall, newest]);

  const update = (key: string, value: string): void => {
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
            need a person are red.
          </p>
        )}
      </header>

      {wall ? (
        <WallCounters events={events} />
      ) : (
        <Filters
          filters={filters}
          onChange={update}
          onChip={(chip) => setParams(applyChip(params, chip), { replace: true })}
        />
      )}

      {feed.base.isPending ? (
        <LoadingState title="Loading activity…" variant="message" />
      ) : feed.base.isError ? (
        <PipelineQueryState what="the activity feed" error={feed.base.error} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={hasActiveFilters(filters) ? 'No events match these filters.' : 'No pipeline events yet.'}
          description="Events appear as workers, gates, reviewers and releases report in."
        />
      ) : (
        <>
          <p className="activity__live" role="status">
            Live · {events.length} event{events.length === 1 ? '' : 's'}
          </p>
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
  onChange,
  onChip,
}: {
  filters: ActivityFilters;
  onChange: (key: string, value: string) => void;
  onChip: (chip: (typeof ACTIVITY_CHIPS)[number]) => void;
}): JSX.Element {
  const families = useShiftFamilies();
  const names = families.data?.families.map((family) => family.name) ?? [];
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
      {names.length > 1 || filters.family ? (
        <label className="activity__family">
          Family
          <select value={filters.family} onChange={(event) => onChange('family', event.target.value)}>
            <option value="">All</option>
            {[...new Set([...names, filters.family].filter(Boolean))].map((name) => (
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
          {MORE_FILTER_KEYS.map((key) => (
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

function WallCounters({ events }: { events: Parameters<typeof wallCounters>[0] }): JSX.Element {
  const counters = wallCounters(events, new Date());
  const tiles: Array<[string, string, string?]> = [
    ['Todos finished', String(counters.todosFinished)],
    ['Blocked', String(counters.blocked), counters.blocked > 0 ? 'danger' : undefined],
    ['PRs merged', String(counters.prsMerged)],
    ['Deploys', String(counters.deploys)],
    ['Spent', formatCost(counters.spentUsd)],
  ];
  return (
    <section className="activity__counters" aria-label="Last 24 hours">
      {tiles.map(([label, value, tone]) => (
        <div key={label} className={`activity__counter${tone ? ` activity__counter--${tone}` : ''}`}>
          <span className="activity__counter-value">{value}</span>
          <span className="activity__counter-label">{label}</span>
        </div>
      ))}
      <p className="activity__counter-note">
        Last 24 h, from the {counters.events} event{counters.events === 1 ? '' : 's'} loaded here.
      </p>
    </section>
  );
}
