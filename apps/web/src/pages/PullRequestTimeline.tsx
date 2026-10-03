import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { AttentionItem, PullRequestSummary } from '../api/types';
import { CopyCommand } from '../components/shellCommand/CopyCommand';
import { primaryAction } from './needsYou/needsYouModel';
import { pullAttentionKey } from './pullAttentionModel';
import type { GhostGroup } from './pullGhostsModel';
import {
  branchWorkHref,
  buildRepoGroups,
  countParts,
  pullRowHint,
  pullRowStatus,
  type BranchRow,
  type CountPart,
  type FlowRow,
  type PullRow,
  type RepoGroup,
} from './pullRepoGroupsModel';
import { draftBadgeLabel } from './pullDraftModel';
import { pullRequestPath } from './pullRoomModel';
import { UNKNOWN_LADDER, type ReleaseLadder } from './releaseChannelsModel';
import { releasesHref } from './releasesModel';
import { repoWorkHref } from './shift/workPaths';
import { PULL_STAGE_LABELS, pullStages } from './pullTimelineModel';

import './PullRoomPage.css';

/**
 * One section per repository, and inside it one unbroken list: every branch in
 * flight on the same track. A branch that has not opened a pull request yet
 * fills the Branch column; a pull request carries on through the PR stages. The
 * list runs from work furthest from done down to what production runs. Work
 * that only a release will move is one row per state — the newest, standing for
 * the rest — and everything it stands for folds into one History at the bottom.
 *
 * Queued todos have no branch yet and belong to the Work page; only the queue's
 * numbers are said here, once, above the sections.
 *
 * A pull request that waits on a person is marked on its own row, red, with
 * what to do — not repeated in a list above the timeline.
 */
export function PullRequestTimeline({
  pulls,
  emptyMessage,
  showRepo = false,
  ladderFor,
  ghosts = [],
  repoKeyFor,
  attention = NO_ATTENTION,
}: {
  pulls: PullRequestSummary[];
  emptyMessage: string;
  /** Several repositories: each section is headed by `owner/name`. */
  showRepo?: boolean;
  /** The release ladder of a PR's repository; without it release reads unknown. */
  ladderFor?: (pr: PullRequestSummary) => ReleaseLadder;
  /** Shift work that will become a PR, filed under the repos it names. */
  ghosts?: GhostGroup[];
  /** Resolves a todo's bare repo name to an `owner/name` section key. */
  repoKeyFor?: (repo: string) => string | null;
  /** "Needs you" rows by `owner/name#number` (see `attentionByPull`). */
  attention?: ReadonlyMap<string, AttentionItem[]>;
}): JSX.Element {
  const timeline = buildRepoGroups(pulls, {
    ladderFor: ladderFor ?? (() => UNKNOWN_LADDER),
    ghosts,
    repoKeyFor,
  });
  if (timeline.groups.length === 0 && timeline.unassigned.length === 0) {
    return <p className="pull-list__empty">{emptyMessage}</p>;
  }
  return (
    <div className="pull-timeline" data-testid="pull-timeline">
      <div className="pull-timeline__head" aria-hidden="true">
        <span />
        <span>Branch</span>
        {Object.values(PULL_STAGE_LABELS).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      {timeline.shift && (timeline.shift.inFlight > 0 || timeline.shift.queued > 0) ? (
        <p className="pull-shift-queue" data-testid="pull-shift-queue">
          Shift queue: {timeline.shift.inFlight} in flight · {timeline.shift.queued} queued{' '}
          <Link
            to={
              timeline.shift.family
                ? `/work?family=${encodeURIComponent(timeline.shift.family)}`
                : '/work'
            }
          >
            open Work
          </Link>
        </p>
      ) : null}

      {timeline.unassigned.length > 0 ? (
        <section className="pull-repo" data-testid="pull-ghosts-unassigned">
          <h2 className="pull-repo__head">
            Shift work not tied to a repository
            <span className="pull-repo__count">waiting on triage</span>
          </h2>
          <ol className="pull-timeline__rows">
            {timeline.unassigned.map((row) => (
              <BranchRowView key={row.key} row={row} scope="unassigned" />
            ))}
          </ol>
        </section>
      ) : null}

      {timeline.groups.map((group) => (
        <RepoSection key={group.repo} group={group} showRepo={showRepo} attention={attention} />
      ))}
    </div>
  );
}

const NO_ATTENTION: ReadonlyMap<string, AttentionItem[]> = new Map();

function RepoSection({
  group,
  showRepo,
  attention,
}: {
  group: RepoGroup;
  showRepo: boolean;
  attention: ReadonlyMap<string, AttentionItem[]>;
}): JSX.Element {
  // "16 closed" in the heading opens History, where closed work lives.
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = useRef<HTMLDetailsElement>(null);
  const openHistory = (): void => {
    setHistoryOpen(true);
    history.current?.scrollIntoView?.({ block: 'nearest' });
  };
  return (
    <section className="pull-repo" data-testid={`pull-repo-${group.repo}`}>
      {showRepo ? (
        <h2 className="pull-repo__head">
          <Link to={`/repos/${group.host}/${group.repo}/pulls`}>{group.repo}</Link>
          <RepoCounts group={group} onHistory={openHistory} />
        </h2>
      ) : null}
      <ol className="pull-timeline__rows">
        {group.rows.map((row) => (
          <FlowRowView
            key={flowKey(row)}
            row={row}
            repo={group.repo}
            showRepo={showRepo}
            attention={attention}
          />
        ))}
      </ol>
      {group.older.length > 0 ? (
        <details
          ref={history}
          className="pull-repo__older"
          data-testid={`pull-older-${group.repo}`}
          open={historyOpen}
          onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
        >
          <summary>History ({group.older.length})</summary>
          <ol className="pull-timeline__rows">
            {group.older.map((row) => (
              <FlowRowView
            key={flowKey(row)}
            row={row}
            repo={group.repo}
            showRepo={showRepo}
            attention={attention}
          />
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

/**
 * The counts line, each part opening the page that owns it: work in flight is
 * Work's, merged work is Releases', and closed work is the History below.
 */
function RepoCounts({ group, onHistory }: { group: RepoGroup; onHistory: () => void }): JSX.Element {
  const parts = countParts(group.counts);
  if (parts.length === 0) return <span className="pull-repo__count">nothing yet</span>;
  const target = (part: CountPart): JSX.Element => {
    if (part.target === 'history') {
      // Past the row limit a repository may have no History to open.
      return group.older.length > 0 ? (
        <button type="button" className="pull-repo__count-link" onClick={onHistory}>
          {part.text}
        </button>
      ) : (
        <>{part.text}</>
      );
    }
    const to = part.target === 'work' ? repoWorkHref(group.repo) : releasesHref(group.repo);
    return (
      <Link className="pull-repo__count-link" to={to}>
        {part.text}
      </Link>
    );
  };
  return (
    <span className="pull-repo__count" data-testid={`pull-counts-${group.repo}`}>
      {parts.map((part, index) => (
        <span key={part.text}>
          {index > 0 ? ' · ' : null}
          {target(part)}
        </span>
      ))}
    </span>
  );
}

function flowKey(row: FlowRow): string {
  return row.kind === 'branch' ? `branch-${row.key}` : `pr-${row.row.pr.number}`;
}

function FlowRowView({
  row,
  repo,
  showRepo,
  attention,
}: {
  row: FlowRow;
  repo: string;
  showRepo: boolean;
  attention: ReadonlyMap<string, AttentionItem[]>;
}): JSX.Element {
  if (row.kind === 'branch') return <BranchRowView row={row} scope={repo} />;
  const { pr } = row.row;
  const waiting = attention.get(pullAttentionKey(`${pr.repo.owner}/${pr.repo.name}`, pr.number));
  return <PullRowView row={row} showRepo={showRepo} waiting={waiting ?? []} />;
}

function rowId(row: PullRow, showRepo: boolean): string {
  const { pr } = row.row;
  // Numbers repeat across repositories; a row is one repo's number.
  return showRepo ? `${pr.repo.owner}/${pr.repo.name}-${pr.number}` : String(pr.number);
}

function PullRowView({
  row,
  showRepo,
  waiting,
}: {
  row: PullRow;
  showRepo: boolean;
  /** What this pull request waits on a person for; empty when nothing. */
  waiting: AttentionItem[];
}): JSX.Element {
  const { pr, ladder, supersedes } = row.row;
  const repo = `${pr.repo.owner}/${pr.repo.name}`;
  const id = rowId(row, showRepo);
  return (
    <li
      className={`pull-timeline__row is-${pr.state}${waiting.length > 0 ? ' needs-human' : ''}`}
      data-testid={`pull-timeline-${id}`}
      data-state={row.state}
    >
      <div className="pull-timeline__pr">
        <Link to={pullRequestPath(pr.repo.host, repo, pr.number)}>
          <span className="pull-timeline__number">#{pr.number}</span> {pr.title}
        </Link>
        <span className="pull-timeline__meta">
          <span
            className="pull-timeline__status"
            data-testid={`pull-status-${id}`}
            title={pullRowHint(row)}
          >
            {pullRowStatus(row)}
          </span>{' '}
          {row.alsoWaiting > 0 ? (
            <span className="pull-timeline__waiting" data-testid={`pull-waiting-${id}`}>
              {' '}
              + {row.alsoWaiting} more waiting
            </span>
          ) : null}{' '}
          {pr.draft ? (
            <>
              ·{' '}
              <span
                className="pull-timeline__draft"
                data-testid={`pull-draft-${id}`}
                title={`Draft since ${pr.updated_at}`}
              >
                {draftBadgeLabel(pr.updated_at)}
              </span>{' '}
            </>
          ) : null}
          {/* The base is named on the row: a pull request into a branch that
              is not the default one is otherwise easy to miss in the list. */}
          · <code>{pr.head_ref}</code> <span aria-hidden="true">→</span>{' '}
          <code>{pr.base_ref}</code> · {pr.author}
          {supersedes.length > 0 ? (
            <span className="pull-timeline__supersedes">
              {' '}
              · supersedes {supersedes.map((number) => `#${number}`).join(', ')}
            </span>
          ) : null}
        </span>
        {waiting.map((item) => (
          <PullWaiting key={item.id} item={item} />
        ))}
      </div>
      <ol className="pull-timeline__track" aria-label={`Status of ${repo}#${pr.number}`}>
        {/* A pull request exists, so its branch is pushed: the Branch column is behind it. */}
        <li className="pull-stage is-done" data-status="done">
          <span className="pull-stage__dot" aria-hidden="true" />
          <span className="pull-stage__label">
            <span className="pull-timeline__sr">Branch: </span>pushed
          </span>
        </li>
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
              {/* The newest row at a release state stands for its repository's
                  releases: where it shipped, or what the next one will carry. */}
              {stage.id === 'released' && row.frontier ? (
                <Link to={releasesHref(repo)} data-testid={`pull-releases-${id}`}>
                  {stage.detail}
                </Link>
              ) : (
                stage.detail
              )}
            </span>
            {stage.id === 'released' && row.frontier ? (
              <EnvironmentPill ladder={ladder} state={row.state} rowId={id} repo={repo} />
            ) : null}
          </li>
        ))}
      </ol>
    </li>
  );
}

/** One thing a pull request waits on a person for, and the one thing to do about it. */
function PullWaiting({ item }: { item: AttentionItem }): JSX.Element {
  const action = primaryAction(item);
  return (
    <div className="pull-timeline__needs" data-testid={`pull-needs-${item.id}`}>
      <p className="pull-timeline__needs-text" title={item.reason ?? undefined}>
        <span aria-label="needs a human">⚠ </span>
        <strong>{item.title}</strong>
        {item.reason ? ` · ${item.reason}` : null}
      </p>
      {action?.type === 'command' ? (
        <CopyCommand
          command={action.command}
          where={action.where}
          label={`${action.label} command for ${item.title}`}
        />
      ) : action?.type === 'link' ? (
        <Link className="pull-timeline__needs-open" to={action.to}>
          {action.label} →
        </Link>
      ) : null}
    </div>
  );
}

/** A branch whose work has not opened a pull request yet; its todos fold under it. */
function BranchRowView({ row, scope }: { row: BranchRow; scope: string }): JSX.Element {
  const id = `${scope}-${row.key}`;
  const workers = Array.from(
    new Set(row.todos.map((todo) => todo.worker).filter((worker): worker is string => !!worker))
  );
  return (
    <li
      className={`pull-timeline__row is-branch${row.status === 'blocked' ? ' needs-human' : ''}`}
      data-testid={`pull-branch-${id}`}
      data-status={row.status}
    >
      <div className="pull-branch__col">
        <details className="pull-branch">
          <summary className="pull-timeline__pr">
            <span className="pull-branch__name">
              {row.status === 'blocked' ? <span aria-label="needs a human">⚠ </span> : null}
              <code>{row.label}</code> · {row.todos.length} todo{row.todos.length === 1 ? '' : 's'}
            </span>
            <span className="pull-timeline__meta">
              {row.status === 'done' ? 'done, no pull request yet' : row.detail}
              {workers.length > 0 ? ` · ${workers.join(', ')}` : ''}
            </span>
          </summary>
          <ul className="pull-branch__todos">
            {row.todos.map((todo) => (
              <li
                key={todo.todoId}
                className={todo.attention ? 'needs-human' : undefined}
                data-testid={`pull-ghost-${todo.todoId}`}
              >
                {todo.title} <span className="pull-timeline__meta">· {todo.when}</span>
              </li>
            ))}
          </ul>
        </details>
        {/* Outside the summary: a link inside the expander's own control is a
            nested interactive element. */}
        <Link
          className="pull-branch__work"
          to={branchWorkHref(row)}
          data-testid={`pull-branch-work-${id}`}
        >
          Open in Work
        </Link>
      </div>
      <ol className="pull-timeline__track" aria-label={`Status of ${row.label}`}>
        <li className={`pull-stage is-${row.status}`} data-status={row.status}>
          <span className="pull-stage__dot" aria-hidden="true" />
          <span className="pull-stage__label">
            <span className="pull-timeline__sr">Branch: </span>
            <Link to={branchWorkHref(row)}>{row.detail}</Link>
          </span>
        </li>
        {Object.entries(PULL_STAGE_LABELS).map(([stage, label]) => (
          <li key={stage} className="pull-stage is-pending" data-status="pending">
            <span className="pull-stage__dot" aria-hidden="true" />
            <span className="pull-stage__label">
              <span className="pull-timeline__sr">{label}: not yet</span>
            </span>
          </li>
        ))}
      </ol>
    </li>
  );
}

/**
 * The environment this row marks, said once: history is linear, so the newest
 * PR an environment runs stands for every PR merged before it, and only that
 * row carries the pill. A tag-released repository needs none — the Released
 * stage already names the tag.
 */
function EnvironmentPill({
  ladder,
  state,
  rowId: id,
  repo,
}: {
  ladder: ReleaseLadder;
  state: string;
  rowId: string;
  /** `owner/name`: the pill opens that repository's releases. */
  repo: string;
}): JSX.Element | null {
  const pip = ladder.kind === 'channels' ? ladder.pips.find((p) => p.id === state) : undefined;
  if (!pip) return null;
  return (
    <ol className="pull-ladder" data-testid={`pull-ladder-${id}`}>
      <li
        className={`pull-ladder__pip is-${pip.membership}`}
        data-testid={`pull-ladder-${id}-${pip.id}`}
        data-membership={pip.membership}
        title={pipTitle(pip.label, pip.membership, pip.release)}
      >
        <Link className="pull-ladder__link" to={releasesHref(repo)}>
          <span aria-hidden="true" className="pull-ladder__dot" />
          <span className="pull-ladder__label">{pip.label}</span>
        </Link>
      </li>
    </ol>
  );
}

function pipTitle(label: string, membership: string, release: string | null): string {
  if (membership === 'in') return release ? `${label}: ${release}` : `in ${label}`;
  if (membership === 'out') return `not in ${label}`;
  return `${label}: unknown`;
}
