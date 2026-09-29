// needsYouModel.ts — pure helpers for the "Needs you" page and its nav badge.

import type { AttentionItem, AttentionResponse, AttentionSeverity } from '../../api/types';

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
          (a.since ?? '￿').localeCompare(b.since ?? '￿') || a.id.localeCompare(b.id)
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
  pr_changes_requested: 'Changes requested',
  pr_checks_failing: 'Checks failing',
  pr_awaiting_approval: 'Awaiting approval',
  pr_ready_to_merge: 'Ready to merge',
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

export type PrimaryAction =
  | { type: 'command'; label: string; command: string; where: string | null }
  | { type: 'link'; label: string; to: string }
  | null;

/**
 * Exactly one thing to do per row: the copyable command when the act happens
 * off-site, else the link to where to act.
 */
export function primaryAction(item: AttentionItem): PrimaryAction {
  const label = item.action?.label || 'Open';
  if (item.action?.command) {
    return { type: 'command', label, command: item.action.command, where: commandPlace(item) };
  }
  const to = safeHref(item.href);
  return to ? { type: 'link', label, to } : null;
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
 * "Needs you": todos and shifts on Work, pull requests and their queue on Pull
 * requests, staging, deploys and pins on Releases, gate runners and workers
 * under System. A kind with no home stays on Needs you only.
 */
export type AttentionArea = 'work' | 'pulls' | 'releases' | 'system';

export const AREA_LABEL: Record<AttentionArea, string> = {
  work: 'Work',
  pulls: 'Pull requests',
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
