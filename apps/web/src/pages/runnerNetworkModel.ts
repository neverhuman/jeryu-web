// runnerNetworkModel.ts — pure selectors for the /fleet runner-network drilldown.
//
// Nodes labelled `redteam` are PR reviewers (pr-redteam), not gate slots: they
// are split into `reviewers` and kept out of the slot totals.
//
// The Fleet page consumes the shared runner-fabric response directly and keeps
// the node/task/TTY projection isolated from React. That lets the page show the
// authoritative local node snapshot first, while still deriving a concise view
// for active/idle availability, task counts, and last-TTY-line previews.

import type {
  EvidenceState,
  RunnerLastActivity,
  RunnerFabricResponse,
  RunnerNodeSummary,
  RunnerTaskSummary,
  RunnerTtyPreview,
} from '../api/types';

export type RunnerAvailability =
  | 'online'
  | 'draining'
  | 'offline'
  | 'unknown';

export type RunnerActivityState = 'active' | 'idle' | 'unknown';

/** A gate runner slot, or a PR reviewer (pr-redteam) that holds no gate slot. */
export type RunnerKind = 'gate' | 'reviewer';

/** Heartbeat label that marks a PR reviewer rather than a gate slot. */
export const REVIEWER_LABEL = 'redteam';

/** What a reviewer's last pass concluded, as shown on /runners. */
export type ReviewVerdict = 'approve' | 'hold' | 'no usable verdict';

/**
 * pr-redteam records `approve` or `hold` for a review that reached a verdict;
 * every other outcome (failed, interrupted, too_large, publication_rejected)
 * left no usable verdict.
 */
export function reviewVerdict(conclusion: string): ReviewVerdict {
  if (conclusion === 'approve' || conclusion === 'hold') return conclusion;
  return 'no usable verdict';
}

export interface RunnerNetworkTask {
  taskId: string;
  jobId: string;
  agentRunId: string | null;
  workcellId: string | null;
  repo: string | null;
  label: string;
  program: string;
  state: string;
  startedAt: string | null;
  updatedAt: string | null;
  ttyState: EvidenceState;
  lastTtyLine: string | null;
}

export interface RunnerNetworkNode {
  runnerId: string;
  kind: RunnerKind;
  source: string;
  state: string;
  availability: RunnerAvailability;
  activityState: RunnerActivityState;
  capacity: number;
  inFlight: number;
  labels: string[];
  classes: string[];
  activeTaskCount: number;
  lastUpdated: string | null;
  tasks: RunnerNetworkTask[];
  /** The last gate this runner finished, when it reports one. */
  lastActivity?: RunnerLastActivity | null;
}

export interface RunnerNetworkTotals {
  nodes: number;
  onlineNodes: number;
  offlineNodes: number;
  busyNodes: number;
  idleNodes: number;
  activeTasks: number;
  capacity: number;
  inFlight: number;
}

export interface RunnerNetworkState {
  state: EvidenceState;
  /** Gate runners and other slot-holding nodes; totals cover only these. */
  nodes: RunnerNetworkNode[];
  /** PR reviewers, listed apart from the gate slots. */
  reviewers: RunnerNetworkNode[];
  totals: RunnerNetworkTotals;
  lastUpdated: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function lastTtyLine(preview: RunnerTtyPreview | null | undefined): string | null {
  if (!preview || preview.lines.length === 0) {
    return null;
  }
  const lines = preview.lines
    .flatMap((line) => line.split(/\r?\n/))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length === 0 ? null : (lines[lines.length - 1] ?? null);
}

function availabilityFromState(state: string): RunnerAvailability {
  switch (state) {
    case 'draining':
      return 'draining';
    case 'dead':
    case 'down':
    case 'fenced':
    case 'offline':
    case 'quarantined':
      return 'offline';
    case '':
      return 'unknown';
    default:
      return 'online';
  }
}

function activityFromNode(
  state: RunnerAvailability,
  inFlight: number,
  taskCount: number
): RunnerActivityState {
  if (inFlight > 0 || taskCount > 0) {
    return 'active';
  }
  if (state === 'online' || state === 'draining') {
    return 'idle';
  }
  return 'unknown';
}

function taskFromRaw(raw: RunnerTaskSummary): RunnerNetworkTask {
  return {
    taskId: raw.taskId,
    jobId: raw.jobId,
    agentRunId: raw.agentRunId,
    workcellId: raw.workcellId,
    repo: raw.repo,
    label: raw.label,
    program: raw.program,
    state: raw.state,
    startedAt: raw.startedAt,
    updatedAt: raw.updatedAt,
    ttyState: raw.ttyPreview.state,
    lastTtyLine: lastTtyLine(raw.ttyPreview),
  };
}

function nodeFromRaw(raw: RunnerNodeSummary): RunnerNetworkNode {
  const tasks = raw.activeTasks.map(taskFromRaw);
  const availability = availabilityFromState(raw.state);
  const activeTaskCount = tasks.length || raw.activeTaskCount;
  const lastUpdated =
    raw.lastUpdated ??
    tasks
      .map((task) => task.updatedAt)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .sort()
      .at(-1) ??
    null;
  return {
    runnerId: raw.runnerId,
    kind: raw.labels.includes(REVIEWER_LABEL) ? 'reviewer' : 'gate',
    source: raw.source,
    state: raw.state,
    availability,
    activityState: activityFromNode(availability, raw.inFlight, activeTaskCount),
    capacity: raw.capacity,
    inFlight: raw.inFlight,
    labels: raw.labels,
    classes: raw.classes,
    activeTaskCount,
    lastUpdated,
    tasks,
    lastActivity: raw.lastActivity ?? null,
  };
}

function totalsFromNodes(nodes: RunnerNetworkNode[]): RunnerNetworkTotals {
  return nodes.reduce<RunnerNetworkTotals>(
    (acc, node) => ({
      nodes: acc.nodes + 1,
      onlineNodes: acc.onlineNodes + (node.availability === 'online' ? 1 : 0),
      offlineNodes: acc.offlineNodes + (node.availability === 'offline' ? 1 : 0),
      busyNodes: acc.busyNodes + (node.activityState === 'active' ? 1 : 0),
      idleNodes: acc.idleNodes + (node.activityState === 'idle' ? 1 : 0),
      activeTasks: acc.activeTasks + node.activeTaskCount,
      capacity: acc.capacity + node.capacity,
      inFlight: acc.inFlight + node.inFlight,
    }),
    {
      nodes: 0,
      onlineNodes: 0,
      offlineNodes: 0,
      busyNodes: 0,
      idleNodes: 0,
      activeTasks: 0,
      capacity: 0,
      inFlight: 0,
    }
  );
}

/** A gate runner's last finished gate, or null when absent or malformed. */
function lastActivityFromRaw(value: unknown): RunnerLastActivity | null {
  const record = asRecord(value);
  if (!record) return null;
  const repo = str(record.repo);
  const sha = str(record.sha);
  const conclusion = str(record.conclusion);
  const finishedAt = str(record.finishedAt);
  if (!repo || !sha || !conclusion || !finishedAt) return null;
  return {
    repo,
    pr: num(record.pr),
    sha,
    recipe: str(record.recipe),
    conclusion,
    seconds: num(record.seconds),
    finishedAt,
  };
}

export function runnerNetworkFromResponse(
  response: RunnerFabricResponse | null | undefined
): RunnerNetworkState {
  const raw = asRecord(response);
  const local = asRecord(raw?.local);
  const nodeDetails = Array.isArray(local?.nodeDetails) ? local.nodeDetails : [];
  const allNodes = nodeDetails
    .map((node) => {
      const record = asRecord(node);
      if (!record) return;
      const tasks = Array.isArray(record.activeTasks) ? record.activeTasks : [];
      return nodeFromRaw({
        runnerId: str(record.runnerId),
        source: str(record.source) || 'local',
        state: str(record.state),
        capacity: num(record.capacity),
        inFlight: num(record.inFlight),
        labels: strList(record.labels),
        classes: strList(record.classes),
        activeTaskCount: num(record.activeTaskCount),
        lastUpdated: typeof record.lastUpdated === 'string' ? record.lastUpdated : null,
        lastActivity: lastActivityFromRaw(record.lastActivity),
        activeTasks: tasks
          .map((task) => {
            const taskRecord = asRecord(task);
            if (!taskRecord) return;
            const ttyRecord = asRecord(taskRecord.ttyPreview);
            return {
              taskId: str(taskRecord.taskId),
              jobId: str(taskRecord.jobId),
              agentRunId:
                typeof taskRecord.agentRunId === 'string' ? taskRecord.agentRunId : null,
              workcellId:
                typeof taskRecord.workcellId === 'string' ? taskRecord.workcellId : null,
              repo: typeof taskRecord.repo === 'string' ? taskRecord.repo : null,
              label: str(taskRecord.label),
              program: str(taskRecord.program),
              state: str(taskRecord.state),
              startedAt:
                typeof taskRecord.startedAt === 'string' ? taskRecord.startedAt : null,
              updatedAt:
                typeof taskRecord.updatedAt === 'string' ? taskRecord.updatedAt : null,
              ttyPreview: {
                state:
                  typeof ttyRecord?.state === 'string'
                    ? (ttyRecord.state as EvidenceState)
                    : 'unknown',
                lines: strList(ttyRecord?.lines),
              },
            } satisfies RunnerTaskSummary;
          })
          .filter((task): task is RunnerTaskSummary => task !== undefined),
      });
    })
    .filter((node): node is RunnerNetworkNode => node !== undefined)
    .sort((a, b) => a.runnerId.localeCompare(b.runnerId));
  const nodes = allNodes.filter((node) => node.kind !== 'reviewer');
  const reviewers = allNodes.filter((node) => node.kind === 'reviewer');

  const totals = totalsFromNodes(nodes);
  const lastUpdated =
    (typeof local?.lastUpdated === 'string' ? local.lastUpdated : null) ??
    allNodes
      .map((node) => node.lastUpdated)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .sort()
      .at(-1) ??
    null;

  return {
    state:
      typeof local?.state === 'string'
        ? (local.state as EvidenceState)
        : 'unknown',
    nodes,
    reviewers,
    totals,
    lastUpdated,
  };
}

/**
 * A runner's labels and classes as one list with each fact once. Reporters
 * send the role both as a label and as a class ("pr-gate", "pr-gate").
 */
export function runnerTags(node: { labels: readonly string[]; classes: readonly string[] }): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of [...node.labels, ...node.classes]) {
    const key = tag.trim().toLowerCase();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag.trim());
  }
  return tags;
}

