import { Link } from 'react-router-dom';

import type { PullRequestSummary } from '../api/types';
import type { GhostGroup, GhostRow } from './pullGhostsModel';
import { buildTimeline, type TimelineBand, type TimelineRow } from './pullBandsModel';
import { pullRequestPath } from './pullRoomModel';
import { UNKNOWN_LADDER, type ReleaseLadder } from './releaseChannelsModel';
import { PULL_STAGE_LABELS, pullStages } from './pullTimelineModel';

import './PullRoomPage.css';

/**
 * One row per change, each a horizontal track of stages from opened to
 * released, down a single time axis: shift work that has not opened a PR yet,
 * then open PRs, then merged work banded by how far out it has shipped, then
 * the settled history behind one expandable band.
 */
export function PullRequestTimeline({
  pulls,
  emptyMessage,
  showRepo = false,
  ladderFor,
  ghosts = [],
}: {
  pulls: PullRequestSummary[];
  emptyMessage: string;
  /** Rows from several repositories: lead each with `owner/name#n`. */
  showRepo?: boolean;
  /** The release ladder of a PR's repository; without it release reads unknown. */
  ladderFor?: (pr: PullRequestSummary) => ReleaseLadder;
  /** Shift work that will become a PR, shown above the open rows. */
  ghosts?: GhostGroup[];
}): JSX.Element {
  if (pulls.length === 0 && ghosts.length === 0) {
    return <p className="pull-list__empty">{emptyMessage}</p>;
  }
  const timeline = buildTimeline(pulls, { ladderFor: ladderFor ?? (() => UNKNOWN_LADDER) });
  return (
    <div className="pull-timeline" data-testid="pull-timeline">
      <div className="pull-timeline__head" aria-hidden="true">
        <span />
        {Object.values(PULL_STAGE_LABELS).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      {ghosts.map((group) => (
        <GhostBand key={group.key} group={group} />
      ))}

      {timeline.open.length > 0 ? (
        <ol className="pull-timeline__rows" data-testid="pull-timeline-open">
          {timeline.open.map((row) => (
            <Row key={rowId(row, showRepo)} row={row} showRepo={showRepo} />
          ))}
        </ol>
      ) : null}

      {timeline.bands.map((band) => (
        <Band key={band.id} band={band} showRepo={showRepo} />
      ))}

      {timeline.floor ? (
        <p className="pull-timeline__floor" data-testid="pull-timeline-floor">
          {timeline.floor}
        </p>
      ) : null}
    </div>
  );
}

function rowId(row: TimelineRow, showRepo: boolean): string {
  const repo = `${row.pr.repo.owner}/${row.pr.repo.name}`;
  // Numbers repeat across repositories; a row is one repo's number.
  return showRepo ? `${repo}-${row.pr.number}` : String(row.pr.number);
}

/** A band of merged or closed work: one summary line, expandable to its rows. */
function Band({ band, showRepo }: { band: TimelineBand; showRepo: boolean }): JSX.Element {
  return (
    <details
      className={`pull-band is-${band.id}`}
      data-testid={`pull-band-${band.id}`}
      open={!band.collapsed}
    >
      <summary className="pull-band__summary">
        <span className="pull-band__label">{band.label}</span>
        <span className="pull-band__hint">{band.hint}</span>
      </summary>
      <ol className="pull-timeline__rows">
        {band.rows.map((row) => (
          <Row key={rowId(row, showRepo)} row={row} showRepo={showRepo} />
        ))}
      </ol>
      {band.hidden > 0 ? (
        <p className="pull-band__more">{band.hidden} more not listed.</p>
      ) : null}
    </details>
  );
}

function Row({ row, showRepo }: { row: TimelineRow; showRepo: boolean }): JSX.Element {
  const { pr, ladder } = row;
  const repo = `${pr.repo.owner}/${pr.repo.name}`;
  const id = rowId(row, showRepo);
  return (
    <li
      className={`pull-timeline__row is-${pr.state}`}
      data-testid={`pull-timeline-${id}`}
    >
      <div className="pull-timeline__pr">
        <Link to={pullRequestPath(pr.repo.host, repo, pr.number)}>
          <span className="pull-timeline__number">
            {showRepo ? repo : ''}#{pr.number}
          </span>{' '}
          {pr.title}
        </Link>
        <span className="pull-timeline__meta">
          <code>{pr.head_ref}</code> → <code>{pr.base_ref}</code> · {pr.author}
          {row.supersedes.length > 0 ? (
            <span className="pull-timeline__supersedes">
              {' '}
              · supersedes {row.supersedes.map((number) => `#${number}`).join(', ')}
            </span>
          ) : null}
        </span>
      </div>
      <ol
        className="pull-timeline__track"
        aria-label={`Status of ${showRepo ? repo : ''}#${pr.number}`}
      >
        {pullStages(pr, ladder).map((stage) => (
          <li
            key={stage.id}
            className={`pull-stage is-${stage.status}`}
            data-testid={`pull-stage-${id}-${stage.id}`}
            data-status={stage.status}
          >
            <span className="pull-stage__dot" aria-hidden="true" />
            <span className="pull-stage__label">
              <span className="pull-timeline__sr">{stage.label}: </span>
              {stage.detail}
            </span>
            {stage.id === 'released' ? <Ladder ladder={ladder} rowId={id} /> : null}
          </li>
        ))}
      </ol>
    </li>
  );
}

/** dev · canary · stable · prod, filled as far as the change has got. */
function Ladder({ ladder, rowId: id }: { ladder: ReleaseLadder; rowId: string }): JSX.Element | null {
  if (ladder.pips.length === 0) return null;
  return (
    <ol className="pull-ladder" data-testid={`pull-ladder-${id}`}>
      {ladder.pips.map((pip) => (
        <li
          key={pip.id}
          className={`pull-ladder__pip is-${pip.membership}`}
          data-testid={`pull-ladder-${id}-${pip.id}`}
          data-membership={pip.membership}
          title={pipTitle(pip.label, pip.membership, pip.release)}
        >
          <span aria-hidden="true" className="pull-ladder__dot" />
          <span className="pull-ladder__label">{pip.label}</span>
        </li>
      ))}
    </ol>
  );
}

function pipTitle(label: string, membership: string, release: string | null): string {
  if (membership === 'in') return release ? `${label}: ${release}` : `in ${label}`;
  if (membership === 'out') return `not in ${label}`;
  return `${label}: unknown`;
}

/**
 * Shift work above the open rows: it has no PR yet, so it is dashed and dim —
 * a different dim from a closed PR, which will never move again.
 */
function GhostBand({ group }: { group: GhostGroup }): JSX.Element {
  const family = group.rows[0]?.family ?? '';
  return (
    <section className="pull-band is-ghost" data-testid={`pull-ghosts-${group.key}`}>
      <div className="pull-band__summary">
        <span className="pull-band__label">{group.label}</span>
        <span className="pull-band__hint">{group.hint}</span>
      </div>
      <ol className="pull-timeline__rows">
        {group.rows.map((row) => (
          <GhostRowView key={row.todoId} row={row} />
        ))}
      </ol>
      {group.queued > 0 ? (
        <p className="pull-band__more">
          {/* The rest of the queue is the Work page's job, not this one's. */}
          <Link to={family ? `/work?family=${encodeURIComponent(family)}` : '/work'}>
            +{group.queued} queued
          </Link>
        </p>
      ) : null}
    </section>
  );
}

function GhostRowView({ row }: { row: GhostRow }): JSX.Element {
  return (
    <li
      className={`pull-timeline__row is-ghost${row.attention ? ' needs-human' : ''}`}
      data-testid={`pull-ghost-${row.todoId}`}
    >
      <div className="pull-timeline__pr">
        <span className="pull-ghost__title">
          <span className="pull-timeline__number">{row.repos.join(', ') || row.family}</span>{' '}
          {row.title}
        </span>
        <span className="pull-timeline__meta">
          no pull request yet · {row.when}
          {row.worker ? ` · ${row.worker}` : ''}
        </span>
      </div>
      {/* The todo's own lifecycle, which the PR stages continue once it opens. */}
      <ol className="pull-timeline__track pull-timeline__track--ghost" aria-label={`Status of ${row.title}`}>
        {row.steps.map((step) => (
          <li
            key={step.key}
            className={`pull-stage is-${step.state}`}
            data-testid={`pull-ghost-step-${row.todoId}-${step.key}`}
            data-status={step.state}
          >
            <span className="pull-stage__dot" aria-hidden="true" />
            <span className="pull-stage__label">{step.label}</span>
          </li>
        ))}
      </ol>
    </li>
  );
}
