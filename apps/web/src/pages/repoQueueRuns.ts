// repoQueueRuns.ts — the queue's runs on one repository.
//
// A queue run is not an agent run: it never appears under
// `/repos/{id}/agent-runs`. It is an attempt recorded on a queue todo, and a
// todo names the repositories it touches. Flattening the attempts of the todos
// that name this repository gives the Agents page the work the operator
// actually has running here.

import type { ShiftTodo } from '../api/types';

/** One worker attempt on a queue todo that touches this repository. */
export interface RepoQueueRun {
  /** Stable row key: todo id plus the attempt's position on it. */
  key: string;
  todoId: string;
  family: string;
  title: string;
  /** Host and slot the worker ran in, e.g. `xbabe2 · w3`. */
  worker: string;
  model: string;
  started: string;
  /** Absent while the attempt is still running. */
  ended: string | null;
  /** The attempt's outcome, or `running` while it has not ended. */
  outcome: string;
  running: boolean;
}

/**
 * Attempts on `repo`, newest first. Todos name repositories bare
 * (`jeryu-web`), so an `owner/name` is reduced to its name — the same
 * reduction `repoWorkHref` makes.
 */
export function repoQueueRuns(todos: ShiftTodo[], repo: string): RepoQueueRun[] {
  const name = repo.split('/').pop() ?? repo;
  const runs: RepoQueueRun[] = [];
  for (const todo of todos) {
    if (!todo.repos.includes(name)) continue;
    todo.worked_by.forEach((attempt, index) => {
      const running = !attempt.ended;
      runs.push({
        key: `${todo.id}#${index}`,
        todoId: todo.id,
        family: todo.family,
        title: todo.title || todo.id,
        worker: `${attempt.host} · ${attempt.slot}`,
        model: attempt.model,
        started: attempt.started,
        ended: attempt.ended,
        outcome: running ? 'running' : attempt.outcome,
        running,
      });
    });
  }
  return runs.sort((a, b) => b.started.localeCompare(a.started));
}
