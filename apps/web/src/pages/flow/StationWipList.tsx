// StationWipList.tsx — the work in progress at one station, newest first: what
// it is (a pull request names its repository), how long it has waited, why it is held, and a link.
//
// Items past the stale cutoff, and Work claims no live worker backs, fold into
// one "N stale" line that says which is which and lists them on click, so the
// work that is really moving is not buried under old claims. At Work, a line
// under the heading reads every claim against the heartbeats. The list is a
// page of the station at a time; "Show more" asks the server for the next.

import { useState } from 'react';
import { Link } from 'react-router-dom';

import { pillClass, type Tone } from '../../components/tone/tone';
import { LIST_OPEN_PROP, listRowProps, useListKeys } from '../../hooks/useListKeys';
import { ageWords, claimsWords, staleWords, type StationWip, type WipItem } from './flowModel';

const STATE_TONE: Record<string, Tone> = {
  held: 'human',
  waiting: 'warn',
  active: 'ok',
};

/** The repositories shown beside the list before the rest fold into a count. */
const REPOS_SHOWN = 8;

export interface StationWipListProps {
  station: string;
  label: string;
  wip: StationWip;
  /** The next page: idle, being read, or its read failed. */
  more?: 'idle' | 'loading' | 'failed';
  onMore?: () => void;
}

export function StationWipList({
  station,
  label,
  wip,
  more = 'idle',
  onMore,
}: StationWipListProps): JSX.Element {
  const listRef = useListKeys<HTMLDivElement>();
  const [staleOpen, setStaleOpen] = useState(false);
  const count = wip.total === null ? 'nothing has reached it yet' : `${wip.total} in progress`;
  return (
    <section
      className="page__section flow-station"
      aria-labelledby="flow-station-title"
      data-testid="flow-station"
      data-station={station}
    >
      <h2 className="page__section-title" id="flow-station-title">
        {label} <span className="flow-station__count">· {count}</span>
      </h2>

      {wip.claims ? (
        <p className="flow-station__claims" data-testid="flow-station-claims">
          Claims: {claimsWords(wip.claims)}
        </p>
      ) : null}

      {wip.repos.length > 0 ? (
        <p className="flow-station__repos" data-testid="flow-station-repos">
          {wip.repos.slice(0, REPOS_SHOWN).map((row) => (
            <span key={row.repo} className="flow-station__repo">
              {row.repo} <strong>{row.total}</strong>
            </span>
          ))}
          {wip.repos.length > REPOS_SHOWN ? (
            <span className="flow-station__repo">
              +{wip.repos.length - REPOS_SHOWN} more repositories
            </span>
          ) : null}
        </p>
      ) : null}

      <div ref={listRef}>
        {wip.listed === 0 ? (
          <p className="flow-station__empty" data-testid="flow-station-empty">
            {wip.total ? `None of the ${wip.total} in progress is listed.` : `Nothing in progress at ${label}.`}
          </p>
        ) : null}

        {wip.current.length > 0 ? (
          <ItemList items={wip.current} testId="flow-current" />
        ) : wip.listed > 0 ? (
          <p className="flow-station__empty" data-testid="flow-current-empty">
            Everything listed here is stale.
          </p>
        ) : null}

        {wip.stale.length > 0 ? (
          <div className="flow-station__stale">
            <button
              type="button"
              className="flow-station__stale-toggle"
              aria-expanded={staleOpen}
              onClick={() => setStaleOpen((open) => !open)}
              data-testid="flow-stale-toggle"
            >
              {staleWords(wip.staleBy)}
            </button>
            {staleOpen ? <ItemList items={wip.stale} testId="flow-stale" /> : null}
          </div>
        ) : null}
      </div>

      {wip.listed > 0 ? (
        <p className="flow-station__paging" data-testid="flow-station-paging">
          {wip.listed} listed, newest first
          {wip.more ? (
            <button
              type="button"
              className="flow-items__more"
              onClick={onMore}
              disabled={more === 'loading'}
              data-testid="flow-station-more"
            >
              {more === 'loading' ? 'Loading…' : 'Show more'}
            </button>
          ) : null}
          {more === 'failed' ? <span className="flow-station__more-failed"> · the next page did not load</span> : null}
        </p>
      ) : null}
    </section>
  );
}

function ItemList({ items, testId }: { items: WipItem[]; testId: string }): JSX.Element {
  return (
    <ol className="flow-items" data-testid={testId}>
      {items.map((item) => (
        <ItemRow key={item.key} item={item} />
      ))}
    </ol>
  );
}

function ItemRow({ item }: { item: WipItem }): JSX.Element {
  return (
    <li
      className={item.hold ? 'flow-items__row flow-items__row--held' : 'flow-items__row'}
      {...listRowProps}
      data-list-key={item.key}
      data-testid={`flow-item-${item.id}`}
    >
      <span className={pillClass(STATE_TONE[item.state] ?? 'unknown')}>{item.state}</span>
      {item.href ? (
        <Link {...LIST_OPEN_PROP} className="flow-items__id" to={item.href}>
          {item.id}
        </Link>
      ) : (
        <span className="flow-items__id">{item.id}</span>
      )}
      {/* A pull request's id names its repository; a todo's does not. */}
      {item.repo ? null : <span className="flow-items__repo">todo</span>}
      <span className="flow-items__waited">{ageWords(item.waitedS)}</span>
      {item.claim === 'no_live_worker' ? (
        <span className="flow-items__claim">no live worker</span>
      ) : null}
      {item.hold ? (
        <span className="flow-items__hold">
          {item.hold}
          {item.holdAgeS !== null ? ` · held ${ageWords(item.holdAgeS)}` : ''}
          {item.holdBy ? ` by ${item.holdBy}` : ''}
          {item.nobodyActing ? (
            <span className={pillClass('failed')}>nobody acting</span>
          ) : null}
          {item.reviewHref ? <Link to={item.reviewHref}>Review</Link> : null}
          {item.prHref && item.prHref !== item.href ? <Link to={item.prHref}>Pull request</Link> : null}
        </span>
      ) : null}
    </li>
  );
}
