import { Link } from 'react-router-dom';

import type { PullRequestSummary } from '../api/types';
import type { GhostGroup, GhostRow } from './pullGhostsModel';
import {
  buildRepoGroups,
  stateHeading,
  type RepoGroup,
  type StateRow,
  type TimelineRow,
} from './pullRepoGroupsModel';
import { pullRequestPath } from './pullRoomModel';
import { UNKNOWN_LADDER, type ReleaseLadder } from './releaseChannelsModel';
import { PULL_STAGE_LABELS, pullStages } from './pullTimelineModel';

import './PullRoomPage.css';

/**
 * One section per repository; inside it one row per state of the pipeline,
 * least far first, each showing the most recent pull request that has got that
 * far. Older work at the same state sits behind that state's expander, because
 * between the newest change at a state and the ones before it there is usually
 * nothing to act on. Shift work that has not opened a pull request yet leads
 * the page, so it reads future → present → past from top to bottom.
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
  /** Several repositories: each section is headed by `owner/name`. */
  showRepo?: boolean;
  /** The release ladder of a PR's repository; without it release reads unknown. */
  ladderFor?: (pr: PullRequestSummary) => ReleaseLadder;
  /** Shift work that will become a PR, shown above the repositories. */
  ghosts?: GhostGroup[];
}): JSX.Element {
  if (pulls.length === 0 && ghosts.length === 0) {
    return <p className="pull-list__empty">{emptyMessage}</p>;
  }
  const timeline = buildRepoGroups(pulls, { ladderFor: ladderFor ?? (() => UNKNOWN_LADDER) });
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

      {timeline.groups.map((group) => (
        <RepoSection key={group.repo} group={group} showRepo={showRepo} />
      ))}
    </div>
  );
}

function RepoSection({ group, showRepo }: { group: RepoGroup; showRepo: boolean }): JSX.Element {
  return (
    <section className="pull-repo" data-testid={`pull-repo-${group.repo}`}>
      {showRepo ? (
        <h2 className="pull-repo__head">
          <Link to={`/repos/${group.host}/${group.repo}/pulls`}>{group.repo}</Link>
          <span className="pull-repo__count">
            {group.total} PR{group.total === 1 ? '' : 's'} · {group.open} open
            {group.hidden > 0 ? ` · ${group.hidden} older behind the states` : ''}
          </span>
        </h2>
      ) : null}
      {group.states.map((stateRow) => (
        <State key={stateRow.state} repo={group.repo} stateRow={stateRow} showRepo={showRepo} />
      ))}
    </section>
  );
}

/** One state of one repository: its frontier row, then the older ones folded. */
function State({
  repo,
  stateRow,
  showRepo,
}: {
  repo: string;
  stateRow: StateRow;
  showRepo: boolean;
}): JSX.Element {
  return (
    <div
      className={`pull-state is-${stateRow.state}`}
      data-testid={`pull-state-${repo}-${stateRow.state}`}
    >
      <p className="pull-state__label">{stateHeading(stateRow)}</p>
      {/* Why this state exists, where the label alone would leave a guess. */}
      {stateRow.hint ? <p className="pull-state__hint">{stateRow.hint}</p> : null}
      <ol className="pull-timeline__rows">
        <Row row={stateRow.row} showRepo={showRepo} />
      </ol>
      {stateRow.older.length > 0 ? (
        <details className="pull-state__older" data-testid={`pull-older-${repo}-${stateRow.state}`}>
          <summary>
            + {stateRow.older.length} older at this state
          </summary>
          <ol className="pull-timeline__rows">
            {stateRow.older.map((row) => (
              <Row key={rowId(row, showRepo)} row={row} showRepo={showRepo} />
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

function rowId(row: TimelineRow, showRepo: boolean): string {
  const repo = `${row.pr.repo.owner}/${row.pr.repo.name}`;
  // Numbers repeat across repositories; a row is one repo's number.
  return showRepo ? `${repo}-${row.pr.number}` : String(row.pr.number);
}

function Row({ row, showRepo }: { row: TimelineRow; showRepo: boolean }): JSX.Element {
  const { pr, ladder } = row;
  const repo = `${pr.repo.owner}/${pr.repo.name}`;
  const id = rowId(row, showRepo);
  return (
    <li className={`pull-timeline__row is-${pr.state}`} data-testid={`pull-timeline-${id}`}>
      <div className="pull-timeline__pr">
        <Link to={pullRequestPath(pr.repo.host, repo, pr.number)}>
          <span className="pull-timeline__number">#{pr.number}</span> {pr.title}
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
      <ol className="pull-timeline__track" aria-label={`Status of ${repo}#${pr.number}`}>
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
 * Shift work above the repositories: it has no PR yet, so it is dashed and dim
 * — a different dim from a closed PR, which will never move again.
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
      <ol
        className="pull-timeline__track pull-timeline__track--ghost"
        aria-label={`Status of ${row.title}`}
      >
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
