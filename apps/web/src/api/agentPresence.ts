// agentPresence.ts — who is working on a repository right now.
//
// Agent presence lists every coding agent at work on a repository: sessions
// started by hand from any vendor's CLI (`external`), queue workers, pull
// request reviewers, gate runners, and jeryu's own agent runs. A session
// registered for a whole family shows on every repository of that family.
//
//   GET /api/v1/repos/{id}/agent-presence        → one repository's list
//   GET /api/v1/agent-presence?family=<key>      → one family's list
//
// The wire shape is frontend-local until the read model exports it through
// ts-rs. The body is checked field by field here: an older server answers the
// path with a 404, a 405, or the SPA's own HTML, and the page must then fall
// back to the agent runs list without a banner (`presenceUnsupported`).

import { ApiError, apiGet } from './client';
import type { RepoAgentSummary } from './agentTerminal';

export type PresenceSource = 'external' | 'agent_run' | 'queue_worker' | 'reviewer' | 'gate';
export type PresenceState = 'active' | 'idle' | 'stale' | 'ended';
export type PresenceVia = 'repo' | 'family';

export interface PresenceLinks {
  /** `owner/name#number` of the pull request the agent works on. */
  pr?: string;
  /** Todo id, `family:id` or bare. */
  todo?: string;
  /** jeryu agent run id; the Agents page opens its terminal. */
  agent_run?: string;
}

export interface PresenceLocation {
  session_path?: string;
  cwd?: string;
  checkout_path?: string;
  checkout_kind?: string;
  head?: string;
  screen?: string;
  pid?: number;
}

/** One agent at work, one row of the Agents list. */
export interface AgentPresenceItem {
  /** Source-prefixed id, unique in the list. */
  id: string;
  source: PresenceSource;
  session_id: string | null;
  agent: string;
  model: string | null;
  operator: string | null;
  lane: string | null;
  branch: string | null;
  title: string | null;
  state: PresenceState;
  /** How the session reaches this repository; absent on the family list. */
  via: PresenceVia | null;
  family: string | null;
  /** Milliseconds since the epoch. */
  started_at: number | null;
  last_active_at: number | null;
  expires_at: number | null;
  cost_usd: number | null;
  links: PresenceLinks;
  reporter?: string;
  location?: PresenceLocation;
  worker?: { family: string; slot: string };
  /** External hosts are visible to the reporter and administrators. */
  host: string | null;
  /** Ids of other live items on the same repository and branch. */
  collides_with: string[];
  /** Family list only: the repositories the session names. */
  repos: string[];
  /** Family list only: the families the session declared. */
  families: string[];
}

export interface AgentPresenceList {
  items: AgentPresenceItem[];
  total: number;
}

const SOURCES: readonly PresenceSource[] = ['external', 'agent_run', 'queue_worker', 'reviewer', 'gate'];
const STATES: readonly PresenceState[] = ['active', 'idle', 'stale', 'ended'];

export function repoAgentPresencePath(repoId: string): string {
  return `/api/v1/repos/${encodeURIComponent(repoId)}/agent-presence`;
}

export function familyAgentPresencePath(family: string): string {
  return `/api/v1/agent-presence?${new URLSearchParams({ family }).toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function texts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry !== '');
}

function sourceOf(value: unknown): PresenceSource {
  return SOURCES.find((source) => source === value) ?? 'external';
}

function stateOf(value: unknown): PresenceState {
  return STATES.find((state) => state === value) ?? 'stale';
}

function viaOf(value: unknown): PresenceVia | null {
  return value === 'repo' || value === 'family' ? value : null;
}

function linksOf(value: unknown): PresenceLinks {
  if (!isRecord(value)) return {};
  const links: PresenceLinks = {};
  const pr = text(value.pr);
  const todo = text(value.todo);
  const run = text(value.agent_run);
  if (pr) links.pr = pr;
  if (todo) links.todo = todo;
  if (run) links.agent_run = run;
  return links;
}

function locationOf(value: Record<string, unknown>): PresenceLocation {
  const location: PresenceLocation = {};
  for (const key of ['session_path', 'cwd', 'checkout_path', 'checkout_kind', 'head', 'screen'] as const) {
    const field = text(value[key]);
    if (field) location[key] = field;
  }
  const pid = finite(value.pid);
  if (pid !== null && Number.isSafeInteger(pid) && pid > 0) location.pid = pid;
  return location;
}

/** One wire item, or null when it lacks the id or the agent a row needs. */
export function parsePresenceItem(value: unknown): AgentPresenceItem | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  if (!id) return null;
  const source = sourceOf(value.source);
  const links = linksOf(value.links);
  const agent = text(value.agent) ?? (source === 'agent_run' ? 'agent' : null);
  if (!agent) return null;
  const cost = finite(value.cost_usd);
  return {
    id,
    source,
    session_id: text(value.session_id),
    agent,
    model: text(value.model),
    operator: text(value.operator),
    lane: text(value.lane),
    branch: text(value.branch),
    title: text(value.title),
    state: stateOf(value.state),
    via: viaOf(value.via),
    family: text(value.family),
    started_at: finite(value.started_at),
    last_active_at: finite(value.last_active_at),
    expires_at: finite(value.expires_at),
    cost_usd: cost !== null && cost >= 0 ? cost : null,
    links,
    host: text(value.host),
    ...(text(value.reporter) ? { reporter: text(value.reporter)! } : {}),
    ...(isRecord(value.location) ? { location: locationOf(value.location) } : {}),
    ...(isRecord(value.worker) && text(value.worker.family) && text(value.worker.slot)
      ? { worker: { family: text(value.worker.family)!, slot: text(value.worker.slot)! } } : {}),
    collides_with: texts(value.collides_with).filter((other) => other !== id),
    repos: texts(value.repos),
    families: texts(value.families),
  };
}

/**
 * The response body, checked. A body with no `items` list is not this route
 * answering: it is thrown with code `invalid_response`, which reads unsupported.
 */
export function parsePresenceList(body: unknown): AgentPresenceList {
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw new ApiError(200, {
      code: 'invalid_response',
      message: 'The agent presence response carried no items.',
    });
  }
  const seen = new Set<string>();
  const items: AgentPresenceItem[] = [];
  for (const raw of body.items) {
    const item = parsePresenceItem(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return { items: orderPresence(items), total: finite(body.total) ?? items.length };
}

/**
 * True when the server has no presence route: an older server answers 404,
 * 405 or 501, sends the SPA shell (HTML, so not JSON), or cannot be reached
 * for this one path. The page then shows the agent runs alone, with no banner.
 */
export function presenceUnsupported(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.code === 'invalid_response') return true;
  return error.status === 0 || error.status === 404 || error.status === 405 || error.status === 501;
}

/**
 * Where a presence read stands, in one typed state a page switches on:
 * `waiting` (first read in flight), `absent` (the server has no such route),
 * `failed` (it has one and it failed), or `ready` with the list.
 */
export type PresenceView =
  | { kind: 'waiting' }
  | { kind: 'absent' }
  | { kind: 'failed'; error: Error }
  | { kind: 'ready'; list: AgentPresenceList };

export function presenceView(query: {
  data: AgentPresenceList | undefined;
  error: Error | null;
}): PresenceView {
  if (query.data) return { kind: 'ready', list: query.data };
  if (!query.error) return { kind: 'waiting' };
  return presenceUnsupported(query.error) ? { kind: 'absent' } : { kind: 'failed', error: query.error };
}

/** Live means the agent is still there: active or idle. */
export function isLivePresence(item: Pick<AgentPresenceItem, 'state'>): boolean {
  return item.state === 'active' || item.state === 'idle';
}

const STATE_RANK: Record<PresenceState, number> = { active: 0, idle: 1, stale: 2, ended: 3 };

/** Live first (active, idle), then stale, then ended; newest activity first within each. */
export function orderPresence(items: readonly AgentPresenceItem[]): AgentPresenceItem[] {
  return [...items].sort((a, b) => {
    const rank = STATE_RANK[a.state] - STATE_RANK[b.state];
    if (rank !== 0) return rank;
    const left = a.last_active_at ?? -Infinity;
    const right = b.last_active_at ?? -Infinity;
    if (left !== right) return right - left;
    return a.id.localeCompare(b.id);
  });
}

export function livePresenceCount(items: readonly AgentPresenceItem[]): number {
  return items.filter(isLivePresence).length;
}

/** A jeryu run's lifecycle status, read on the presence scale. */
export function runPresenceState(run: Pick<RepoAgentSummary, 'status' | 'tty_live'>): PresenceState {
  if (run.tty_live || run.status === 'running') return 'active';
  if (run.status === 'queued' || run.status === 'blocked' || run.status === 'starting') return 'idle';
  return 'ended';
}

/** The run id a row opens in the terminal, when it is one of jeryu's runs. */
export function presenceRunId(item: Pick<AgentPresenceItem, 'source' | 'links'>): string | null {
  return item.source === 'agent_run' ? (item.links.agent_run ?? null) : null;
}

function runAsPresence(run: RepoAgentSummary): AgentPresenceItem {
  const at = run.updated_at ? Date.parse(run.updated_at) : NaN;
  const updated = Number.isFinite(at) ? at : null;
  return {
    id: `agent_run:${run.run_id}`,
    source: 'agent_run',
    session_id: null,
    agent: run.agent ?? 'agent',
    model: null,
    operator: null,
    lane: null,
    branch: run.branch || null,
    title: null,
    state: runPresenceState(run),
    via: 'repo',
    family: null,
    started_at: null,
    last_active_at: updated,
    expires_at: null,
    cost_usd: null,
    links: { agent_run: run.run_id },
    host: null,
    collides_with: [],
    repos: [],
    families: [],
  };
}

/** A presence row joined with the jeryu run it names, when there is one. */
export interface PresenceRow {
  item: AgentPresenceItem;
  run: RepoAgentSummary | null;
}

/**
 * One list for the Agents page. Presence already carries jeryu's own runs
 * (`source: agent_run`); each is joined with its run summary, so the row keeps
 * the run's status and live-terminal dot and still opens the terminal. A run
 * the presence list does not name (an ended one past its window) is added from
 * the runs list, so nothing the page used to show goes missing.
 */
export function mergePresenceWithRuns(
  presence: readonly AgentPresenceItem[],
  runs: readonly RepoAgentSummary[]
): PresenceRow[] {
  const byRun = new Map(runs.map((run) => [run.run_id, run]));
  const named = new Set<string>();
  const rows: PresenceRow[] = presence.map((item) => {
    const runId = presenceRunId(item);
    if (runId) named.add(runId);
    return { item, run: runId ? (byRun.get(runId) ?? null) : null };
  });
  for (const run of runs) {
    if (named.has(run.run_id)) continue;
    rows.push({ item: runAsPresence(run), run });
  }
  const order = new Map(orderPresence(rows.map((row) => row.item)).map((item, index) => [item.id, index]));
  return rows.sort((a, b) => (order.get(a.item.id) ?? 0) - (order.get(b.item.id) ?? 0));
}

export async function fetchRepoAgentPresence(repoId: string, signal?: AbortSignal): Promise<AgentPresenceList> {
  const body = await apiGet<unknown>(repoAgentPresencePath(repoId), { signal });
  return parsePresenceList(body);
}

export async function fetchFamilyAgentPresence(family: string, signal?: AbortSignal): Promise<AgentPresenceList> {
  const body = await apiGet<unknown>(familyAgentPresencePath(family), { signal });
  return parsePresenceList(body);
}

export async function fetchAllAgentPresence(params: URLSearchParams, signal?: AbortSignal): Promise<AgentPresenceList> {
  return parsePresenceList(await apiGet<unknown>(`/api/v1/agent-presence?${params.toString()}`, { signal }));
}
