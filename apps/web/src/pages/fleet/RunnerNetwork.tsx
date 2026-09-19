// fleet/RunnerNetwork.tsx — the runner-network drilldown view for the /fleet
// dashboard: one list row per runner node (status, slot usage, last gate,
// labels). While a node is busy its running task takes the last-gate cell,
// labelled running, so the row never grows and the list never shifts. PR
// reviewers get their own list (ReviewerList) apart from the gate slots.

import { Link } from 'react-router-dom';
import {
  Activity,
  Cpu,
  Server,
  CircleAlert,
  CircleSlash,
} from 'lucide-react';

import { pullHref } from '../activity/activityModel';
import { relativeTime } from '../../components/repo/relativeTime';
import { reviewVerdict, runnerTags, type RunnerNetworkNode } from '../runnerNetworkModel';

export function RunnerNodeList({
  nodes,
}: {
  nodes: RunnerNetworkNode[];
}): JSX.Element {
  return (
    <div
      className="fleet__node-list"
      data-testid="fleet-node-list"
      role="list"
      aria-label="Runner nodes"
    >
      <div className="fleet__node-row fleet__node-row--header" aria-hidden="true">
        <span>Runner</span>
        <span>Status</span>
        <span>Slots</span>
        <span>In flight</span>
        <span>Tasks</span>
        <span>Last gate</span>
        <span>Labels</span>
        <span>Updated</span>
      </div>
      {nodes.map((node) => (
        <RunnerNodeRow key={node.runnerId} node={node} />
      ))}
    </div>
  );
}

function RunnerNodeRow({ node }: { node: RunnerNetworkNode }): JSX.Element {
  const nodeId = testIdSegment(node.runnerId);
  const usedSlots = Math.min(
    Math.max(node.inFlight, node.activeTaskCount),
    Math.max(node.capacity, 0)
  );
  const usedPct =
    node.capacity > 0 ? Math.round((usedSlots / node.capacity) * 100) : 0;
  const tags = runnerTags(node);
  return (
    <article
      className={`fleet__node-item is-${node.availability} is-${node.activityState}`}
      data-testid={`fleet-node-${nodeId}`}
      role="listitem"
      aria-label={`Runner node ${node.runnerId}: ${node.availability}, ${node.activityState}`}
    >
      <div className="fleet__node-row">
        <div className="fleet__node-titleblock">
          <h3 className="fleet__node-title">{node.runnerId}</h3>
          <p className="fleet__node-source">{node.source}</p>
        </div>
        <div className="fleet__node-pills">
          <AvailabilityPill availability={node.availability} />
          <ActivityPill activity={node.activityState} />
        </div>
        <div className="fleet__node-slots">
          <div
            className="fleet__bar"
            role="progressbar"
            aria-valuenow={usedPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${node.runnerId} slot usage`}
          >
            <div className="fleet__bar-fill" style={{ width: `${usedPct}%` }} />
          </div>
          <span className="fleet__node-mono">
            {usedSlots}/{node.capacity}
          </span>
        </div>
        <span className="fleet__node-mono" data-label="In flight">
          {node.inFlight}
        </span>
        <span className="fleet__node-mono" data-label="Tasks">
          {node.activeTaskCount}
        </span>
        {node.tasks[0] ? (
          <RunningTask task={node.tasks[0]} more={node.tasks.length - 1} />
        ) : node.lastActivity ? (
          <p className="fleet__node-last" data-testid={`fleet-node-last-${nodeId}`}>
            <strong>
              <PullLink repo={node.lastActivity.repo} pr={node.lastActivity.pr} />
            </strong>{' '}
            <span
              className={`page__pill ${
                node.lastActivity.conclusion === 'success'
                  ? 'page__pill--success'
                  : 'page__pill--danger'
              }`}
            >
              {node.lastActivity.conclusion}
            </span>{' '}
            <span title={node.lastActivity.finishedAt}>
              {node.lastActivity.recipe} in {node.lastActivity.seconds}s ·{' '}
              {node.lastActivity.sha.slice(0, 7)}
            </span>
          </p>
        ) : (
          <span className="fleet__node-muted">—</span>
        )}
        <div className="fleet__node-tags">
          {tags.length > 0 ? (
            tags.map((tag) => (
              <span className="page__pill" key={tag}>
                {tag}
              </span>
            ))
          ) : (
            <span className="page__pill page__pill--warning">no labels</span>
          )}
        </div>
        <When iso={node.lastUpdated} missing="unknown" />
      </div>

    </article>
  );
}

/**
 * PR reviewers (pr-redteam): one row each with the PR under review, the last
 * verdict and when the last pass finished. Reviewers hold no gate slot, so the
 * slot columns of the gate list do not apply.
 */
export function ReviewerList({
  reviewers,
}: {
  reviewers: RunnerNetworkNode[];
}): JSX.Element {
  return (
    <div
      className="fleet__node-list"
      data-testid="fleet-reviewer-list"
      role="list"
      aria-label="PR reviewers"
    >
      <div className="fleet__reviewer-row fleet__node-row--header" aria-hidden="true">
        <span>Reviewer</span>
        <span>Status</span>
        <span>Reviewing</span>
        <span>Last verdict</span>
        <span>Last pass</span>
        <span>Updated</span>
      </div>
      {reviewers.map((node) => (
        <ReviewerRow key={node.runnerId} node={node} />
      ))}
    </div>
  );
}

function ReviewerRow({ node }: { node: RunnerNetworkNode }): JSX.Element {
  const nodeId = testIdSegment(node.runnerId);
  const reviewing = node.tasks[0];
  const last = node.lastActivity;
  const verdict = last ? reviewVerdict(last.conclusion) : null;
  const verdictVariant =
    verdict === 'approve' ? 'success' : verdict === 'hold' ? 'danger' : 'warning';
  return (
    <article
      className={`fleet__node-item is-${node.availability} is-${node.activityState}`}
      data-testid={`fleet-reviewer-${nodeId}`}
      role="listitem"
      aria-label={`PR reviewer ${node.runnerId}: ${node.availability}`}
    >
      <div className="fleet__reviewer-row">
        <div className="fleet__node-titleblock">
          <h3 className="fleet__node-title">{node.runnerId}</h3>
          <p className="fleet__node-source">{node.source}</p>
        </div>
        <div className="fleet__node-pills">
          <AvailabilityPill availability={node.availability} />
        </div>
        {reviewing ? (
          <p
            className="fleet__node-last fleet__node-last--running"
            data-testid={`fleet-reviewer-current-${nodeId}`}
            title={reviewing.startedAt ?? undefined}
          >
            <strong>{reviewing.label}</strong>{' '}
            <span className="page__pill page__pill--warning">reviewing</span>
          </p>
        ) : (
          <span className="fleet__node-muted">idle</span>
        )}
        {last && verdict ? (
          <p className="fleet__node-last" data-testid={`fleet-reviewer-verdict-${nodeId}`}>
            <strong>
              <PullLink repo={last.repo} pr={last.pr} />
            </strong>{' '}
            <Link
              to={pullHref(last.repo, last.pr)}
              className={`page__pill page__pill--${verdictVariant}`}
              title={`${last.conclusion} — open the pull request`}
            >
              {verdict}
            </Link>{' '}
            <span className="fleet__node-muted">{last.sha.slice(0, 7)}</span>
          </p>
        ) : (
          <span className="fleet__node-muted">—</span>
        )}
        <span
          className="fleet__node-muted fleet__node-mono"
          data-testid={`fleet-reviewer-last-pass-${nodeId}`}
          title={last ? `${last.finishedAt} · ${last.seconds}s` : undefined}
        >
          {last?.finishedAt ? relativeTime(last.finishedAt) : 'none yet'}
        </span>
        <When iso={node.lastUpdated} missing="unknown" />
      </div>
    </article>
  );
}

/** Build the drill-down URL for a task that has both a repo and an agent run id. */
function taskTerminalPath(task: RunnerNetworkNode['tasks'][number]): string | undefined {
  if (!task.repo || !task.agentRunId) return;
  const provider = 'jeryu';
  const fullName = encodeURIComponent(task.repo);
  return `/repos/${encodeURIComponent(provider)}/${fullName}/agents/${encodeURIComponent(task.agentRunId)}`;
}

/** A node's running task, shown in the last-gate cell in place of the last finished gate. */
function RunningTask({
  task,
  more,
}: {
  task: RunnerNetworkNode['tasks'][number];
  more: number;
}): JSX.Element {
  const drillPath = taskTerminalPath(task);
  const content = (
    <>
      <strong>{task.label}</strong>{' '}
      <span className="page__pill page__pill--warning">running</span>{' '}
      <span>{task.program}</span>
      {more > 0 ? <span className="fleet__node-muted"> +{more}</span> : null}
    </>
  );
  const props = {
    className: 'fleet__node-last fleet__node-last--running',
    'data-testid': `fleet-task-${testIdSegment(task.taskId)}`,
    title: task.lastTtyLine ?? 'TTY preview unavailable.',
  };
  return drillPath ? (
    <Link to={drillPath} {...props} aria-label={`Open terminal for ${task.label}`}>
      {content}
    </Link>
  ) : (
    <p {...props}>{content}</p>
  );
}

function AvailabilityPill({
  availability,
}: {
  availability: RunnerNetworkNode['availability'];
}): JSX.Element {
  const variant =
    availability === 'online'
      ? 'success'
      : availability === 'draining'
        ? 'warning'
        : availability === 'offline'
          ? 'danger'
          : '';
  const Icon =
    availability === 'offline' ? CircleSlash : availability === 'draining' ? CircleAlert : Server;
  return (
    <span className={`page__pill${variant ? ` page__pill--${variant}` : ''}`}>
      <Icon size={10} aria-hidden="true" /> {availability}
    </span>
  );
}

function ActivityPill({
  activity,
}: {
  activity: RunnerNetworkNode['activityState'];
}): JSX.Element {
  const variant =
    activity === 'active'
      ? 'success'
      : activity === 'idle'
        ? ''
        : 'warning';
  const Icon = activity === 'active' ? Activity : Cpu;
  return (
    <span className={`page__pill${variant ? ` page__pill--${variant}` : ''}`}>
      <Icon size={10} aria-hidden="true" /> {activity}
    </span>
  );
}

function testIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** `owner/name#pr`, linked to the pull request it names. */
function PullLink({ repo, pr }: { repo: string; pr: number }): JSX.Element {
  return (
    <Link to={pullHref(repo, pr)}>
      {repo}#{pr}
    </Link>
  );
}

/** A relative time a person can read, with the exact stamp on hover. */
function When({ iso, missing }: { iso: string | null; missing: string }): JSX.Element {
  if (!iso) return <span className="fleet__node-muted">{missing}</span>;
  return (
    <time className="fleet__node-muted" dateTime={iso} title={iso}>
      {relativeTime(iso)}
    </time>
  );
}

