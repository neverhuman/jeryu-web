// activityModel.ts — pure helpers for the Activity page, its wall mode, the
// live dock, and the per-PR events panel. Deterministic given `now`.

import type { PipelineEvent, PipelineEventsQuery } from '../../api/types';
import { queueHref } from '../shift/WorkTabs';

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
  if (filters.kind) query.kind = filters.kind;
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

export type EventTone = 'danger' | 'warning' | 'success' | 'info';

const BAD = new Set(['failure', 'failed', 'error', 'blocked', 'timed_out', 'request_changes', 'inputs_changed']);
const SHAKY = new Set(['retry', 'ratelimit', 'dequeued', 'pending', 'in_progress', 'queued', 'hold']);
const GOOD = new Set(['success', 'done', 'approve', 'approved', 'landed', 'merged']);

/** Red when a human is needed or something failed; green on a clean finish. */
export function eventTone(event: Pick<PipelineEvent, 'needs_human' | 'outcome'>): EventTone {
  if (event.needs_human) return 'danger';
  const outcome = (event.outcome ?? '').toLowerCase();
  if (BAD.has(outcome)) return 'danger';
  if (SHAKY.has(outcome)) return 'warning';
  if (GOOD.has(outcome)) return 'success';
  return 'info';
}

export interface EventLink {
  label: string;
  to: string;
}

/** SPA path of a forge repo given as `owner/name`. */
export function repoHref(repo: string): string {
  return `/repos/jeryu/${repo}`;
}

export function pullHref(repo: string, pr: number): string {
  return `${repoHref(repo)}/pulls/${pr}`;
}

/**
 * Where an event's join keys lead: its todo, its PR, its repo. There is no
 * commit page in the app, so a sha is shown as text and the PR link carries it.
 */
export function eventLinks(event: PipelineEvent): EventLink[] {
  const links: EventLink[] = [];
  if (event.todo_id && event.family) {
    links.push({ label: `todo ${event.todo_id}`, to: queueHref(event.family, [event.todo_id]) });
  }
  if (event.repo && event.pr) {
    links.push({ label: `${event.repo}#${event.pr}`, to: pullHref(event.repo, event.pr) });
  } else if (event.repo) {
    links.push({ label: event.repo, to: repoHref(event.repo) });
  }
  return links;
}

export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

export function formatClock(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toISOString().slice(11, 19);
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
