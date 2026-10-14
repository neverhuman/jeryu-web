// FlowLots.tsx — the lots at one station, oldest first.
//
// A station card opens this list; each row is one piece of work, how long it
// has been there, what state it is in and when it is expected to be done. The
// row opens the work's own page, which is where its trace is.

import { Link } from 'react-router-dom';

import type { FlowReport } from '../../api/types';
import { pillClass } from '../../components/tone/tone';
import type { Tone } from '../../components/tone/tone';
import { etaWords, lotsAt, waitingWords } from './flowModel';

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
}

export function FlowLots({ report, station, now }: FlowLotsProps): JSX.Element {
  const label = report.stations.find((candidate) => candidate.id === station)?.label ?? station;
  const lots = lotsAt(report, station);
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
        <ol className="flow-lots">
          {lots.map((lot) => (
            <li key={`${lot.station}-${lot.lot_id}`} className="flow-lots__row">
              <Link className="flow-lots__link" to={lot.href} data-testid={`flow-lot-${lot.lot_id}`}>
                {lot.lot_id}
              </Link>
              <span className={pillClass(STATE_TONE[lot.state] ?? 'unknown')}>{lot.state}</span>
              <span className="flow-lots__waited">here {waitingWords(lot, now)}</span>
              <span className="flow-lots__eta">{etaWords(lot)}</span>
              {lot.slowest_ahead ? (
                <span className="flow-lots__slowest">slowest ahead: {lot.slowest_ahead}</span>
              ) : null}
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
