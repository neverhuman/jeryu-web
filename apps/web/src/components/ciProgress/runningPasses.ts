// runningPasses.ts — which repositories a gate slot is working on right now.
//
// The runners snapshot already says, per gate slot, which repository and pull
// request it is gating, since when, and what such a pass usually takes. Pages
// that list repositories read it from here rather than asking the forge again.

import { createContext } from 'react';

import type { RunnerFabricResponse, RunnerTaskEstimate } from '../../api/types';

export interface RunningPass {
  runnerId: string;
  /** `owner/name#12`: the runner's own name for its work. */
  label: string;
  startedAt: string;
  estimate: RunnerTaskEstimate | null;
}

/**
 * The running gate pass per `owner/name`. With several on one repository the
 * one started last wins: it is the furthest from done.
 */
export function runningPassesByRepo(
  fabric: RunnerFabricResponse | undefined
): ReadonlyMap<string, RunningPass> {
  const passes = new Map<string, RunningPass>();
  for (const node of fabric?.local.nodeDetails ?? []) {
    if (node.kind !== 'gate' || node.state === 'offline') continue;
    for (const task of node.activeTasks) {
      if (!task.repo || !task.startedAt) continue;
      const seen = passes.get(task.repo);
      if (seen && Date.parse(seen.startedAt) >= Date.parse(task.startedAt)) continue;
      passes.set(task.repo, {
        runnerId: node.runnerId,
        label: task.label,
        startedAt: task.startedAt,
        estimate: task.estimate ?? null,
      });
    }
  }
  return passes;
}

export interface RunningPassesValue {
  passes: ReadonlyMap<string, RunningPass>;
  /** The forge's "now" (see useServerNow). */
  nowMs: number;
}

export const RunningPassesContext = createContext<RunningPassesValue>({
  passes: new Map(),
  nowMs: 0,
});
