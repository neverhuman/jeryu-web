// activityModel.ts — pure helpers for the Activity page, its wall mode, the
// live dock, and the per-PR events panel. Deterministic given `now`.

import type { Tone } from '../../components/tone/tone';
import type { PipelineEvent, PipelineEventsQuery } from '../../api/types';
import { localDayKey, zoneLabel } from '../../format/when';
import { repoRefOf, repoUrl } from '../repoBrowserModel';
import { todoHref } from '../shift/workPaths';

export const ACTIVITY_PATH = '/activity';
export const ACTIVITY_PAGE_SIZE = 100;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** URL-held filters. `kind` is a prefix when it ends with `.` (server rule). */
export interface ActivityFilters {
  family: string;
  repo: string;
  source: string;
  kind: string;
  todo_id: string;
  pr: string;
  needs_human: boolean;
}

export const FILTER_KEYS = ['family', 'repo', 'source', 'kind', 'todo_id', 'pr'] as const;

export function parseActivityFilters(params: URLSearchParams): ActivityFilters {
  const text = (key: string): string => (params.get(key) ?? '').trim();
  return {
    family: text('family'),
    repo: text('repo'),
    source: text('source'),
    kind: text('kind'),
    todo_id: text('todo_id'),
    pr: /^\d+$/.test(text('pr')) ? text('pr') : '',
    needs_human: params.get('needs_human') === '1' || params.get('needs_human') === 'true',
  };
}

export function isWallMode(params: URLSearchParams): boolean {
  return params.get('wall') === '1';
}

export function filtersToQuery(filters: ActivityFilters): PipelineEventsQuery {
  const query: PipelineEventsQuery = {};
  if (filters.family) query.family = filters.family;
  if (filters.repo) query.repo = filters.repo;
  if (filters.source) query.source = filters.source;
  // The server takes one kind (or one prefix). A chip that spans several
  // (`review.,pr.review`) asks for everything and narrows here: `matchesKind`.
  if (filters.kind && !filters.kind.includes(',')) query.kind = filters.kind;
  if (filters.todo_id) query.todo_id = filters.todo_id;
  if (filters.pr) query.pr = Number(filters.pr);
  if (filters.needs_human) query.needs_human = true;
  return query;
}

export function hasActiveFilters(filters: ActivityFilters): boolean {
  return filters.needs_human || FILTER_KEYS.some((key) => filters[key] !== '');
}

/** Link to the Activity page with some filters set. */
export function activityHref(filters: Partial<Record<(typeof FILTER_KEYS)[number], string | number>>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const suffix = qs.toString();
  return suffix ? `${ACTIVITY_PATH}?${suffix}` : ACTIVITY_PATH;
}

/** The kinds a `kind` filter names: one, or several separated by commas. */
export function kindPatterns(kind: string): string[] {
  return kind
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/** The server's rule, applied here too: exact, or a prefix when it ends with `.`. */
export function matchesKind(eventKind: string, kind: string): boolean {
  const patterns = kindPatterns(kind);
  if (patterns.length === 0) return true;
  return patterns.some((pattern) =>
    pattern.endsWith('.') ? eventKind.startsWith(pattern) : eventKind === pattern
  );
}

/** Minutes two reports of one happening may lie apart and still be one happening. */
export const SAME_HAPPENING_MS = 5 * 60 * 1000;

const PLAIN_GATE_OUTCOMES = new Set(['success', 'failure']);

/** The forge's heartbeat schema knows success, failure and error; the runner's
 *  own report also says timed_out and inputs_changed, and the heartbeat
 *  flattens both of those to error. */
function sameGateOutcome(log: string | null, finished: string | null): boolean {
  if (log === finished) return true;
  return finished === 'error' && log !== null && !PLAIN_GATE_OUTCOMES.has(log);
}

/**
 * One row per happening. A finished gate is reported twice: `gate.finished`
 * (the forge, from the runner's heartbeat) and `gate.log` (the runner's
 * reporter, seconds later, with the log tail). The same goes for a review:
 * `review.finished` (heartbeat) and `pr.review` (the verdict itself). Keep the
 * one that carries more (`gate.log`, `pr.review`) and drop its echo. A lone
 * report of either kind is kept.
 */
export function foldEchoes(events: PipelineEvent[]): PipelineEvent[] {
  const logs = events.filter((event) => event.kind === 'gate.log');
  const verdicts = events.filter((event) => event.kind === 'pr.review');
  if (logs.length === 0 && verdicts.length === 0) return events;
  return events.filter((event) => {
    if (event.kind === 'gate.finished') {
      const at = Date.parse(event.ts);
      return !logs.some(
        (log) =>
          log.repo !== null &&
          log.repo === event.repo &&
          log.sha !== null &&
          log.sha === event.sha &&
          sameGateOutcome(log.outcome, event.outcome) &&
          Math.abs(Date.parse(log.ts) - at) <= SAME_HAPPENING_MS
      );
    }
    if (event.kind === 'review.finished') {
      return !verdicts.some(
        (verdict) =>
          verdict.repo !== null &&
          verdict.repo === event.repo &&
          verdict.pr !== null &&
          verdict.pr === event.pr &&
          verdict.sha !== null &&
          verdict.sha === event.sha
      );
    }
    return true;
  });
}

/** What a list shows: echoes folded, a multi-kind chip applied. */
export function visibleEvents(events: PipelineEvent[], kind = ''): PipelineEvent[] {
  const folded = foldEchoes(events);
  return kind.includes(',') ? folded.filter((event) => matchesKind(event.kind, kind)) : folded;
}

/** Union by `seq`, newest first. Later arguments win on a duplicate seq. */
export function mergeEvents(...lists: Array<PipelineEvent[] | undefined>): PipelineEvent[] {
  const bySeq = new Map<number, PipelineEvent>();
  for (const list of lists) {
    for (const event of list ?? []) bySeq.set(event.seq, event);
  }
  return [...bySeq.values()].sort((a, b) => b.seq - a.seq);
}

export function maxSeq(events: PipelineEvent[]): number {
  return events.reduce((max, event) => Math.max(max, event.seq), 0);
}

export function minSeq(events: PipelineEvent[]): number | null {
  return events.length === 0 ? null : events.reduce((min, event) => Math.min(min, event.seq), Infinity);
}

export type EventTone = Tone;

const BAD = new Set(['failure', 'failed', 'error', 'blocked', 'timed_out', 'request_changes', 'inputs_changed']);
const SHAKY = new Set(['retry', 'ratelimit', 'dequeued', 'pending', 'in_progress', 'queued', 'hold']);
const GOOD = new Set(['success', 'done', 'approve', 'approved', 'landed', 'merged']);

/** Red only when a human is needed; a failure the pipeline owns gets its own
 *  tone, and a clean finish is green. */
export function eventTone(event: Pick<PipelineEvent, 'needs_human' | 'outcome'>): EventTone {
  if (event.needs_human) return 'human';
  const outcome = (event.outcome ?? '').toLowerCase();
  if (BAD.has(outcome)) return 'failed';
  if (SHAKY.has(outcome)) return 'warn';
  if (GOOD.has(outcome)) return 'ok';
  return 'unknown';
}

export interface EventLink {
  label: string;
  to: string;
}

/** SPA path of a forge repo given as `owner/name`, on the forge it is on. */
export function repoHref(host: string, repo: string): string {
  return repoUrl(repoRefOf(host, repo));
}

export function pullHref(host: string, repo: string, pr: number): string {
  return repoUrl(repoRefOf(host, repo), 'pulls', String(pr));
}

/**
 * Where an event's join keys lead: its todo, its PR, its repo. There is no
 * commit page in the app, so a sha is shown as text and the PR link carries it.
 */
export function eventLinks(event: PipelineEvent, host: string): EventLink[] {
  const links: EventLink[] = [];
  if (event.todo_id && event.family) {
    links.push({ label: `todo ${event.todo_id}`, to: todoHref(event.todo_id) });
  }
  if (event.repo && event.pr) {
    links.push({ label: `${event.repo}#${event.pr}`, to: pullHref(host, event.repo, event.pr) });
  } else if (event.repo) {
    links.push({ label: event.repo, to: repoHref(host, event.repo) });
  }
  return links;
}

export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A day as an operator reads it: `Today · 19 Sep 2026 · CEST`, `Yesterday · …`,
 * else the date alone. Clock times carry no date and no zone, so both are said
 * once, above the rows they cover.
 */
export function formatDay(iso: string, now: Date): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const date = `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
  const days = Math.round(
    (Date.parse(`${localDayKey(now)}T00:00:00Z`) - Date.parse(`${localDayKey(iso)}T00:00:00Z`)) / DAY_MS
  );
  const named = days === 0 ? `Today · ${date}` : days === 1 ? `Yesterday · ${date}` : date;
  return `${named} · ${zoneLabel()}`;
}

export interface DayGroup {
  day: string;
  events: PipelineEvent[];
}

/** The feed split into runs of one day, in the order the events came (newest first). */
export function groupByDay(events: PipelineEvent[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of events) {
    const day = localDayKey(event.ts);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.events.push(event);
    else groups.push({ day, events: [event] });
  }
  return groups;
}

/** Whether a row has more to say than its one line: a reason, or a log. */
export function hasDetail(event: Pick<PipelineEvent, 'reason' | 'log_tail'>): boolean {
  return Boolean(event.reason) || Boolean(event.log_tail);
}

export interface WallCounters {
  todosFinished: number;
  blocked: number;
  prsMerged: number;
  deploys: number;
  spentUsd: number;
  /** Events inside the window, so the wall can say what the counters cover. */
  events: number;
}

/**
 * Last-24-hour counters, computed from the fetched events only: the wall says
 * how many events it covers rather than implying a server-side total.
 */
export function wallCounters(events: PipelineEvent[], now: Date): WallCounters {
  const since = now.getTime() - DAY_MS;
  const counters: WallCounters = {
    todosFinished: 0,
    blocked: 0,
    prsMerged: 0,
    deploys: 0,
    spentUsd: 0,
    events: 0,
  };
  for (const event of events) {
    const at = Date.parse(event.ts);
    if (Number.isNaN(at) || at < since) continue;
    counters.events += 1;
    if (typeof event.cost_usd === 'number') counters.spentUsd += event.cost_usd;
    if (event.kind === 'todo.attempt_finished') {
      if (event.outcome === 'done') counters.todosFinished += 1;
      if (event.outcome === 'blocked') counters.blocked += 1;
    }
    if (event.kind === 'pr.merged') counters.prsMerged += 1;
    if (event.kind === 'deploy.status' && event.outcome === 'success') counters.deploys += 1;
  }
  counters.spentUsd = Math.round(counters.spentUsd * 100) / 100;
  return counters;
}

/**
 * What happened, in words an operator reads at a glance. The wire kind
 * (`gate.log`, `todo.attempt_finished`) is for machines; a kind this table
 * does not know is shown as it came, never hidden.
 */
export function eventLabel(event: Pick<PipelineEvent, 'kind' | 'outcome'>): string {
  const outcome = (event.outcome ?? '').toLowerCase();
  const failed = outcome === 'failure' || outcome === 'error' || outcome === 'failed';
  switch (event.kind) {
    case 'gate.started':
      return 'Gate started';
    case 'gate.log':
    case 'gate.finished':
      if (outcome === 'success') return 'Gate passed';
      if (outcome === 'timed_out') return 'Gate timed out';
      if (outcome === 'inputs_changed') return 'Gate re-running';
      return failed ? 'Gate failed' : 'Gate finished';
    case 'review.started':
      return 'Review started';
    case 'review.finished':
    case 'pr.review':
      if (outcome === 'approve' || outcome === 'approved') return 'Review: approved';
      if (outcome === 'request_changes' || outcome === 'hold') return 'Review: changes requested';
      return failed ? 'Review failed' : 'Review finished';
    case 'pr.opened':
      return 'Pull request opened';
    case 'pr.approved':
      return 'Pull request approved';
    case 'pr.merged':
      return 'Pull request merged';
    case 'queue.enqueued':
      return 'Queued to merge';
    case 'queue.building':
      return 'Merge queue gating';
    case 'queue.landed':
      return 'Merged by the queue';
    case 'queue.failed':
      return 'Merge queue failed';
    case 'queue.dequeued':
      return 'Left the merge queue';
    case 'queue.refused':
      return 'Merge queue refused';
    case 'todo.filed':
      return 'Todo filed';
    case 'todo.claimed':
      return 'Todo claimed';
    case 'todo.action':
      return 'Todo changed';
    case 'todo.merged':
      return 'Todo merged';
    case 'todo.waiting_on_unmerged':
      return 'Todo waiting';
    case 'todo.attempt_finished':
      if (outcome === 'done') return 'Todo finished';
      if (outcome === 'blocked') return 'Todo blocked';
      if (outcome === 'retry') return 'Todo retrying';
      if (outcome === 'ratelimit') return 'Rate limited';
      return 'Attempt finished';
    case 'worker.stage':
      return 'Worker';
    case 'worker.error':
      return 'Worker error';
    case 'shift.pr_opened':
      return 'Shift pull request opened';
    case 'shift.exhausted':
      return 'Shift budget spent';
    case 'release.staged':
      return 'Release staged';
    case 'release.stage_failed':
      return 'Staging failed';
    case 'deploy.created':
      return 'Deploy started';
    case 'deploy.status':
      if (outcome === 'success') return 'Deployed';
      return failed ? 'Deploy failed' : 'Deploying';
    case 'pin.bump_opened':
      return 'Pin bump opened';
    case 'pin.bump_failed':
      return 'Pin bump failed';
    default:
      return event.kind;
  }
}

/** One-click views of the feed. `kind` is a server-side prefix filter. */
export interface ActivityChip {
  id: string;
  label: string;
  kind?: string;
  needsHuman?: boolean;
}

export const ACTIVITY_CHIPS: readonly ActivityChip[] = [
  { id: 'all', label: 'All' },
  // Past tense on purpose: these are events that were flagged, not the list of
  // what waits on someone now — that is Needs you, linked beside the chips.
  { id: 'human', label: 'Needed a human', needsHuman: true },
  { id: 'todos', label: 'Todos', kind: 'todo.' },
  { id: 'gates', label: 'Gates', kind: 'gate.' },
  // A verdict is `pr.review`; the reviewer's start/finish beats are `review.*`.
  { id: 'reviews', label: 'Reviews', kind: 'review.,pr.review' },
  { id: 'pulls', label: 'Pull requests', kind: 'pr.' },
  { id: 'merges', label: 'Merges', kind: 'queue.' },
  { id: 'releases', label: 'Releases', kind: 'release.' },
  { id: 'deploys', label: 'Deploys', kind: 'deploy.' },
];

/** The chip the URL's filters amount to, or null for a hand-made filter. */
export function activeChip(filters: Pick<ActivityFilters, 'kind' | 'needs_human'>): string | null {
  if (filters.needs_human) return filters.kind === '' ? 'human' : null;
  if (filters.kind === '') return 'all';
  return ACTIVITY_CHIPS.find((chip) => chip.kind === filters.kind)?.id ?? null;
}

/** The URL params a chip sets, keeping the family and the other filters. */
export function applyChip(params: URLSearchParams, chip: ActivityChip): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('kind');
  next.delete('needs_human');
  if (chip.kind) next.set('kind', chip.kind);
  if (chip.needsHuman) next.set('needs_human', '1');
  return next;
}

/** Filters that live behind "More filters": open it when one of them is set. */
export const MORE_FILTER_KEYS = ['repo', 'source', 'kind', 'todo_id', 'pr'] as const;

export function hasMoreFilters(filters: ActivityFilters): boolean {
  const chipKind = ACTIVITY_CHIPS.some((chip) => chip.kind === filters.kind);
  return MORE_FILTER_KEYS.some((key) => filters[key] !== '' && !(key === 'kind' && chipKind));
}

/** The event's main subject as one link: its pull request, else its todo, else its repo. */
export function primaryLink(event: PipelineEvent, host: string): EventLink | null {
  if (event.repo && event.pr) {
    return { label: `${event.repo}#${event.pr}`, to: pullHref(host, event.repo, event.pr) };
  }
  if (event.todo_id && event.family) {
    return { label: `todo ${event.todo_id}`, to: todoHref(event.todo_id) };
  }
  if (event.repo) return { label: event.repo, to: repoHref(host, event.repo) };
  return null;
}

/**
 * The summary with its subject turned into the link. A gate summary already
 * says `jeryu/jeryu-deploy#57`; printing that again beside it was noise. When
 * the summary does not name the subject, the link follows it.
 */
export interface SummaryParts {
  before: string;
  link: EventLink | null;
  after: string;
}

export function summaryParts(event: PipelineEvent, host: string): SummaryParts {
  const link = primaryLink(event, host);
  if (!link) return { before: event.summary, link: null, after: '' };
  const at = event.summary.indexOf(link.label);
  if (at < 0) return { before: `${event.summary} `, link, after: '' };
  return {
    before: event.summary.slice(0, at),
    link,
    after: event.summary.slice(at + link.label.length),
  };
}


function sameSubject(a: PipelineEvent, b: PipelineEvent): boolean {
  if (a.kind.split('.')[0] !== b.kind.split('.')[0]) return false;
  if (a.repo !== b.repo) return false;
  if (a.pr !== null && a.pr !== b.pr) return false;
  if (a.todo_id !== null && a.todo_id !== b.todo_id) return false;
  return true;
}

/** The two reports of one finished gate (heartbeat, then the runner's log). */
const GATE_KINDS = new Set(['gate.log', 'gate.finished']);

/** Kinds that say the PR's work is over: nothing on it waits on a person. */
const LANDED_KINDS = new Set(['pr.merged', 'queue.landed', 'todo.merged']);

function outcomeOf(event: Pick<PipelineEvent, 'outcome'>): string {
  return (event.outcome ?? '').toLowerCase();
}

function isGateFailure(event: PipelineEvent): boolean {
  return GATE_KINDS.has(event.kind) && BAD.has(outcomeOf(event));
}

/**
 * Whether `later` clears a gate failure: the pull request it failed on was
 * merged, or a gate on it has since passed. A gate failure is about the PR,
 * not about the gate as a subject of its own, so a merge counts even though
 * its kind family (`pr.`, `queue.`) differs from `gate.`.
 */
function clearsGateFailure(failure: PipelineEvent, later: PipelineEvent): boolean {
  if (!isGateFailure(failure) || failure.repo === null || failure.pr === null) return false;
  if (later.repo !== failure.repo || later.pr !== failure.pr) return false;
  if (LANDED_KINDS.has(later.kind)) return !BAD.has(outcomeOf(later));
  return GATE_KINDS.has(later.kind) && outcomeOf(later) === 'success';
}

/**
 * Seqs of rows whose cause has since cleared: a row that once needed a person,
 * or a gate that failed, followed by a later event that says the cause is
 * gone. For most subjects that is a clean finish on the same subject (same
 * kind family, repo, PR, todo); for a gate failure it is also a merge or a
 * green gate on the same pull request. Needs you already drops these; history
 * must not keep calling for attention, or the pill stops meaning anything.
 */
export function resolvedSeqs(events: PipelineEvent[]): Set<number> {
  const resolved = new Set<number>();
  for (const event of events) {
    if (!event.needs_human && !isGateFailure(event)) continue;
    const cleared = events.some(
      (later) =>
        later.seq > event.seq &&
        !later.needs_human &&
        ((GOOD.has(outcomeOf(later)) && sameSubject(event, later)) || clearsGateFailure(event, later))
    );
    if (cleared) resolved.add(event.seq);
  }
  return resolved;
}
