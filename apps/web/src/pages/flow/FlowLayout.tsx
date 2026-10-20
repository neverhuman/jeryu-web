// FlowLayout.tsx — Flow's Layout mode: the same stations as Live, showing the
// runners that serve each one instead of the work at it.
//
// Each card lists its runners (id, host, online or offline, busy or idle, last
// seen, code version) and says how many are reporting against how many the
// site expects. A station with no reporting tool, or fewer than expected, is
// red. Read from `GET /api/v1/flow/layout`; nothing is filled in when the
// server has no heartbeat for a station.

import { Link } from 'react-router-dom';

import type { FlowReport } from '../../api/types';
import { toneClass } from '../../components/tone/tone';
import { LoadingState } from '../../components/state';
import { runnersHref } from '../releaseBoard/links';
import { FlowQueryState } from './FlowQueryState';
import { layoutCards, redStations, type LayoutCard } from './layoutModel';
import { useFlowLayout } from './useFlowDetail';

export function FlowLayoutView({ report }: { report: FlowReport | undefined }): JSX.Element {
  const layout = useFlowLayout();
  if (layout.isPending) return <LoadingState title="Loading the line's runners…" variant="message" />;
  if (layout.isError) return <FlowQueryState error={layout.error} onRetry={() => void layout.refetch()} />;
  const cards = layoutCards(layout.data, report, new Date());
  const red = redStations(cards);
  return (
    <div className="flow__body" data-testid="flow-layout">
      <p className="flow-layout__summary" data-testid="flow-layout-summary" role="status">
        {red.length === 0
          ? 'Every station has the tools it is expected to have reporting.'
          : `${red.length} ${red.length === 1 ? 'station needs' : 'stations need'} attention: ${red
              .map((card) => card.label)
              .join(', ')}.`}
      </p>
      <ol className="flow-layout__cards">
        {cards.map((card) => (
          <li key={card.id} className="flow-line__cell">
            <LayoutCardView card={card} />
          </li>
        ))}
      </ol>
      <p className="flow__footnote">
        Read from runner heartbeats. Expected capacity is site configuration; where it is not set the
        station says so.
      </p>
      <p className="flow__footnote">
        <Link to="/runners">All runners</Link>
      </p>
    </div>
  );
}

function LayoutCardView({ card }: { card: LayoutCard }): JSX.Element {
  return (
    <section
      className={toneClass('flow-card', card.tone)}
      aria-label={`${card.label} runners`}
      data-testid={`flow-layout-card-${card.id}`}
      data-tone={card.tone}
    >
      <span className="flow-card__head">
        <h3 className="flow-card__label">{card.label}</h3>
      </span>
      <span className="flow-card__row" data-testid={`flow-layout-capacity-${card.id}`}>
        {card.capacity}
      </span>
      {card.problems.map((problem) => (
        <span key={problem} className="flow-card__problem">
          {problem}
        </span>
      ))}
      {card.tools.length === 0 ? (
        <span className="flow-card__note">No runner has reported for this station.</span>
      ) : (
        <ul className="flow-layout__tools">
          {card.tools.map((tool) => (
            <li key={tool.runnerId} className="flow-layout__tool" data-testid={`flow-layout-tool-${tool.runnerId}`}>
              <Link to={runnersHref([tool.runnerId])}>{tool.runnerId}</Link>
              <span>{tool.host}</span>
              <span>{tool.state}</span>
              <span>seen {tool.lastSeen}</span>
              <span>{tool.code}</span>
              {tool.failing ? <span className="flow-card__problem">failing: {tool.failureReason}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
