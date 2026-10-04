// workTraceModel.ts — the work trace: where one piece of work stands on the
// twelve stages between "someone filed it" and "production runs it".
//
// One derivation, two readers. A todo knows its own queue half (filed through
// committed) and whatever the pipeline visibility contract tells it about its
// PR; a pull request knows its review half (checks through merged) and the
// todos it carries. Both hand their facts here so the rail on `/work/<id>` and
// the rail on a PR page cannot disagree about the same change.
//
// A stage reached implies every stage before it: a server that never sent
// `triaged` for a merged todo still shows Merged, not a rail stuck at Filed.
// Exactly one stage is current — where the work stands now — so the rail reads
// as a position rather than a checklist.

import type { ShiftTodo } from '../../api/types';

export type WorkStageKey =
  | 'filed'
  | 'triaged'
  | 'claimed'
  | 'worked'
  | 'finished'
  | 'committed'
  | 'pr'
  | 'checks'
  | 'reviewed'
  | 'queued'
  | 'merged'
  | 'released';

export const WORK_STAGES: readonly { key: WorkStageKey; label: string }[] = [
  { key: 'filed', label: 'Filed' },
  { key: 'triaged', label: 'Triaged' },
  { key: 'claimed', label: 'Claimed' },
  { key: 'worked', label: 'Worked' },
  { key: 'finished', label: 'Done' },
  { key: 'committed', label: 'Committed' },
  { key: 'pr', label: 'PR' },
  { key: 'checks', label: 'Checks' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'queued', label: 'Merge queue' },
  { key: 'merged', label: 'Merged' },
  { key: 'released', label: 'Released' },
];

export type WorkStageState = 'done' | 'current' | 'pending';

export interface WorkStage {
  key: WorkStageKey;
  label: string;
  state: WorkStageState;
  /** True on the current stage when a person is the next step there. */
  needsHuman: boolean;
}

/**
 * Which stages a piece of work has reached. Every stage is optional: a fact
 * nobody reported is not a fact that the stage was missed, and the furthest
 * reported stage decides the position either way.
 */
export type WorkTraceFacts = {
  [K in WorkStageKey]?: boolean;
} & {
  /** A person is the next step (a blocked todo, a failed queue entry). */
  needsHuman?: boolean;
};

/** How many stages the work has reached, 1 (Filed) through 12 (Released). */
export function stagesReached(facts: WorkTraceFacts): number {
  let reached = 1; // The work exists, so it was filed.
  WORK_STAGES.forEach((stage, index) => {
    if (facts[stage.key]) reached = Math.max(reached, index + 1);
  });
  return reached;
}

/** The twelve stages, with the furthest one reached as the only current one. */
export function workTrace(facts: WorkTraceFacts): WorkStage[] {
  const reached = stagesReached(facts);
  return WORK_STAGES.map((stage, index) => ({
    key: stage.key,
    label: stage.label,
    state: index < reached - 1 ? 'done' : index === reached - 1 ? 'current' : 'pending',
    needsHuman: index === reached - 1 && facts.needsHuman === true,
  }));
}

export function currentStage(stages: WorkStage[]): WorkStage | null {
  return stages.find((stage) => stage.state === 'current') ?? null;
}

/** "stage 4 of 12: Worked" — the rail's accessible position, in one phrase. */
export function workTraceSummary(stages: WorkStage[]): string {
  const current = currentStage(stages);
  if (!current) return 'no stage reached';
  const at = stages.indexOf(current) + 1;
  const waiting = current.needsHuman ? ', waiting on a person' : '';
  return `stage ${at} of ${stages.length}: ${current.label}${waiting}`;
}

/** What a todo's own fields say about its stages. */
export function todoFacts(todo: ShiftTodo): WorkTraceFacts {
  const finished = todo.status === 'done';
  const merged = todo.merged || todo.pr?.state === 'merged';
  return {
    filed: true,
    triaged: todo.triaged,
    claimed:
      todo.claim_by !== null || todo.status === 'claimed' || todo.attempts > 0 || finished,
    worked: todo.attempts > 0 || todo.worked_by.length > 0,
    finished,
    committed: Object.keys(todo.commits).length > 0,
    pr: Boolean(todo.pr) || merged,
    merged,
    released: todo.released === true,
    needsHuman: todo.status === 'blocked' || todo.status === 'handoff',
  };
}

/** The review half, as a pull request's posture reports it. */
export interface PullTraceInput {
  state: string;
  draft: boolean;
  checks: { total: number; passing: number; failing: number; pending: number };
  review: { required_approvals: number; approvals: number; changes_requested: number };
  /** True when the pull request has a merge queue entry, past or present. */
  inQueue?: boolean;
  /** True when that entry failed or left the queue: the queue stopped here. */
  queueFailed?: boolean;
  /** The todos the pull request carries, when the queue is readable. */
  carries?: ShiftTodo[];
}

/**
 * A pull request stands where its own posture puts it, never earlier than the
 * todos it carries: the work was filed, claimed and committed before the PR
 * existed, and it is released only once every todo on it is.
 */
export function pullFacts(pull: PullTraceInput): WorkTraceFacts {
  const merged = pull.state === 'merged';
  const carried = pull.carries ?? [];
  const checks =
    pull.checks.total > 0 && pull.checks.failing === 0 && pull.checks.pending === 0;
  const approved =
    pull.review.changes_requested === 0 &&
    pull.review.approvals >= Math.max(1, pull.review.required_approvals);
  return {
    filed: true,
    triaged: true,
    claimed: true,
    worked: true,
    finished: true,
    committed: true,
    pr: true,
    checks: checks || merged,
    reviewed: approved || merged,
    queued: pull.inQueue === true || pull.queueFailed === true || merged,
    merged,
    released: carried.length > 0 && carried.every((todo) => todo.released === true),
    needsHuman:
      pull.review.changes_requested > 0 ||
      pull.checks.failing > 0 ||
      pull.queueFailed === true ||
      (pull.draft && pull.state === 'open'),
  };
}
