import { Link } from 'react-router-dom';

import type { PullRequestSummary } from '../api/types';
import { pullRequestPath } from './pullRoomModel';
import { PULL_STAGE_LABELS, pullStages, timelineOrder } from './pullTimelineModel';

import './PullRoomPage.css';

/**
 * One row per PR, each a horizontal track of stages from opened to merged,
 * so how far every change has got reads in a single left-to-right scan.
 */
export function PullRequestTimeline({
  pulls,
  emptyMessage,
}: {
  pulls: PullRequestSummary[];
  emptyMessage: string;
}): JSX.Element {
  if (pulls.length === 0) {
    return <p className="pull-list__empty">{emptyMessage}</p>;
  }
  const rows = [...pulls].sort(timelineOrder);
  return (
    <div className="pull-timeline" data-testid="pull-timeline">
      <div className="pull-timeline__head" aria-hidden="true">
        <span />
        {Object.values(PULL_STAGE_LABELS).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <ol className="pull-timeline__rows">
        {rows.map((pr) => {
          const repo = `${pr.repo.owner}/${pr.repo.name}`;
          return (
            <li
              key={pr.number}
              className={`pull-timeline__row is-${pr.state}`}
              data-testid={`pull-timeline-${pr.number}`}
            >
              <div className="pull-timeline__pr">
                <Link to={pullRequestPath(pr.repo.host, repo, pr.number)}>
                  <span className="pull-timeline__number">#{pr.number}</span> {pr.title}
                </Link>
                <span className="pull-timeline__meta">
                  <code>{pr.head_ref}</code> → <code>{pr.base_ref}</code> · {pr.author}
                </span>
              </div>
              <ol className="pull-timeline__track" aria-label={`Status of #${pr.number}`}>
                {pullStages(pr).map((stage) => (
                  <li
                    key={stage.id}
                    className={`pull-stage is-${stage.status}`}
                    data-testid={`pull-stage-${pr.number}-${stage.id}`}
                    data-status={stage.status}
                  >
                    <span className="pull-stage__dot" aria-hidden="true" />
                    <span className="pull-stage__label">
                      <span className="pull-timeline__sr">{stage.label}: </span>
                      {stage.detail}
                    </span>
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
