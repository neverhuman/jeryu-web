// activityModel.ts — pure helpers for the Activity page, its wall mode, the
// live dock, and the per-PR events panel. Deterministic given `now`.

import type { Tone } from '../../components/tone/tone';
import { endpoints } from '../../api/endpoints';
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
    // A kind the server would refuse is dropped rather than sent: it answers
    // `422 events_invalid_query` and the whole feed would read as broken.
    kind: isKindFilter(text('kind')) ? text('kind') : '',
    todo_id: text('todo_id'),
    pr: PR_PATTERN.test(text('pr')) ? text('pr') : '',
    needs_human: params.get('needs_human') === '1' || params.get('needs_human') === 'true',
  };
}

/** Longest kind the server stores, in characters. */
export const MAX_KIND_CHARS = 64;

const PR_PATTERN = /^\d+$/;

/** One word of a kind: `^[a-z][a-z0-9_]*$`. */
function isKindWord(word: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(word);
}

/** The server's rule: two or more dotted lower-case words, or such a word
 *  followed by a dot, which reads as a prefix. */
export function isKind(kind: string): boolean {
  const words = kind.split('.');
  return kind.length <= MAX_KIND_CHARS && words.length >= 2 && words.every(isKindWord);
}

/** A `kind` filter the server would take: one kind or prefix, or — for the
 *  chips that span several — a comma-separated list of them, each of which is
 *  narrowed here instead (see `matchesKind`). */
export function isKindFilter(kind: string): boolean {
  const patterns = kindPatterns(kind);
  return (
    patterns.length > 0 &&
    patterns.every((pattern) => (pattern.endsWith('.') ? isKind(`${pattern}x`) : isKind(pattern)))
  );
}

/** Why a typed filter value cannot be used, for the field that holds it, or
 *  null when it can. An empty field is no filter at all, so never an error. */
export function filterFieldError(key: string, value: string): string | null {
  const text = value.trim();
  if (text === '') return null;
  if (key === 'kind' && !isKindFilter(text)) {
    return 'A kind is dotted lower-case words (gate.finished), or a prefix ending in a dot (todo.).';
  }
  if (key === 'pr' && !PR_PATTERN.test(text)) return 'A pull request is its number: digits only.';
  return null;
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

/**
 * The exact request this page's list is one page of, so the screen and the API
 * are visibly the same thing: the filters as the server sees them, with the
 * page size the feed asks for. The cursors (`after_seq`, `before_seq`) are the
 * live tail's and the older loader's, not the view's, so they are left out.
 */
export function eventsApiPath(query: PipelineEventsQuery): string {
  return endpoints.events({ ...query, limit: ACTIVITY_PAGE_SIZE });
}

/**
 * One event as the API returned it, pretty-printed: what an agent or an
 * operator pastes into a ticket or a script. The keys are in the order the
 * server sent them, so a row's JSON reads like the response it came from.
 */
export function eventJson(event: PipelineEvent): string {
  return `${JSON.stringify(event, null, 2)}\n`;
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
    links.push({
      label: `todo ${event.todo_id}`,
      to: todoHref(event.todo_id, event.family),
    });
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

/**
 * The longest duration each kind reached in the loaded list. A row's bar is
 * scaled against its own kind: a gate that runs for minutes and an attempt
 * that runs for an hour say nothing about each other, so they are never put on
 * one scale.
 */
export function longestSecondsByKind(events: Array<Pick<PipelineEvent, 'kind' | 'seconds'>>): Map<string, number> {
  const longest = new Map<string, number>();
  for (const event of events) {
    const seconds = event.seconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) continue;
    longest.set(event.kind, Math.max(longest.get(event.kind) ?? 0, seconds));
  }
  return longest;
}

/** The shortest bar that still reads as a bar, as a share of the full width. */
export const MIN_DURATION_SHARE = 0.04;

/**
 * How much of its row the duration bar fills, 0..1, or null when there is
 * nothing to draw: no duration, or no longest of this kind to scale against.
 * The longest row of its kind fills the width; a very quick one keeps a sliver
 * so the bar is still visible.
 */
export function durationShare(
  seconds: number | null | undefined,
  longestOfKind: number | null | undefined
): number | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (typeof longestOfKind !== 'number' || !Number.isFinite(longestOfKind) || longestOfKind <= 0) return null;
  const share = Math.min(seconds, longestOfKind) / longestOfKind;
  return Math.max(share, MIN_DURATION_SHARE);
}

/** The duration as it was reported, for the title beside the rounded text. */
export function exactSecondsText(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '';
  const exact = Number(seconds.toFixed(3));
  return `${exact} second${exact === 1 ? '' : 's'}`;
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

/** The five numbers the 24-hour strip shows, wherever they were counted. */
export interface ActivityTotals {
  todosFinished: number;
  blocked: number;
  prsMerged: number;
  deploys: number;
  spentUsd: number;
}

export interface WallCounters extends ActivityTotals {
  /** Events inside the window, so the wall can say what the counters cover. */
  events: number;
}

export interface ActivityCounters extends ActivityTotals {
  /** Events the numbers were counted from, or null when the server totalled
   *  the whole window itself and the count of loaded rows means nothing. */
  events: number | null;
}

/**
 * The strip's numbers: the server's window totals when it sends them, else
 * what the events this page holds add up to — with their count, so the strip
 * can say the numbers only cover what is loaded here.
 */
export function activityCounters(
  totals: ActivityTotals | null,
  events: PipelineEvent[],
  now: Date
): ActivityCounters {
  return totals ? { ...totals, events: null } : wallCounters(events, now);
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
  // A merge is reported by whichever road it took: `queue.*` through the merge
  // queue, `pr.merged` from a direct merge. Naming only the queue made the chip
  // go quiet whenever the queue was not in the way.
  { id: 'merges', label: 'Merges', kind: 'queue.,pr.merged' },
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
    return { label: `todo ${event.todo_id}`, to: todoHref(event.todo_id, event.family) };
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

// ---- Runs of worker stage beats -------------------------------------------

/** The kind a working slot reports its progress through an attempt with. */
export const WORKER_STAGE_KIND = 'worker.stage';

/** The stages a slot walks on one attempt, in the order it walks them. */
export const WORKER_STAGES = ['prepare', 'agent', 'gate', 'land'] as const;

const STAGE_WORD = /^[a-z][a-z0-9_]*$/;

/** `w1 jeryu: agent -> gate on 20260919-0800-aaa`, the words a beat is written
 *  in when its producer attached no `detail`: the slot, the stage it left, and
 *  the stage it reached. */
const STAGE_SUMMARY = /^(w\d+)\b[^:]*:\s*(?:([a-z][a-z0-9_]*)\s*->\s*)?([a-z][a-z0-9_]*)/;

function isStage(stage: string): boolean {
  return (WORKER_STAGES as readonly string[]).includes(stage);
}

function detailText(event: Pick<PipelineEvent, 'detail'>, key: string): string | null {
  const value = event.detail?.[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Which slot a beat came from: `w1`. The producer's own `detail.slot` first,
 * then the slot of its actor (`alton@xbabe0/w1`), then the summary. Null when
 * nothing names one — two slots then cannot be told apart, so their beats are
 * never folded into one row.
 */
export function stageSlot(event: PipelineEvent): string | null {
  const stated = detailText(event, 'slot');
  if (stated) return stated;
  const actor = (event.actor ?? '').split('/').pop() ?? '';
  if (/^w\d+$/.test(actor)) return actor;
  return STAGE_SUMMARY.exec(event.summary)?.[1] ?? null;
}

/** The stage a beat left, when it says so: the first of them opens the path
 *  a run walked, which otherwise would start where its second beat starts. */
export function stageFrom(event: PipelineEvent): string | null {
  const stated = detailText(event, 'from');
  if (stated !== null && STAGE_WORD.test(stated)) return stated;
  return STAGE_SUMMARY.exec(event.summary)?.[2] ?? null;
}

/** The stage a beat reached, from `detail.stage`, its outcome, or its summary. */
export function stageName(event: PipelineEvent): string | null {
  const stated = detailText(event, 'stage');
  if (stated !== null && STAGE_WORD.test(stated)) return stated;
  const outcome = (event.outcome ?? '').toLowerCase();
  if (isStage(outcome)) return outcome;
  return STAGE_SUMMARY.exec(event.summary)?.[3] ?? null;
}

/** Consecutive beats of one slot on one todo, as the one row they are drawn as. */
export interface StageRun {
  /** The newest beat: the row's time, its tone, and its key. */
  latest: PipelineEvent;
  /** Every beat folded here, newest first, as the feed held them. */
  events: PipelineEvent[];
  slot: string;
  todoId: string | null;
  /** The stages the run walked, oldest first; the last is where it is now. */
  steps: string[];
}

/** What a list draws: one event, or a run of stage beats folded into one row. */
export interface ActivityRow {
  /** The event the row stands for: a lone event, or a run's newest beat. */
  event: PipelineEvent;
  /** Set when this row stands for several beats, which the row can expand. */
  run: StageRun | null;
}

function stageRun(slot: string, todoId: string | null, events: PipelineEvent[]): StageRun {
  const steps: string[] = [];
  const oldest = events[events.length - 1];
  const opening = stageFrom(oldest);
  if (opening !== null) steps.push(opening);
  for (const event of [...events].reverse()) {
    const stage = stageName(event);
    if (stage !== null && steps[steps.length - 1] !== stage) steps.push(stage);
  }
  return { latest: events[0], events, slot, todoId, steps };
}

/**
 * The feed as rows, with runs of stage beats folded. A slot reports several
 * beats per attempt (`prepare -> agent`, `agent -> gate`, …) and they buried
 * the outcome rows between them; consecutive beats of one slot on one todo
 * become one row that says the whole path and opens to the beats themselves.
 * A lone beat stays a plain row: there is nothing to fold and nothing hidden.
 */
export function foldStageRuns(events: PipelineEvent[]): ActivityRow[] {
  const rows: ActivityRow[] = [];
  let open: { slot: string; todoId: string | null; events: PipelineEvent[] } | null = null;
  const close = (): void => {
    if (open === null) return;
    const beats = open.events;
    rows.push(
      beats.length === 1
        ? { event: beats[0], run: null }
        : { event: beats[0], run: stageRun(open.slot, open.todoId, beats) }
    );
    open = null;
  };
  for (const event of events) {
    const slot = event.kind === WORKER_STAGE_KIND ? stageSlot(event) : null;
    if (slot === null) {
      close();
      rows.push({ event, run: null });
      continue;
    }
    if (open !== null && open.slot === slot && open.todoId === event.todo_id) {
      open.events.push(event);
      continue;
    }
    close();
    open = { slot, todoId: event.todo_id, events: [event] };
  }
  close();
  return rows;
}

/** One step of the ladder a folded run draws. */
export interface StageStep {
  stage: string;
  /** The run reported this stage. */
  walked: boolean;
  /** Where the slot is now: the newest beat's stage. */
  current: boolean;
}

/**
 * The whole ladder, so the row reads the same whichever stage a run is on:
 * the four stages of an attempt, plus any stage this build does not know in
 * the order the run walked it — a stage is never dropped for being unknown.
 */
export function stageSteps(run: StageRun): StageStep[] {
  const walked = new Set(run.steps);
  const extra = run.steps.filter((stage) => !isStage(stage));
  const ladder = [...WORKER_STAGES, ...new Set(extra)];
  const current = run.steps[run.steps.length - 1] ?? null;
  return ladder.map((stage) => ({ stage, walked: walked.has(stage), current: stage === current }));
}

/** The run in one line, for the row's `title`: how many beats, and the path. */
export function stageRunTitle(run: StageRun): string {
  const beats = `${run.events.length} stage event${run.events.length === 1 ? '' : 's'}`;
  return run.steps.length === 0 ? beats : `${beats}: ${run.steps.join(' → ')}`;
}

/** The rows' seqs, in order: what a keyboard walks and an arrival is keyed by. */
export function rowSeqs(rows: ActivityRow[]): number[] {
  return rows.map((row) => row.event.seq);
}

export interface RowDayGroup {
  day: string;
  rows: ActivityRow[];
}

/** The rows split into runs of one day, the same way `groupByDay` splits events. */
export function groupRowsByDay(rows: ActivityRow[]): RowDayGroup[] {
  const groups: RowDayGroup[] = [];
  for (const row of rows) {
    const day = localDayKey(row.event.ts);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else groups.push({ day, rows: [row] });
  }
  return groups;
}
