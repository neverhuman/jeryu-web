// WipStrip.tsx — the nine stations left to right, one number each: what is in
// progress there now (active, waiting and held together). The station the
// server names the bottleneck is marked, and a bar under each number is its
// oldest wait against the stale cutoff, full once it is stale.
//
// Each station is a link to `?station=<id>`, so the pick is in the address:
// linkable, and Back returns to the station before.

import { Link } from 'react-router-dom';

import { ageWords, STALE_AFTER_DAYS, type StationSummary } from './flowModel';

export interface WipStripProps {
  stations: StationSummary[];
  selected: string | null;
  searchFor: (station: string) => string;
}

function stationTitle(station: StationSummary): string {
  if (station.total === null) return `${station.label}: nothing has reached this station yet`;
  const oldest = station.oldestS === null ? '' : `, oldest ${ageWords(station.oldestS)}`;
  const flag = station.bottleneck ? ', bottleneck' : '';
  return `${station.label}: ${station.total} in progress${oldest}${flag}`;
}

export function WipStrip({ stations, selected, searchFor }: WipStripProps): JSX.Element {
  return (
    <nav className="flow-strip" aria-label="Stations" data-testid="flow-strip">
      <ol className="flow-strip__stations">
        {stations.map((station) => {
          const active = station.id === selected;
          const className = [
            'flow-strip__station',
            station.bottleneck ? 'flow-strip__station--bottleneck' : '',
            active ? 'is-active' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li key={station.id} className="flow-strip__item">
              <Link
                className={className}
                to={{ search: searchFor(station.id) }}
                preventScrollReset
                aria-current={active ? 'true' : undefined}
                aria-label={stationTitle(station)}
                title={stationTitle(station)}
                data-testid={`flow-strip-station-${station.id}`}
              >
                <span className="flow-strip__label">{station.label}</span>
                <span className="flow-strip__total">{station.total ?? '—'}</span>
                <span
                  className={`flow-strip__age${station.stale ? ' flow-strip__age--stale' : ''}`}
                  aria-hidden="true"
                  title={`Oldest wait against ${STALE_AFTER_DAYS} days`}
                >
                  <span
                    className="flow-strip__age-fill"
                    style={{ width: `${Math.round(station.ageShare * 100)}%` }}
                  />
                </span>
                {station.bottleneck ? <span className="flow-strip__flag">Bottleneck</span> : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
