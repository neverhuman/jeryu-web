// FlowStations.tsx — the stations of the delivery line as cards, left to
// right, with the rework loops as arcs under them.
//
// Each card says what is at the station now (waiting, active, held), the
// oldest wait, the queue time against the process time as two bars, the
// throughput and the capacity in use. The arcs under the line are the lots a
// station sent back, thicker for more of them; the card the line waits on is
// outlined. House chart style: a fixed viewBox scaled to the container for the
// arcs, HTML for every word above them, so the cards become a vertical list on
// a phone and the arcs step aside.

import type { FlowReport } from '../../api/types';
import { toneClass } from '../../components/tone/tone';
import { reworkArcs, stationCards, type StationCard } from './flowModel';

const ARC_WIDTH = 900;
const ARC_HEIGHT = 64;

export interface FlowStationsProps {
  report: FlowReport;
  /** The station whose lots are listed, pressed in the row. */
  active: string | null;
  onStation: (id: string) => void;
}

export function FlowStations({ report, active, onStation }: FlowStationsProps): JSX.Element {
  const cards = stationCards(report);
  const geometry = reworkArcs(report, { width: ARC_WIDTH, height: ARC_HEIGHT });
  return (
    <div className="flow-line" data-testid="flow-stations">
      <ol className="flow-line__cards">
        {cards.map((card) => (
          <li key={card.station.id} className="flow-line__cell">
            <StationCardView
              card={card}
              active={active === card.station.id}
              onStation={onStation}
            />
          </li>
        ))}
      </ol>

      {geometry.arcs.length === 0 ? (
        <p className="flow-line__no-rework" data-testid="flow-rework-none">
          No lot went back a station in this window.
        </p>
      ) : (
        <>
          <svg
            className="flow-line__arcs"
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Rework loops: ${geometry.arcs
              .map((arc) => arc.title)
              .join('; ')}`}
            data-testid="flow-rework-arcs"
          >
            {geometry.arcs.map((arc) => (
              <g key={arc.id} className="flow-line__arc" data-testid={`flow-rework-${arc.id}`}>
                <title>{arc.title}</title>
                <path className="flow-line__arc-path" d={arc.path} strokeWidth={arc.width} />
                <text className="flow-line__arc-count" x={arc.label.x} y={arc.label.y} textAnchor="middle">
                  {arc.count}
                </text>
              </g>
            ))}
          </svg>
          {/* The same loops in words: the arcs are a picture of this list, and
              on a phone the list is all there is. */}
          <ul className="flow-line__rework-list" data-testid="flow-rework-list">
            {geometry.arcs.map((arc) => (
              <li key={arc.id}>{arc.title}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function StationCardView({
  card,
  active,
  onStation,
}: {
  card: StationCard;
  active: boolean;
  onStation: (id: string) => void;
}): JSX.Element {
  const { station } = card;
  return (
    <button
      type="button"
      className={`${toneClass('flow-card', card.tone)}${
        station.bottleneck ? ' flow-card--bottleneck' : ''
      }${active ? ' is-active' : ''}`}
      aria-pressed={active}
      aria-label={`${station.label}: list the lots at this station`}
      onClick={() => onStation(station.id)}
      data-testid={`flow-card-${station.id}`}
    >
      <span className="flow-card__head">
        <span className="flow-card__label">{station.label}</span>
        {station.bottleneck ? <span className="flow-card__flag">Bottleneck</span> : null}
      </span>

      {card.unknown ? (
        <span className="flow-card__note">{card.note}</span>
      ) : (
        <>
          <span className="flow-card__wip">
            <span className="flow-card__wip-part">
              <strong>{station.wip.waiting}</strong> waiting
            </span>
            <span className="flow-card__wip-part">
              <strong>{station.wip.active}</strong> active
            </span>
            <span className="flow-card__wip-part flow-card__wip-part--held">
              <strong>{station.wip.held}</strong> held
            </span>
          </span>
          <span className="flow-card__row">Oldest wait {card.oldest}</span>
          {/* Queue time against process time: how much of a visit is waiting. */}
          <span className="flow-card__bars" aria-hidden="true">
            <span className="flow-card__bar flow-card__bar--queue" style={{ width: `${card.bars.queue}%` }} />
            <span className="flow-card__bar flow-card__bar--process" style={{ width: `${card.bars.process}%` }} />
          </span>
          <span className="flow-card__row">
            Queue {card.queue} · work {card.process}
          </span>
          <span className="flow-card__row">
            {card.throughput} · {card.capacity}
          </span>
          {card.note ? <span className="flow-card__note">{card.note}</span> : null}
        </>
      )}
    </button>
  );
}
