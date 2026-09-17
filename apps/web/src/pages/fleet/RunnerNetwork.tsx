// fleet/RunnerNetwork.tsx — the runner-network drilldown view for the /fleet
// dashboard: one list row per runner node (status, slot usage, last gate,
// labels) with that node's active-task TTY previews and terminal drill-down
// links listed beneath it.

import { Link } from 'react-router-dom';
import {
  Activity,
  Cpu,
  Server,
  CircleAlert,
  CircleSlash,
  ExternalLink,
} from 'lucide-react';

import type { RunnerNetworkNode } from '../runnerNetworkModel';

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
  const tags = [...node.labels, ...node.classes];
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
        {node.lastActivity ? (
          <p className="fleet__node-last" data-testid={`fleet-node-last-${nodeId}`}>
            <strong>
              {node.lastActivity.repo}#{node.lastActivity.pr}
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
        <span
          className="fleet__node-muted fleet__node-mono"
          title={node.lastUpdated ?? undefined}
        >
          {node.lastUpdated ?? 'unknown'}
        </span>
      </div>

      {node.tasks.length > 0 ? (
        <div className="fleet__task-list">
          {node.tasks.map((task) => (
            <RunnerTaskCard key={task.taskId} task={task} />
          ))}
        </div>
      ) : null}
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

function RunnerTaskCard({ task }: { task: RunnerNetworkNode['tasks'][number] }): JSX.Element {
  const taskId = testIdSegment(task.taskId);
  const drillPath = taskTerminalPath(task);
  const cardContent = (
    <>
      <div className="fleet__task-head">
        <h4 className="fleet__task-title">{task.label}</h4>
        <span className="page__pill page__pill--warning">{task.state}</span>
      </div>
      <p className="fleet__task-meta">
        <span>{task.jobId}</span>
        {task.workcellId ? <span>workcell {task.workcellId}</span> : null}
        {task.agentRunId ? <span>agent {task.agentRunId}</span> : null}
        {task.repo ? <span>{task.repo}</span> : <span>repo unavailable</span>}
      </p>
      <p className="fleet__task-program">{task.program}</p>
      <p className="fleet__task-tty">
        {task.lastTtyLine ?? 'TTY preview unavailable.'}
      </p>
      {drillPath ? (
        <span className="fleet__task-open">
          <ExternalLink size={12} aria-hidden="true" /> Open terminal
        </span>
      ) : null}
    </>
  );
  if (drillPath) {
    return (
      <Link
        to={drillPath}
        className="fleet__task-card fleet__task-card--interactive"
        data-testid={`fleet-task-${taskId}`}
        aria-label={`Open terminal for ${task.label}`}
      >
        {cardContent}
      </Link>
    );
  }
  return (
    <article
      className="fleet__task-card"
      data-testid={`fleet-task-${taskId}`}
      aria-label={`Runner task ${task.label}`}
    >
      {cardContent}
    </article>
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
