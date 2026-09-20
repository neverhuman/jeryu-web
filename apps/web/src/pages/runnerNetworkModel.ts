// runnerNetworkModel.ts — pure selectors for the /fleet runner-network drilldown.
//
// Nodes labelled `redteam` are PR reviewers (pr-redteam), not gate slots: they
// are split into `reviewers` and kept out of the slot totals. Nodes labelled
// `automation` are the forge's background timers (auto-pin, auto-stage): they
// go to `automation` and nowhere else; their words are in
// fleet/automationModel.ts.
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

/** A gate runner slot, or a PR reviewer or background timer that holds none. */
export type RunnerKind = 'gate' | 'reviewer' | 'automation';

/** Heartbeat label that marks a PR reviewer rather than a gate slot. */
export const REVIEWER_LABEL = 'redteam';

/** Heartbeat label that marks a background timer (auto-pin, auto-stage). */
export const AUTOMATION_LABEL = 'automation';

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
  /** The forge's offline threshold for this runner, when it sends one. */
  offlineAfterSeconds?: number | null;
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
  /** Background timers (auto-pin, auto-stage); empty from an older forge. */
  automation: RunnerNetworkNode[];
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
    kind: raw.labels.includes(AUTOMATION_LABEL)
      ? 'automation'
      : raw.labels.includes(REVIEWER_LABEL)
        ? 'reviewer'
        : 'gate',
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
    offlineAfterSeconds: raw.offlineAfterSeconds ?? null,
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
    // Absent or null: the work had no pull request (a staged commit).
    pr: num(record.pr) > 0 ? num(record.pr) : null,
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
        offlineAfterSeconds: num(record.offlineAfterSeconds) > 0 ? num(record.offlineAfterSeconds) : null,
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
  const nodes = allNodes.filter((node) => node.kind === 'gate');
  const reviewers = allNodes.filter((node) => node.kind === 'reviewer');
  const automation = allNodes.filter((node) => node.kind === 'automation');

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
    automation,
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

// ── Rows in words ────────────────────────────────────────────────────────
//
// A runner row says four things: which runner, what it is doing now, what it
// did last, and when it was last heard from. Everything below is pure, so the
// page and its tests agree on the words.

/** No heartbeat for this long and a runner's "seen" is shown as stale. */
export const RUNNER_SEEN_STALE_MS = 3 * 60_000;

export type RowTone = 'neutral' | 'success' | 'warning' | 'danger';

/** `owner/name#12`, the label gate runners and reviewers give their task. */
export interface PullRef {
  repo: string;
  pr: number;
}

const PULL_LABEL = /^([\w.-]+\/[\w.-]+)#(\d+)$/;

/** The pull request a task label names, or null when it names none. */
export function pullRefFromLabel(label: string): PullRef | null {
  const match = PULL_LABEL.exec(label.trim());
  if (!match) return null;
  const pr = Number(match[2]);
  return pr > 0 ? { repo: match[1], pr } : null;
}

/** "xbabe2 · slot 0" for `xbabe2/slot0`, "xbabe0 · redteam" for a reviewer. */
export function runnerName(runnerId: string): string {
  const slot = /^(.+)\/slot(\d+)$/.exec(runnerId);
  if (slot) return `${slot[1]} · slot ${slot[2]}`;
  const [host, ...rest] = runnerId.split('/');
  return rest.length > 0 && host ? `${host} · ${rest.join('/')}` : runnerId;
}

/** The seven-character sha people read aloud. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** 14 -> "14s", 127 -> "2m 7s", 3780 -> "1h 3m". */
export function durationWords(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`;
}

export interface RowNow {
  /** "idle", "offline", or the verb: "gating" / "reviewing" / "running". */
  text: string;
  /** What is being worked on, as its label says it. */
  subject: string | null;
  /** The pull request the subject names, when it names one. */
  pull: PullRef | null;
  /** "1m 20s" since the task started, measured against `nowMs`. */
  elapsed: string | null;
  /** True while the runner finishes what it has and takes nothing new. */
  draining: boolean;
  tone: RowTone;
}

/** What a runner is doing at `nowMs` (the moment the snapshot was fetched). */
export function rowNow(node: RunnerNetworkNode, nowMs: number): RowNow {
  const draining = node.availability === 'draining';
  if (node.availability === 'offline') {
    return {
      text: 'offline',
      subject: null,
      pull: null,
      elapsed: null,
      draining: false,
      tone: 'danger',
    };
  }
  const task = node.tasks[0];
  if (!task) {
    return {
      text: draining ? 'draining' : 'idle',
      subject: null,
      pull: null,
      elapsed: null,
      draining,
      tone: draining ? 'warning' : 'neutral',
    };
  }
  const pull = pullRefFromLabel(task.label);
  const started = task.startedAt ? new Date(task.startedAt).getTime() : Number.NaN;
  const elapsed =
    Number.isFinite(started) && nowMs >= started ? durationWords((nowMs - started) / 1000) : null;
  const verb = node.kind === 'reviewer' ? 'reviewing' : pull ? 'gating' : 'running';
  return {
    text: verb,
    subject: task.label || task.program,
    pull,
    elapsed,
    draining,
    tone: 'warning',
  };
}

export interface RowLast {
  /** The pull request the job was for; null when it had none. */
  pull: PullRef | null;
  /** `owner/name#12`, or `owner/name@77dc331` for a job with no pull request. */
  subject: string;
  /** "passed" / "failed" / "errored", or "approved" / "held" / "no usable verdict on". */
  verb: string;
  /** Whether the verb comes before the subject ("approved x#1") or after ("x#1 passed"). */
  verbFirst: boolean;
  duration: string;
  finishedAt: string;
  tone: RowTone;
}

/** A runner's last finished job, in words; null when it reports none. */
export function rowLast(node: RunnerNetworkNode): RowLast | null {
  const last = node.lastActivity;
  if (!last) return null;
  const pull = last.pr === null ? null : { repo: last.repo, pr: last.pr };
  const subject = pull
    ? `${pull.repo}#${pull.pr}`
    : `${last.repo}@${shortSha(last.sha)}`;
  const duration = durationWords(last.seconds);
  if (node.kind === 'reviewer') {
    const verdict = reviewVerdict(last.conclusion);
    return {
      pull,
      subject,
      verb:
        verdict === 'approve'
          ? 'approved'
          : verdict === 'hold'
            ? 'held'
            : 'no usable verdict on',
      verbFirst: true,
      duration,
      finishedAt: last.finishedAt,
      tone:
        verdict === 'approve'
          ? 'success'
          : verdict === 'hold'
            ? 'danger'
            : 'warning'
    };
  }
  const passed = last.conclusion === 'success';
  return {
    pull,
    subject,
    verb: passed
      ? 'passed'
      : last.conclusion === 'failure'
        ? 'failed'
        : 'errored',
    verbFirst: false,
    duration,
    finishedAt: last.finishedAt,
    tone: passed ? 'success' : 'danger'
  };
}

/** True when a runner has not been heard from for [`RUNNER_SEEN_STALE_MS`]. */
export function seenStale(lastUpdated: string | null, nowMs: number): boolean {
  if (!lastUpdated) return true;
  const seen = new Date(lastUpdated).getTime();
  return !Number.isFinite(seen) || nowMs - seen > RUNNER_SEEN_STALE_MS;
}

/** The hosts a set of runners run on, from their ids (`host/slotN`). */
function hostsOf(nodes: readonly RunnerNetworkNode[]): string[] {
  return [
    ...new Set(nodes.map((node) => node.runnerId.split('/')[0]).filter(Boolean))
  ].sort();
}

export interface NetworkSentence {
  text: string;
  tone: RowTone;
}

/**
 * The whole gate network in one sentence: "6 gate runners on xbabe2: all idle
 * · 0 offline". Red only when a runner is offline.
 */
export function networkSentence(
  nodes: readonly RunnerNetworkNode[]
): NetworkSentence {
  if (nodes.length === 0)
    return { text: 'No gate runner is reporting.', tone: 'warning' };
  const offline = nodes.filter(
    (node) => node.availability === 'offline'
  ).length;
  const busy = nodes.filter((node) => node.activityState === 'active').length;
  const idle = nodes.length - busy - offline;
  const hosts = hostsOf(nodes);
  const where =
    hosts.length > 0 && hosts.length <= 3 ? ` on ${hosts.join(', ')}` : '';
  const doing =
    busy === 0 && offline === 0
      ? 'all idle'
      : busy === nodes.length
        ? 'all busy'
        : `${busy} busy, ${Math.max(idle, 0)} idle`;
  return {
    text: `${nodes.length} gate runner${nodes.length === 1 ? '' : 's'}${where}: ${doing} · ${offline} offline`,
    tone: offline > 0 ? 'danger' : 'neutral'
  };
}
