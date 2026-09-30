import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  GitPullRequest,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { draftBadgeLabel } from './pullDraftModel';
import {
  cardFacts,
  knownSha,
  visibleLanes,
  type PullLane,
  type PullListItem,
} from './pullRoomModel';

import './PullRoomPage.css';

export function PullRequestCard({
  item,
}: {
  item: PullListItem;
}): JSX.Element {
  const Icon = postureIcon(item.checkPosture);
  const head = knownSha(item.headSha);
  const base = knownSha(item.baseSha);
  return (
    <article
      className={`pull-card is-${item.checkPosture}`}
      data-testid={`pull-card-${item.repo}-${item.number}`}
    >
      <div className="pull-card__top">
        <span className="pull-card__repo">{item.repo}</span>
        <span className="pull-card__number">#{item.number}</span>
      </div>
      {item.author ? (
        <div className="pull-card__author" data-testid="pull-card-author">
          by {item.author}
        </div>
      ) : null}
      <h3 className="pull-card__title">
        <Link to={item.url} className="pull-card__link">
          {item.title}
        </Link>
      </h3>
      <div className="pull-card__refs">
        <code>{item.headRef}</code>
        <span aria-hidden="true">→</span>
        <code>{item.baseRef}</code>
      </div>
      {item.draft ? (
        <div
          className="pull-card__draft"
          data-testid={`pull-card-draft-${item.repo}-${item.number}`}
          title={item.updatedAt ? `Draft since ${item.updatedAt}` : 'Draft'}
        >
          {item.updatedAt ? draftBadgeLabel(item.updatedAt) : 'Draft'}
        </div>
      ) : null}
      <div className="pull-card__facts">
        {cardFacts(item).map((fact, index) => (
          <span className="pull-card__pill" key={fact}>
            {index === 1 ? <Icon size={12} aria-hidden="true" /> : null}
            {fact}
          </span>
        ))}
      </div>
      {head ? (
        <div className="pull-card__sha">
          <span>head</span>
          <code>{head}</code>
          {base ? (
            <>
              <span>base</span>
              <code>{base}</code>
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function PullRequestListView({
  lanes,
  emptyMessage,
}: {
  lanes: PullLane[];
  emptyMessage: string;
}): JSX.Element {
  const total = lanes.reduce((sum, lane) => sum + lane.items.length, 0);
  if (total === 0) {
    return <p className="pull-list__empty">{emptyMessage}</p>;
  }
  return (
    <div className="pull-lanes" data-testid="pull-lanes">
      {visibleLanes(lanes).map((lane) => (
        <section
          key={lane.id}
          className="pull-lane"
          aria-labelledby={`pull-lane-${lane.id}`}
          data-testid={`pull-lane-${lane.id}`}
        >
          <header className="pull-lane__header">
            <h2 id={`pull-lane-${lane.id}`}>{lane.title}</h2>
            <span className="pull-lane__count">{lane.items.length}</span>
          </header>
          <div className="pull-lane__cards">
            {lane.items.map((item) => (
              <PullRequestCard key={`${item.repo}#${item.number}`} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function postureIcon(posture: PullListItem['checkPosture']): LucideIcon {
  if (posture === 'passing') return CheckCircle2;
  if (posture === 'queued' || posture === 'running') return Clock3;
  if (posture === 'missing' || posture === 'failing') return AlertTriangle;
  return GitPullRequest;
}
