// FlowLots.tsx — the lots at one station, oldest first.
//
// A station card opens this list; each row is one piece of work, how long it
// has been there, what state it is in and when it is expected to be done. The
// row opens the work's own page, which is where its trace is.

import { safeFlowHref } from './flowModel';
import { Link } from 'react-router-dom';

import type { FlowReport } from '../../api/types';
import { pillClass } from '../../components/tone/tone';
import type { Tone } from '../../components/tone/tone';
import { LIST_OPEN_PROP, listRowProps, useListKeys } from '../../hooks/useListKeys';
import { lotsAt, waitingWords } from './flowModel';

const STATE_TONE: Record<string, Tone> = {
  held: 'human',
  waiting: 'warn',
  active: 'ok',
};

export interface FlowLotsProps {
  report: FlowReport;
  /** The station id, as the address holds it. */
  station: string;
  now: Date;
  repo?: string;
  onInspect?: (id: string) => void;
}

export function FlowLots({ report, station, now, repo, onInspect }: FlowLotsProps): JSX.Element {
  const listRef = useListKeys<HTMLOListElement>();
  const label = report.stations.find((candidate) => candidate.id === station)?.label ?? station;
  const lots = lotsAt(report, station).filter(lot => !repo || report.repo === repo || lot.lot_id.startsWith(`${repo}#`) || lot.href.includes(repo));
  return (
    <section className="page__section" aria-labelledby="flow-lots-title" data-testid="flow-lots">
      <h2 className="page__section-title" id="flow-lots-title">
        At {label}, oldest first
      </h2>
      {lots.length === 0 ? (
        <p className="flow-lots__empty" data-testid="flow-lots-empty">
          Nothing is at {label} right now.
        </p>
      ) : (
        <ol className="flow-lots" ref={listRef}>
          {lots.map((lot) => (
            <li key={`${lot.station}-${lot.lot_id}`} className="flow-lots__row"
              {...listRowProps} data-list-key={`${lot.station}-${lot.lot_id}`}>
              <Link {...LIST_OPEN_PROP} className="flow-lots__link" to={safeFlowHref(lot.href) ?? '/flow'} data-testid={`flow-lot-${lot.lot_id}`}>
                {lot.lot_id}
              </Link>
              {onInspect && <button onClick={() => onInspect(lot.lot_id)}>Inspect journey</button>}
              <span className={pillClass(STATE_TONE[lot.state] ?? 'unknown')}>{lot.state}</span>
              <span className="flow-lots__waited">here {waitingWords(lot, now)}</span>
              {lot.state === 'held' && <span>held — awaiting an explicit release decision</span>}
            </li>
          ))}
        </ol>
      )}
      {lots.length > 0 ? (
        <p className="flow-lots__footnote">
          The oldest {lots.length} at this station. A row opens the work and its trace.
        </p>
      ) : null}
    </section>
  );
}
