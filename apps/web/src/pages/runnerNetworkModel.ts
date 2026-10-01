// runnerNetworkModel.ts — pure selectors for the /fleet runner-network drilldown.
//
// Nodes labelled `redteam` are PR reviewers (pr-redteam), not gate slots: they
// are split into `reviewers` and kept out of the slot totals. Nodes labelled
// `automation` are the forge's background timers (auto-pin, auto-stage): they
// go to `automation` and nowhere else; their words are in
// fleet/automationModel.ts. Nodes labelled `jankurai-audit` are quality audit
// runners: they score repositories rather than gate them, and are listed in
// their own section under `audits`. A forge that sends each node's `kind` is
// believed over the labels (deploy timers carry gate-like labels and are
// automation); labels are the fallback for an older forge.
//
// The Fleet page consumes the shared runner-fabric response directly and keeps
// the node/task/TTY projection isolated from React. That lets the page show the
// authoritative local node snapshot first, while still deriving a concise view
// for active/idle availability, task counts, and last-TTY-line previews.

import type {
  EvidenceState,
  ForgeBuild,
  MergeAttempt,
  MergeGrantGap,
  RunnerLastActivity,
  RunnerFabricResponse,
  RunnerCode,
  RunnerNodeKind,
  RunnerNodeSummary,
  RunnerTaskSummary,
  RunnerTool,
  RunnerTtyPreview,
} from '../api/types';
import { toolsFromRaw } from './fleet/runnerTools';

export type RunnerAvailability =
  | 'online'
  | 'draining'
  | 'offline'
  | 'unknown';

export type RunnerActivityState = 'active' | 'idle' | 'unknown';

/** A gate runner slot, or a PR reviewer, quality audit or background timer that holds none. */
export type RunnerKind = 'gate' | 'reviewer' | 'audit' | 'automation';

/** Heartbeat label that marks a PR reviewer rather than a gate slot. */
export const REVIEWER_LABEL = 'redteam';

/** Heartbeat label that marks a background timer (auto-pin, auto-stage). */
export const AUTOMATION_LABEL = 'automation';

/** Heartbeat label that marks a quality audit runner (it scores, it does not gate). */
export const AUDIT_LABEL = 'jankurai-audit';

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
  /** Reviewer only: repositories where the merge identity has no grant. */
  mergeGrantGaps?: MergeGrantGap[];
  /** The code the runner has installed, when it reports it. */
  code?: RunnerCode | null;
  /** The tools that evaluate a pull request here; empty or absent when none are reported. */
  tools?: RunnerTool[];
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
  /** Quality audit runners; empty from an older forge. */
  audits: RunnerNetworkNode[];
  totals: RunnerNetworkTotals;
  lastUpdated: string | null;
  /** The forge server's own build; null from an older forge. */
  forge: ForgeBuild | null;
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
    case 'active':
    case 'busy':
    case 'idle':
    case 'online':
      return 'online';
    default:
      return 'unknown';
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

function nodeFromRaw(
  raw: RunnerNodeSummary,
  capacityKnown: boolean
): RunnerNetworkNode {
  const tasks = raw.activeTasks.map(taskFromRaw);
  const availability =
    capacityKnown && raw.source !== 'workcell'
      ? availabilityFromState(raw.state)
      : 'unknown';
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
    kind: kindOf(raw.kind, raw.labels),
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
    mergeGrantGaps: raw.mergeGrantGaps ?? [],
    offlineAfterSeconds: raw.offlineAfterSeconds ?? null,
    code: raw.code ?? null,
    tools: raw.tools ?? [],
  };
}

/** The forge's kinds, and the section each belongs in. */
const KIND_SECTIONS: Record<RunnerNodeKind, RunnerKind> = {
  gate: 'gate',
  workcell: 'gate',
  reviewer: 'reviewer',
  automation: 'automation',
  deployer: 'automation',
  'jankurai-audit': 'audit',
};

function isNodeKind(value: unknown): value is RunnerNodeKind {
  return typeof value === 'string' && Object.hasOwn(KIND_SECTIONS, value);
}

/**
 * Which section a runner belongs in: the forge's `kind` when it sends one we
 * know, else its heartbeat labels.
 */
function kindOf(kind: RunnerNodeKind | undefined, labels: readonly string[]): RunnerKind {
  if (kind) return KIND_SECTIONS[kind];
  if (labels.includes(AUTOMATION_LABEL)) return 'automation';
  if (labels.includes(REVIEWER_LABEL)) return 'reviewer';
  if (labels.includes(AUDIT_LABEL)) return 'audit';
  return 'gate';
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

/** The forge's answer to a merge attempt, or null when absent or malformed. */
function mergeAttemptFromRaw(value: unknown): MergeAttempt | null {
  const record = asRecord(value);
  if (!record) return null;
  const result = str(record.result);
  const at = str(record.at);
  if (!result || !at) return null;
  return {
    result,
    status: num(record.status),
    code: str(record.code) || undefined,
    message: str(record.message) || undefined,
    actor: str(record.actor) || undefined,
    at,
  };
}

function mergeGrantGapsFromRaw(value: unknown): MergeGrantGap[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    const repo = str(record?.repo);
    if (!record || !repo) return [];
    return [{ repo, identity: str(record.identity), message: str(record.message) }];
  });
}

/**
 * What blocks a merge, in one line: `queue_merge_commits - rebase it onto the
 * base`. Null when the last attempt landed or queued, or none was made.
 */
export function mergeBlockedReason(attempt: MergeAttempt | null | undefined): string | null {
  if (!attempt || attempt.result !== 'refused') return null;
  const code = attempt.code || `http_${attempt.status}`;
  return attempt.message ? `${code} - ${attempt.message}` : code;
}

/** A runner's installed code, or undefined when absent or malformed. */
function codeFromRaw(value: unknown): RunnerCode | undefined {
  const record = asRecord(value);
  const repo = str(record?.repo);
  const commit = str(record?.commit);
  if (!record || !repo || !commit) return undefined;
  const code: RunnerCode = { repo, commit };
  const version = str(record.version);
  const installedAt = str(record.installedAt);
  if (version) code.version = version;
  if (installedAt) code.installedAt = installedAt;
  return code;
}

/** The forge's own build, or null when absent or malformed. */
function forgeFromRaw(value: unknown): ForgeBuild | null {
  const record = asRecord(value);
  const version = str(record?.version);
  if (!record || !version) return null;
  return {
    version,
    commit: str(record.commit) || null,
    webCommit: str(record.webCommit) || null,
  };
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
    mergeAttempt: mergeAttemptFromRaw(record.mergeAttempt),
  };
}

export function runnerNetworkFromResponse(
  response: RunnerFabricResponse | null | undefined,
  snapshotAvailable = true
): RunnerNetworkState {
  const raw = asRecord(response);
  const local = asRecord(raw?.local);
  const capacityKnown = snapshotAvailable && local?.state === 'fresh';
  const nodeDetails = Array.isArray(local?.nodeDetails) ? local.nodeDetails : [];
  const allNodes = nodeDetails
    .map((node) => {
      const record = asRecord(node);
      if (!record) return;
      const tasks = Array.isArray(record.activeTasks) ? record.activeTasks : [];
      return nodeFromRaw({
        runnerId: str(record.runnerId),
        kind: isNodeKind(record.kind) ? record.kind : undefined,
        source: str(record.source) || 'local',
        state: str(record.state),
        capacity: num(record.capacity),
        inFlight: num(record.inFlight),
        labels: strList(record.labels),
        classes: strList(record.classes),
        activeTaskCount: num(record.activeTaskCount),
        lastUpdated: typeof record.lastUpdated === 'string' ? record.lastUpdated : null,
        lastActivity: lastActivityFromRaw(record.lastActivity),
        mergeGrantGaps: mergeGrantGapsFromRaw(record.mergeGrantGaps),
        offlineAfterSeconds: num(record.offlineAfterSeconds) > 0 ? num(record.offlineAfterSeconds) : null,
        code: codeFromRaw(record.code),
        tools: toolsFromRaw(record.tools),
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
      }, capacityKnown &&
        typeof record.capacity === 'number' &&
        Number.isFinite(record.capacity) &&
        record.capacity >= 0);
    })
    .filter((node): node is RunnerNetworkNode => node !== undefined)
    .sort((a, b) => a.runnerId.localeCompare(b.runnerId));
  const nodes = allNodes.filter((node) => node.kind === 'gate');
  const reviewers = allNodes.filter((node) => node.kind === 'reviewer');
  const automation = allNodes.filter((node) => node.kind === 'automation');
  const audits = allNodes.filter((node) => node.kind === 'audit');

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
      snapshotAvailable && typeof local?.state === 'string'
        ? (local.state as EvidenceState)
        : 'unknown',
    nodes,
    reviewers,
    automation,
    audits,
    totals,
    lastUpdated,
    forge: forgeFromRaw(raw?.forge),
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

/** True when two commits name the same one, whichever is abbreviated. */
export function sameCommit(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.length >= 7 && y.length >= 7 && (x.startsWith(y) || y.startsWith(x));
}

// ── Code: what each runner, and the forge itself, runs ───────────────────

/** A runner's code in a few characters: "abc1234 · 1.4.0", or "abc1234". */
export function codeLabel(code: RunnerCode): string {
  return code.version
    ? `${shortSha(code.commit)} · ${code.version}`
    : shortSha(code.commit);
}

/** The full story for a tooltip: "acme/gate-scripts@<sha> 1.4.0, installed <when>". */
export function codeTitle(code: RunnerCode): string {
  const version = code.version ? ` ${code.version}` : '';
  const installed = code.installedAt ? `, installed ${code.installedAt}` : '';
  return `${code.repo}@${code.commit}${version}${installed}`;
}

/**
 * Runners whose commit differs from the one most of the runners with the same
 * code repo in the list run. Only a clear majority counts: two runners on two
 * commits mark neither, because neither is the odd one out.
 */
export function codeOutliers(nodes: readonly RunnerNetworkNode[]): Set<string> {
  const byRepo = new Map<string, RunnerNetworkNode[]>();
  for (const node of nodes) {
    if (!node.code) continue;
    const group = byRepo.get(node.code.repo) ?? [];
    group.push(node);
    byRepo.set(node.code.repo, group);
  }
  const outliers = new Set<string>();
  for (const group of byRepo.values()) {
    const counts = new Map<string, number>();
    for (const node of group) {
      const commit = node.code?.commit.toLowerCase() ?? '';
      counts.set(commit, (counts.get(commit) ?? 0) + 1);
    }
    if (counts.size < 2) continue;
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [top, next] = ranked;
    if (!top || !next || top[1] === next[1]) continue;
    for (const node of group) {
      if (node.code && node.code.commit.toLowerCase() !== top[0]) {
        outliers.add(node.runnerId);
      }
    }
  }
  return outliers;
}

export interface ForgeBuildLine {
  /** "Forge 5.0.0 · server abc1234 · web def5678". */
  text: string;
  /** The full commits, for a tooltip. */
  title: string;
  /** True when this page is not the web bundle the forge pins. */
  webMismatch: boolean;
}

/**
 * What code the forge runs, in one line, with this page's own build commit
 * beside the pinned web commit when the two differ. Null when there is
 * nothing to say: an older forge and a page built without a commit.
 */
export function forgeBuildLine(
  forge: ForgeBuild | null,
  pageCommit: string | null
): ForgeBuildLine | null {
  if (!forge && !pageCommit) return null;
  const parts: string[] = [];
  const titles: string[] = [];
  if (forge) {
    parts.push(`Forge ${forge.version}`);
    if (forge.commit) {
      parts.push(`server ${shortSha(forge.commit)}`);
      titles.push(`server ${forge.commit}`);
    }
    if (forge.webCommit) {
      parts.push(`web ${shortSha(forge.webCommit)}`);
      titles.push(`pinned web ${forge.webCommit}`);
    }
  }
  const pinned = forge?.webCommit ?? null;
  const webMismatch = pinned !== null && pageCommit !== null && !sameCommit(pinned, pageCommit);
  if (pageCommit && (pinned === null || webMismatch)) {
    parts.push(`this page ${shortSha(pageCommit)}`);
    titles.push(`this page ${pageCommit}`);
  }
  return { text: parts.join(' · '), title: titles.join('\n'), webMismatch };
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
  if (!task && node.availability === 'unknown') {
    // The snapshot carries no usable state for this runner: say so rather
    // than read the absence of a task as an idle, available slot.
    return {
      text: 'availability unknown',
      subject: null,
      pull: null,
      elapsed: null,
      draining: false,
      tone: 'warning',
    };
  }
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
  const verb =
    node.kind === 'reviewer'
      ? 'reviewing'
      : node.kind === 'audit'
        ? 'auditing'
        : pull
          ? 'gating'
          : 'running';
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
  /**
   * Reviewer only: why its approval has not landed ("queue_merge_commits -
   * ..."), from the forge's last merge attempt or a missing merge grant.
   */
  blocked: string | null;
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
    const gap = node.mergeGrantGaps?.find((item) => item.repo === last.repo);
    const blocked =
      verdict === 'approve'
        ? mergeBlockedReason(last.mergeAttempt) ?? (gap ? gap.message : null)
        : null;
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
          ? blocked
            ? 'warning'
            : 'success'
          : verdict === 'hold'
            ? 'danger'
            : 'warning',
      blocked
    };
  }
  if (node.kind === 'audit') {
    const audit = auditVerb(last.conclusion);
    return {
      pull,
      subject,
      verb: audit.verb,
      verbFirst: false,
      duration,
      finishedAt: last.finishedAt,
      tone: audit.tone,
      blocked: null
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
    tone: passed ? 'success' : 'danger',
    blocked: null
  };
}

/**
 * An audit's conclusion in words: the report was recorded ("scored", which is
 * not a pass: the verdict is the proof check's), the audit was refused or
 * failed, or the scorer itself broke (which says nothing about the code).
 */
export function auditVerb(conclusion: string): { verb: string; tone: RowTone } {
  switch (conclusion) {
    case 'scored':
    case 'success':
      // The report was recorded; pass or fail is the proof check's verdict.
      return { verb: 'scored', tone: 'neutral' };
    case 'refused':
      return { verb: 'refused', tone: 'warning' };
    case 'failed':
    case 'failure':
      return { verb: 'failed', tone: 'danger' };
    case 'tool-failed':
      return { verb: 'tool failed', tone: 'warning' };
    default:
      return { verb: 'errored', tone: 'danger' };
  }
}

/**
 * Reviewers worth a row, and the ones that have never reviewed anything. A
 * reviewer that is present, idle, and has no review behind it fills a row with
 * "idle" and "none yet"; four of those read as capacity doing work. They fold
 * into one line instead. Anything else — a review in flight, a review behind
 * it, an unmerged approval, offline or an availability we cannot read — keeps
 * its row, because its row says something.
 */
export function splitReviewers(reviewers: readonly RunnerNetworkNode[]): {
  listed: RunnerNetworkNode[];
  idle: RunnerNetworkNode[];
} {
  const idle = reviewers.filter(
    (node) =>
      node.activityState === 'idle' &&
      node.tasks.length === 0 &&
      !node.lastActivity &&
      (node.mergeGrantGaps?.length ?? 0) === 0
  );
  return {
    listed: reviewers.filter((node) => !idle.includes(node)),
    idle
  };
}

/** "4 reviewers have not reviewed anything yet: xbabe0 · redteam, …". */
export function idleReviewerSentence(
  idle: readonly RunnerNetworkNode[]
): string {
  const names = idle.map((node) => runnerName(node.runnerId)).join(', ');
  return `${idle.length} reviewer${idle.length === 1 ? ' has' : 's have'} not reviewed anything yet: ${names}.`;
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
  if (nodes.every((node) => node.availability === 'unknown')) {
    // Busy/idle/offline counts would be invented: the snapshot says nothing
    // about whether these runners are there at all.
    return {
      text: `${nodes.length} gate runner${nodes.length === 1 ? '' : 's'}${where}: availability unknown`,
      tone: 'warning'
    };
  }
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
