// needsYouModel.ts — pure helpers for the "Needs you" page and its nav badge.

import type { AttentionItem, AttentionResponse, AttentionSeverity } from '../../api/types';
import { compareInstants } from '../../format/when';

/** Where "what needs a human" lives; every other surface links here. */
export const NEEDS_YOU_PATH = '/needs-you';

export const SEVERITIES: readonly AttentionSeverity[] = ['critical', 'action', 'watch'];

export const SEVERITY_LABEL: Record<AttentionSeverity, string> = {
  critical: 'Broken — the pipeline is stuck',
  action: 'Waiting on you',
  watch: 'Worth a look',
};

export interface AttentionGroup {
  severity: AttentionSeverity;
  label: string;
  items: AttentionItem[];
}

/**
 * One subject with everything the pipeline says about it: the pull request,
 * the todo or the shift a reader thinks of as "the thing that is stuck". The
 * same cause often raises several items at once — a review hold leaves changes
 * requested, a reviewer that could not finish and a queue entry that failed —
 * and three red rows with three different acts for one pull request read as
 * three problems. They are one row here.
 */
export interface AttentionSubject {
  key: string;
  /** The item whose act is offered; see `KIND_PRECEDENCE`. */
  primary: AttentionItem;
  /** The rest of the subject's items, in the same precedence, as context. */
  also: AttentionItem[];
  /** The worst severity among the subject's items. */
  severity: AttentionSeverity;
  /** The oldest `since` among them: how long the subject has been waiting. */
  since: string | null;
}

export interface SubjectGroup {
  severity: AttentionSeverity;
  label: string;
  subjects: AttentionSubject[];
}

/**
 * What a row is about, so that every item raised by one cause lands on one
 * row: a pull request, else the todo, else the shift. An item that names none
 * of those is its own subject — its id never collides with another item's.
 */
export function subjectKey(
  item: Pick<AttentionItem, 'id' | 'repo' | 'pr' | 'family' | 'todo_id' | 'shift'>
): string {
  const repo = item.repo?.trim();
  if (repo && item.pr) return `pr:${repo}#${item.pr}`;
  const todo = item.todo_id?.trim();
  if (todo) return `todo:${familyName(item.family) ?? ''}:${todo}`;
  const shift = item.shift?.trim();
  if (shift) return `shift:${familyName(item.family) ?? ''}:${shift}`;
  return `item:${item.id}`;
}

/**
 * Which of a subject's items names the act to offer, most first. The order is
 * fixed rather than derived from severity, so one cause always resolves to the
 * same act whatever else it happened to raise.
 *
 * It reads from the act that unsticks the subject to the act that only follows
 * from it: a review that could not be finished comes before the changes it
 * left requested (nobody can push a fix for a judgement not yet made), and a
 * failed gate or queue entry comes before waiting on an approval that gate
 * would have to pass anyway. A kind this list does not name sorts last, in
 * severity order, so a new kind is context next to a known act rather than
 * silently taking it over.
 */
export const KIND_PRECEDENCE: readonly string[] = [
  'reviewer_stuck',
  'pr_changes_requested',
  'queue_refused',
  'queue_failed',
  'queue_stuck',
  'pr_checks_failing',
  'pr_draft_waiting',
  'pr_awaiting_approval',
  'pr_ready_to_merge',
  'todo_blocked',
  'todo_handoff',
  'todo_stuck_claim',
  'todo_waiting_on_blocker',
  'todo_untriaged',
  'todo_parked',
  'shift_stranded_work',
  'shift_without_pr',
  'shift_budget_spent',
  'release_stage_failed',
  'deploy_failed',
  'release_staged',
  'pin_behind',
  'mirror_failing',
  'mirror_diverged',
  'gate_runner_down',
  'workers_down',
];

/** A kind's place in `KIND_PRECEDENCE`; an unnamed kind sorts after them all. */
export function kindRank(kind: string): number {
  const at = KIND_PRECEDENCE.indexOf(kind);
  return at === -1 ? KIND_PRECEDENCE.length : at;
}

function severityRank(item: Pick<AttentionItem, 'severity'>): number {
  return SEVERITIES.indexOf(severityOf(item));
}

/** The precedence a subject's items are ordered by: its first item acts. */
function byPrecedence(a: AttentionItem, b: AttentionItem): number {
  return (
    kindRank(a.kind) - kindRank(b.kind) ||
    severityRank(a) - severityRank(b) ||
    compareInstants(a.since, b.since) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * One row per subject, worst severity first and longest-waiting first within a
 * severity. Order among equals is the subject key, so a reload never shuffles
 * the list.
 */
export function attentionSubjects(items: AttentionItem[]): AttentionSubject[] {
  const bySubject = new Map<string, AttentionItem[]>();
  for (const item of items) {
    const key = subjectKey(item);
    const group = bySubject.get(key);
    if (group) group.push(item);
    else bySubject.set(key, [item]);
  }
  return [...bySubject]
    .map(([key, group]) => {
      const [primary, ...also] = [...group].sort(byPrecedence);
      const dated = group.map((item) => item.since).filter((since): since is string => !!since);
      return {
        key,
        primary,
        also,
        severity: SEVERITIES[Math.min(...group.map(severityRank))],
        since: dated.length > 0 ? [...dated].sort(compareInstants)[0] : null,
      };
    })
    .sort(
      (a, b) =>
        SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
        compareInstants(a.since, b.since) ||
        a.key.localeCompare(b.key)
    );
}

/** `groupAttention`, by subject: critical, then action, then watch. */
export function groupSubjects(items: AttentionItem[]): SubjectGroup[] {
  const subjects = attentionSubjects(items);
  return SEVERITIES.map((severity) => ({
    severity,
    label: SEVERITY_LABEL[severity],
    subjects: subjects.filter((subject) => subject.severity === severity),
  })).filter((group) => group.subjects.length > 0);
}

/**
 * One of a subject's other items, as the one line a row shows under its act:
 * what it is, what it would have asked for, and where to go for it.
 */
export function alsoLine(item: AttentionItem): { label: string; detail: string; to: string | null } {
  return {
    label: kindLabel(item.kind),
    detail: rowDetail(item)?.text ?? item.title,
    to: safeHref(item.href),
  };
}

/** An unknown severity is shown, not dropped: it lands under `watch`. */
export function severityOf(item: Pick<AttentionItem, 'severity'>): AttentionSeverity {
  return (SEVERITIES as readonly string[]).includes(item.severity)
    ? (item.severity as AttentionSeverity)
    : 'watch';
}

/** Critical, then action, then watch; oldest first inside a group; empty groups dropped. */
export function groupAttention(items: AttentionItem[]): AttentionGroup[] {
  return SEVERITIES.map((severity) => ({
    severity,
    label: SEVERITY_LABEL[severity],
    items: items
      .filter((item) => severityOf(item) === severity)
      .sort(
        (a, b) =>
          compareInstants(a.since, b.since) || a.id.localeCompare(b.id)
      ),
  })).filter((group) => group.items.length > 0);
}

/**
 * Red is reserved for rows where a person is the next step (critical, action).
 * `watch` rows may heal on their own, so they stay neutral.
 */
export function severityTone(severity: AttentionSeverity): 'danger' | 'neutral' {
  return severity === 'watch' ? 'neutral' : 'danger';
}

/**
 * The nav badge: critical + action. Counts come from the items when the
 * server's `counts` is missing or malformed.
 */
export function attentionBadgeCount(data: AttentionResponse | undefined): number {
  if (!data) return 0;
  const { counts } = data;
  if (counts && Number.isFinite(counts.critical) && Number.isFinite(counts.action)) {
    return Math.max(0, counts.critical) + Math.max(0, counts.action);
  }
  return (data.items ?? []).filter((item) => severityOf(item) !== 'watch').length;
}

const KIND_LABEL: Record<string, string> = {
  todo_blocked: 'Blocked todo',
  todo_handoff: 'Todo handed to you',
  todo_stuck_claim: 'Stuck claim',
  todo_untriaged: 'Todo to triage',
  todo_waiting_on_blocker: 'Waiting on another todo',
  shift_without_pr: 'Shift has no review PR',
  shift_budget_spent: 'Shift budget spent',
  pr_changes_requested: 'Changes requested',
  pr_checks_failing: 'Checks failing',
  pr_awaiting_approval: 'Awaiting approval',
  pr_ready_to_merge: 'Ready to merge',
  pr_draft_waiting: 'Draft waiting to be marked ready',
  queue_failed: 'Merge queue failed',
  reviewer_stuck: 'Reviewer stuck',
  gate_runner_down: 'Gate runners down',
  workers_down: 'Workers down',
  release_staged: 'Release ready to deploy',
  release_stage_failed: 'Release staging failed',
  deploy_failed: 'Deploy failed',
  pin_behind: 'Merged, not pinned for release',
};

/** A plain-language label; an unknown kind reads as a sentence, never raw. */
export function kindLabel(kind: string): string {
  const known = KIND_LABEL[kind];
  if (known) return known;
  const words = kind.replace(/[_.]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Needs attention';
}

/** "Blocked todo · jeryu · jeryu/jeryu-web#35" — the muted half of the title line. */
export function attentionContext(item: AttentionItem): string {
  const where = item.repo ? `${item.repo}${item.pr ? `#${item.pr}` : ''}` : '';
  return [kindLabel(item.kind), item.family ?? '', where].filter(Boolean).join(' · ');
}

export type ApiMethod = 'POST' | 'DELETE';

export type PrimaryAction =
  | {
      type: 'api';
      label: string;
      method: ApiMethod;
      path: string;
      body: unknown;
      confirm: string;
    }
  | { type: 'command'; label: string; command: string; where: string | null }
  | { type: 'link'; label: string; to: string }
  | null;

/**
 * Exactly one thing to do per row: the call the forge can make for you, else
 * the copyable command when the act happens off-site, else the link to where
 * to act. A row's title links to `href` either way, so a row whose act is a
 * button still leads to its subject.
 */
export function primaryAction(item: AttentionItem): PrimaryAction {
  const label = item.action?.label || 'Open';
  const api = item.action?.api;
  const path = safeApiPath(api?.path);
  const method = api ? apiMethod(api.method) : null;
  if (api && path && method) {
    return {
      type: 'api',
      label,
      method,
      path,
      body: api.body,
      confirm: api.confirm?.trim() || `${label} now? The forge acts straight away.`,
    };
  }
  if (item.action?.command) {
    return { type: 'command', label, command: item.action.command, where: commandPlace(item) };
  }
  const to = safeHref(item.href);
  return to ? { type: 'link', label, to } : null;
}

/**
 * Only a same-origin v1 API path is called, and only `POST` or `DELETE`:
 * anything else is not an act this page knows how to make, so the row falls
 * back to its command or its link rather than offering a button that lies.
 */
export function safeApiPath(path: string | null | undefined): string | null {
  const trimmed = (path ?? '').trim();
  return trimmed.startsWith('/api/') && !trimmed.startsWith('//') ? trimmed : null;
}

export function apiMethod(method: string | null | undefined): ApiMethod | null {
  const name = (method ?? 'POST').trim().toUpperCase();
  if (name === '' || name === 'POST') return 'POST';
  return name === 'DELETE' ? 'DELETE' : null;
}

/**
 * The row's second line: the server's one-sentence next step when it sends
 * one, else the reason. The reason stays the tooltip either way, since it is
 * often the longer of the two.
 */
export function rowDetail(
  item: Pick<AttentionItem, 'next_step' | 'reason'>
): { text: string; title: string } | null {
  const step = (item.next_step ?? '').trim();
  const reason = (item.reason ?? '').trim();
  const text = step || reason;
  return text ? { text, title: reason || text } : null;
}

/**
 * Where a row's command is run, as one short line shown above it. The server
 * names the machine and directory (`action.run_in`); one that predates the
 * field leaves the item's repository as the only hint, and with neither there
 * is nothing true to say.
 */
export function commandPlace(item: Pick<AttentionItem, 'action' | 'repo'>): string | null {
  const runIn = item.action?.run_in?.trim();
  if (runIn) return `Run on ${runIn}`;
  const repo = item.repo?.trim();
  return repo ? `Run in a checkout of ${repo}` : null;
}

export interface SystemPulseInput {
  workers?: Array<{ healthy: boolean; state: string; slot: string }>;
  runners?: { onlineRunners: number; busyRunners: number };
  lastEvent?: { ts: string; summary: string };
}

/**
 * One calm line about what the system is doing, so "nothing needs you" reads
 * as alive rather than broken. Parts with no data are left out.
 */
export function systemPulse(input: SystemPulseInput, ago: (iso: string) => string): string {
  const parts: string[] = [];
  if (input.workers) {
    const slots = input.workers.filter((w) => w.healthy && w.slot !== 'supervisor');
    const busy = slots.filter((w) => w.state === 'working').length;
    parts.push(`${busy} of ${slots.length} worker slot${slots.length === 1 ? '' : 's'} busy`);
  }
  if (input.runners) {
    parts.push(`${input.runners.busyRunners} of ${input.runners.onlineRunners} gate runners busy`);
  }
  if (input.lastEvent) {
    parts.push(`last event ${ago(input.lastEvent.ts)}: ${input.lastEvent.summary}`);
  }
  return parts.join(' · ');
}

/** Only same-origin app paths are followed; anything else is not a link. */
export function safeHref(href: string | null | undefined): string | null {
  return href && href.startsWith('/') && !href.startsWith('//') ? href : null;
}

/**
 * The todo a row is about, when it is about one: what "Acknowledge until…"
 * writes to. Rows about a pull request, a release or the runners name no todo,
 * so they are not acknowledged from here.
 */
export function acknowledgeTarget(
  item: Pick<AttentionItem, 'family' | 'todo_id'>
): { family: string; id: string } | null {
  const family = (item.family ?? '').trim();
  const id = (item.todo_id ?? '').trim();
  return family && id ? { family, id } : null;
}

export function findAttention(
  data: AttentionResponse | undefined,
  kind: string
): AttentionItem | undefined {
  return data?.items?.find((item) => item.kind === kind);
}

/** Items no family owns: the forge itself (a staged release, the mirror). */
export const FORGE_FAMILY = 'forge';

/** `jeryu-split` and `jeryu` are one family to a reader. */
export function familyName(name: string | null | undefined): string | null {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed.replace(/-split$/, '') : null;
}

/**
 * The family an item belongs to: what the server says, else the family of its
 * repository (`owner/name` looked up in `repoFamilies`), else the forge.
 */
export function familyOf(
  item: Pick<AttentionItem, 'family' | 'repo'>,
  repoFamilies: ReadonlyMap<string, string>
): string {
  return (
    familyName(item.family) ??
    familyName(item.repo ? repoFamilies.get(item.repo) : null) ??
    FORGE_FAMILY
  );
}

export interface FamilyCount {
  family: string;
  count: number;
}

/** Families with something waiting, busiest first, the forge last. */
export function familyCounts(
  items: Pick<AttentionItem, 'family' | 'repo'>[],
  repoFamilies: ReadonlyMap<string, string>
): FamilyCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const family = familyOf(item, repoFamilies);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return [...counts]
    .map(([family, count]) => ({ family, count }))
    .sort(
      (a, b) =>
        Number(a.family === FORGE_FAMILY) - Number(b.family === FORGE_FAMILY) ||
        b.count - a.count ||
        a.family.localeCompare(b.family)
    );
}

/** Keep one family's items; an empty filter keeps everything. */
export function filterByFamily<T extends Pick<AttentionItem, 'family' | 'repo'>>(
  items: T[],
  family: string,
  repoFamilies: ReadonlyMap<string, string>
): T[] {
  return family ? items.filter((item) => familyOf(item, repoFamilies) === family) : items;
}

/**
 * The page where a row's cause lives, so each page can show its own share of
 * "Needs you": todos and shifts on Work, pull requests and their queue on In
 * flight, staging, deploys and pins on Releases, gate runners and workers
 * under System. A kind with no home stays on Needs you only.
 */
export type AttentionArea = 'work' | 'pulls' | 'releases' | 'system';

export const AREA_LABEL: Record<AttentionArea, string> = {
  work: 'Work',
  pulls: 'In flight',
  releases: 'Releases',
  system: 'Runners',
};

const AREA_BY_PREFIX: ReadonlyArray<readonly [string, AttentionArea]> = [
  ['todo_', 'work'],
  ['shift_', 'work'],
  ['pr_', 'pulls'],
  ['queue_', 'pulls'],
  ['reviewer_', 'pulls'],
  ['release_', 'releases'],
  ['deploy_', 'releases'],
  ['pin_', 'releases'],
  ['gate_runner', 'system'],
  ['workers_', 'system'],
];

export function attentionArea(kind: string): AttentionArea | null {
  const hit = AREA_BY_PREFIX.find(([prefix]) => kind.startsWith(prefix));
  return hit ? hit[1] : null;
}

/** The rows waiting on a person (critical, then action) whose cause lives in `area`. */
export function urgentInArea(
  data: AttentionResponse | undefined,
  area: AttentionArea
): AttentionItem[] {
  const items = (data?.items ?? []).filter(
    (item) => severityOf(item) !== 'watch' && attentionArea(item.kind) === area
  );
  return groupAttention(items).flatMap((group) => group.items);
}

/** The nav badge for one page: its critical + action rows. */
export function areaBadgeCount(data: AttentionResponse | undefined, area: AttentionArea): number {
  return urgentInArea(data, area).length;
}

/**
 * What a page's own Needs-you strip is about: one todo, or one repository's
 * pull request. This is the question a page asks; `AttentionSubject` is the
 * answer — one row with every item that one cause raised.
 */
export interface AboutSubject {
  todoId?: string | null;
  repo?: string | null;
  pr?: number | string | null;
}

/**
 * The rows waiting on a person about one subject, so a todo page or a pull
 * request page can show its own row in place rather than sending the reader to
 * Needs you to find out that something waits on them here. A subject with
 * nothing to match on matches nothing: a page never shows the whole list.
 *
 * Grouped per subject like every other surface, so a pull request whose
 * review hold also failed its queue entry reads as one row here too.
 */
export function attentionAbout(
  data: AttentionResponse | undefined,
  about: AboutSubject
): AttentionSubject[] {
  const todoId = (about.todoId ?? '').trim();
  const pr = about.pr === null || about.pr === undefined ? '' : String(about.pr).trim();
  const repo = (about.repo ?? '').trim();
  if (!todoId && !pr) return [];
  return attentionSubjects(
    urgentAttention(data).filter((item) => {
      if (todoId && item.todo_id === todoId) return true;
      if (!pr || String(item.pr ?? '') !== pr) return false;
      return !repo || !item.repo || sameAttentionRepo(item.repo, repo);
    })
  );
}

/** A row may name `owner/name` where the page knows only `name`, or the reverse. */
function sameAttentionRepo(named: string, wanted: string): boolean {
  if (named === wanted) return true;
  const bare = (repo: string): string => repo.split('/').pop() ?? repo;
  return bare(named) === bare(wanted);
}

/** A link to Needs you, kept on one family when the caller is on one. */
export function needsYouHref(family?: string | null): string {
  const name = familyName(family);
  return name ? `${NEEDS_YOU_PATH}?family=${encodeURIComponent(name)}` : NEEDS_YOU_PATH;
}

/**
 * The rows Needs you shows in red: a person is the next step. This is the one
 * derivation of that set — other surfaces read it rather than deciding for
 * themselves which of their own rows wait on someone.
 */
export function urgentAttention(data: AttentionResponse | undefined): AttentionItem[] {
  return (data?.items ?? []).filter((item) => severityOf(item) !== 'watch');
}

/** `owner/name` → family, as the repository list reports it. */
export function repoFamilyMap(
  repositories: readonly { id: { owner: string; name: string }; family?: string | null }[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const repo of repositories) {
    if (repo.family) map.set(`${repo.id.owner}/${repo.id.name}`, repo.family);
  }
  return map;
}
