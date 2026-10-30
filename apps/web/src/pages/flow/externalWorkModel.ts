import type { ExternalPlanTask, ExternalWorkSnapshot } from '../../api/types';
import { sameFamily } from '../../components/family/familyScope';

export const EXTERNAL_STATE_LABELS: Record<string, string> = {
  planned: 'Planned', in_progress: 'In progress', review: 'Review', needs_human: 'Needs human',
  waiting_dependency: 'Waiting on prerequisites', blocked: 'Blocked', merged: 'Merged',
  closed: 'Closed', contained: 'On main', changed_after_merge: 'Changed after merge',
  unreviewed: 'Branch without a pull request', unknown: 'Unknown',
};

export function scopedExternalWork(snapshots: ExternalWorkSnapshot[], family: string, repo = 'all'): ExternalWorkSnapshot[] {
  return snapshots.filter((snapshot) => (!family || sameFamily(snapshot.family, family)) &&
    (repo === 'all' || snapshot.source_repo.toLowerCase() === repo.toLowerCase()));
}

/** Parent/follow-up order within one wave. Missing parents never hide a row. */
export function orderedPlanTasks(tasks: ExternalPlanTask[]): { task: ExternalPlanTask; depth: number }[] {
  const sorted = [...tasks].sort((a, b) => a.priority_rank - b.priority_rank || a.task_id.localeCompare(b.task_id));
  const ids = new Set(tasks.map((task) => task.todo_id));
  const seen = new Set<string>();
  const result: { task: ExternalPlanTask; depth: number }[] = [];
  const visit = (task: ExternalPlanTask, depth: number): void => {
    if (seen.has(task.todo_id)) return;
    seen.add(task.todo_id); result.push({ task, depth });
    sorted.filter((child) => child.parent_id === task.todo_id).forEach((child) => visit(child, depth + 1));
  };
  sorted.filter((task) => !task.parent_id || !ids.has(task.parent_id)).forEach((task) => visit(task, 0));
  sorted.forEach((task) => visit(task, 0));
  return result;
}

export function currentExternalBranches(snapshot: ExternalWorkSnapshot) {
  // A squashed pull request can be merged while its branch still compares ahead.
  return snapshot.branches.filter((branch) => !['merged', 'closed', 'contained'].includes(branch.state));
}

export function snapshotIsStale(at: string, now = Date.now()): boolean {
  const stamp = Date.parse(at);
  return !Number.isFinite(stamp) || now - stamp > 15 * 60_000;
}
