// workersModel.ts — what the Workers tab shows by default, and how a lane is named.
//
// A supervisor slot starts and stops workers; it never carries a todo, so its
// rows and lanes say nothing about work. They fold away until asked for. Lane
// labels lead with the family, because "alton@xbabe0/w1" three times over tells
// nobody which queue a lane belongs to.

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
