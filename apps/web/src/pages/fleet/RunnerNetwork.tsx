// fleet/RunnerNetwork.tsx — the rows of the /runners page. A row says four
// things: which runner, what it is doing now, what it did last, and when it was
// last heard from. Gate slots and PR reviewers (pr-redteam) share the shape and
// differ only in their words ("gating … passed" / "reviewing … approved"), so
// the two lists read the same way. Status, slots, in-flight, task-count and
// label columns are gone: for a one-slot runner they all said the same thing.

import { Link } from 'react-router-dom';

import { pullHref } from '../activity/activityModel';
import { relativeTime } from '../../components/repo/relativeTime';
import {
  rowLast,
  rowNow,
  runnerName,
  seenStale,
  type PullRef,
  type RowLast,
  type RunnerNetworkNode
} from '../runnerNetworkModel';

interface RowListProps {
  nodes: RunnerNetworkNode[];
  /** When the snapshot was fetched: "for 1m 20s" and "stale" measure against it. */
  nowMs: number;
}

export function RunnerNodeList({ nodes, nowMs }: RowListProps): JSX.Element {
  return (
    <RowList
      nodes={nodes}
      nowMs={nowMs}
      label="Runner nodes"
      testId="fleet-node-list"
      rowTestId="fleet-node"
      heads={['Runner', 'Now', 'Last job', 'Seen']}
    />
  );
}

/** PR reviewers (pr-redteam): the agents that approve and merge pull requests. */
export function ReviewerList({
  reviewers,
  nowMs
}: {
  reviewers: RunnerNetworkNode[];
  nowMs: number;
}): JSX.Element {
  return (
    <RowList
      nodes={reviewers}
      nowMs={nowMs}
      label="PR reviewers"
      testId="fleet-reviewer-list"
      rowTestId="fleet-reviewer"
      heads={['Reviewer', 'Now', 'Last review', 'Seen']}
    />
  );
}

function RowList({
  nodes,
  nowMs,
  label,
  testId,
  rowTestId,
  heads
}: RowListProps & {
  label: string;
  testId: string;
  rowTestId: string;
  heads: [string, string, string, string];
}): JSX.Element {
  return (
    <div
      className="fleet__node-list"
      data-testid={testId}
      role="list"
      aria-label={label}
    >
      <div
        className="fleet__node-row fleet__node-row--header"
        aria-hidden="true"
      >
        {heads.map((head) => (
          <span key={head}>{head}</span>
        ))}
      </div>
      {nodes.map((node) => (
        <RunnerRow
          key={node.runnerId}
          node={node}
          nowMs={nowMs}
          testId={rowTestId}
          heads={heads}
        />
      ))}
    </div>
  );
}

function RunnerRow({
  node,
  nowMs,
  testId,
  heads
}: {
  node: RunnerNetworkNode;
  nowMs: number;
  testId: string;
  heads: [string, string, string, string];
}): JSX.Element {
  const nodeId = testIdSegment(node.runnerId);
  const now = rowNow(node, nowMs);
  const last = rowLast(node);
  const stale = seenStale(node.lastUpdated, nowMs);
  return (
    <article
      className={`fleet__node-item is-${node.availability} is-${node.activityState}`}
      data-testid={`${testId}-${nodeId}`}
      role="listitem"
      aria-label={`${runnerName(node.runnerId)}: ${now.text}`}
    >
      <div className="fleet__node-row">
        <h3
          className="fleet__node-title"
          title={`${node.runnerId} · ${node.source}`}
        >
          {runnerName(node.runnerId)}
        </h3>
        <p
          className={`fleet__node-now fleet__tone--${now.tone}`}
          data-label={heads[1]}
          data-testid={`${testId}-now-${nodeId}`}
        >
          {now.subject ? (
            <>
              {now.text}{' '}
              <NowSubject node={node} subject={now.subject} pull={now.pull} />
              {now.elapsed ? ` for ${now.elapsed}` : ''}
              {now.draining ? ' · draining' : ''}
            </>
          ) : (
            now.text
          )}
        </p>
        <p
          className="fleet__node-last"
          data-label={heads[2]}
          data-testid={`${testId}-last-${nodeId}`}
        >
          {last ? (
            <>
              {last.verbFirst ? (
                <>
                  <span className={`fleet__tone--${last.tone}`}>
                    {last.verb}
                  </span>{' '}
                  <LastSubject last={last} />
                  {last.blocked ? (
                    <span
                      className="fleet__tone--warning"
                      data-testid={`${testId}-merge-blocked-${nodeId}`}
                    >
                      {' '}- merge blocked: {last.blocked}
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <LastSubject last={last} />{' '}
                  <span className={`fleet__tone--${last.tone}`}>
                    {last.verb}
                  </span>
                </>
              )}{' '}
              in {last.duration} ·{' '}
              <time dateTime={last.finishedAt} title={last.finishedAt}>
                {relativeTime(last.finishedAt)}
              </time>
            </>
          ) : (
            <span className="fleet__node-muted">none yet</span>
          )}
        </p>
        <p className="fleet__node-seen" data-label={heads[3]}>
          {node.lastUpdated ? (
            <time
              className={stale ? 'fleet__tone--warning' : 'fleet__node-muted'}
              dateTime={node.lastUpdated}
              title={node.lastUpdated}
            >
              {relativeTime(node.lastUpdated)}
            </time>
          ) : (
            <span className="fleet__tone--warning">never</span>
          )}
        </p>
      </div>
      {node.mergeGrantGaps?.length ? (
        <p
          className="fleet__node-last fleet__tone--warning"
          data-testid={`${testId}-merge-grant-${nodeId}`}
        >
          {node.mergeGrantGaps.map((gap) => gap.message).join(' · ')}
        </p>
      ) : null}
    </article>
  );
}

/** What is being worked on: the agent terminal when there is one, else the pull request. */
function NowSubject({
  node,
  subject,
  pull
}: {
  node: RunnerNetworkNode;
  subject: string;
  pull: PullRef | null;
}): JSX.Element {
  const task = node.tasks[0];
  const terminal = task ? taskTerminalPath(task) : undefined;
  const more = node.tasks.length - 1;
  const extra =
    more > 0 ? <span className="fleet__node-muted"> +{more}</span> : null;
  if (task && terminal) {
    return (
      <>
        <Link
          to={terminal}
          data-testid={`fleet-task-${testIdSegment(task.taskId)}`}
          title={task.lastTtyLine ?? 'TTY preview unavailable.'}
          aria-label={`Open terminal for ${subject}`}
        >
          {subject}
        </Link>
        {extra}
      </>
    );
  }
  if (pull) {
    return (
      <>
        <PullLink pull={pull} />
        {extra}
      </>
    );
  }
  return (
    <>
      <strong
        data-testid={
          task ? `fleet-task-${testIdSegment(task.taskId)}` : undefined
        }
        title={
          task ? (task.lastTtyLine ?? 'TTY preview unavailable.') : undefined
        }
      >
        {subject}
      </strong>
      {extra}
    </>
  );
}

/** Build the drill-down URL for a task that has both a repo and an agent run id. */
function taskTerminalPath(
  task: RunnerNetworkNode['tasks'][number]
): string | undefined {
  if (!task.repo || !task.agentRunId) return;
  const provider = 'jeryu';
  const fullName = encodeURIComponent(task.repo);
  return `/repos/${encodeURIComponent(provider)}/${fullName}/agents/${encodeURIComponent(task.agentRunId)}`;
}

function testIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** The job's pull request as a link, or its `repo@sha` in plain text. */
function LastSubject({ last }: { last: RowLast }): JSX.Element {
  return last.pull ? <PullLink pull={last.pull} /> : <>{last.subject}</>;
}

/** `owner/name#pr`, linked to the pull request it names. */
function PullLink({ pull }: { pull: PullRef }): JSX.Element {
  return (
    <Link to={pullHref(pull.repo, pull.pr)}>
      {pull.repo}#{pull.pr}
    </Link>
  );
}
