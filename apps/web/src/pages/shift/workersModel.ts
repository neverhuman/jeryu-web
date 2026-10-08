// workersModel.ts — what the opened workers block shows by default, how a lane
// is named, and what an external worker pool reads as.
//
// A supervisor slot starts and stops workers; it never carries a todo, so its
// rows and lanes say nothing about work. They fold away until asked for. Lane
// labels lead with the family, because "operator@node-0/w1" three times over tells
// nobody which queue a lane belongs to.
//
// A pool slot (`kind: 'pool'`) is one member of a fleet the forge does not run:
// an account, a container, a browser profile. It is not a queue slot — it holds
// several jobs at once and it can be unavailable for a reason of its own — so
// it is counted and shown on its own, per family, beside the queue's slots.

import { sameFamily } from '../../components/family/familyScope';
import { familyName } from '../needsYou/needsYouModel';

const SUPERVISOR_SLOT = 'supervisor';

export function isSupervisor(entry: { slot: string }): boolean {
  return entry.slot === SUPERVISOR_SLOT;
}

export function splitSupervisors<T extends { slot: string }>(
  entries: readonly T[]
): { workers: T[]; supervisors: T[] } {
  return {
    workers: entries.filter((entry) => !isSupervisor(entry)),
    supervisors: entries.filter(isSupervisor),
  };
}

/**
 * `family · slot`, adding the host only when the lanes span more than one
 * machine (on a single host it is the same word on every line).
 */
export function laneLabel(
  entry: { family: string; slot: string; host: string },
  manyHosts: boolean
): string {
  const base = `${entry.family || 'unknown'} · ${entry.slot}`;
  return manyHosts && entry.host ? `${base} @${entry.host}` : base;
}

export function spansManyHosts(entries: ReadonlyArray<{ host: string }>): boolean {
  return new Set(entries.map((entry) => entry.host).filter(Boolean)).size > 1;
}

// ------------------------------------------------------------ slot filter

/** What the workers panel is narrowed to: `?family=` and `?host=` on /work. */
export interface SlotFilter {
  /** '' is every family. */
  family: string;
  /** Empty is every host. */
  hosts: readonly string[];
}

export function hasSlotFilter(filter: SlotFilter): boolean {
  return Boolean(filter.family) || filter.hosts.length > 0;
}

/**
 * The slots a filter keeps: a family (either spelling of its key) and a set of
 * hosts, as the release board links to them. An empty filter keeps them all.
 */
export function filterSlots<T extends { family: string; host: string }>(
  entries: readonly T[],
  filter: SlotFilter
): T[] {
  const hosts = new Set(filter.hosts);
  return entries.filter(
    (entry) =>
      (!filter.family || sameFamily(entry.family, filter.family)) &&
      (hosts.size === 0 || hosts.has(entry.host))
  );
}

/** `acme on node-a, node-b`: what the panel says it is showing. */
export function slotFilterText(filter: SlotFilter): string {
  const parts: string[] = [];
  if (filter.family) parts.push(filter.family);
  if (filter.hosts.length > 0) parts.push(`on ${filter.hosts.join(', ')}`);
  return parts.join(' ');
}

// ------------------------------------------------------------ worker pools

/** The parts of a heartbeat a pool is read from; a slot of any `kind` fits. */
export interface PoolSlot {
  family: string;
  slot: string;
  state: string;
  kind?: string | null;
  detail?: string | null;
  capacity?: number | null;
  active?: number | null;
}

export function isPool(entry: Pick<PoolSlot, 'kind'>): boolean {
  return entry.kind === 'pool';
}

/** The queue's own slots and the pool members, each kept in reading order. */
export function splitPools<T extends Pick<PoolSlot, 'kind'>>(
  entries: readonly T[]
): { slots: T[]; pools: T[] } {
  return {
    slots: entries.filter((entry) => !isPool(entry)),
    pools: entries.filter(isPool),
  };
}

/** A pool member whose state needs a word: the slot and the reason given. */
export interface PoolReason {
  slot: string;
  state: string;
  /** What the member reported behind its state; '' when it said nothing. */
  detail: string;
}

/** One family's pool, counted. */
export interface PoolSummary<T = PoolSlot> {
  /** The family the pool reports under, as a reader sees it. */
  family: string;
  members: T[];
  /** Members that could take work: every one that is not paused. */
  available: number;
  /** Members working now. */
  busy: number;
  /** Jobs the pool holds, summed; `null` when no member reported any. */
  active: number | null;
  /** Jobs the pool could hold, summed; `null` when no member reported any. */
  capacity: number | null;
  /** Why the members that cannot take work cannot, in slot order. */
  unavailable: PoolReason[];
  /** `acme pool: 3 of 4 available, 2 busy (5 active)`. */
  text: string;
  /** The same, one line per unavailable member; '' when all are available. */
  title: string;
}

function sumOf<T>(members: readonly T[], of: (member: T) => number | null | undefined): number | null {
  const given = members.map(of).filter((value): value is number => typeof value === 'number');
  return given.length > 0 ? given.reduce((total, value) => total + value, 0) : null;
}

/**
 * One line per family that reports a pool, busiest first. `members` keeps the
 * slots the summary was counted from, so a caller can list them under it.
 */
export function poolSummaries<T extends PoolSlot>(workers: readonly T[]): Array<PoolSummary<T>> {
  const byFamily = new Map<string, T[]>();
  for (const member of workers.filter(isPool)) {
    const family = familyName(member.family) ?? 'unknown';
    byFamily.set(family, [...(byFamily.get(family) ?? []), member]);
  }
  return [...byFamily]
    .map(([family, unsorted]) => {
      const members = [...unsorted].sort((a, b) =>
        a.slot.localeCompare(b.slot, undefined, { numeric: true })
      );
      const available = members.filter((member) => member.state !== 'paused').length;
      const busy = members.filter((member) => member.state === 'working').length;
      const active = sumOf(members, (member) => member.active);
      const unavailable = members
        .filter((member) => member.state === 'paused')
        .map((member) => ({
          slot: member.slot,
          state: member.state,
          detail: member.detail ?? '',
        }));
      const load = active === null ? '' : ` (${active} active)`;
      return {
        family,
        members,
        available,
        busy,
        active,
        capacity: sumOf(members, (member) => member.capacity),
        unavailable,
        text: `${family} pool: ${available} of ${members.length} available, ${busy} busy${load}`,
        title: unavailable
          .map((member) => `${member.slot}: ${member.state}${member.detail ? ` — ${member.detail}` : ''}`)
          .join('\n'),
      };
    })
    .sort((a, b) => b.members.length - a.members.length || a.family.localeCompare(b.family));
}
