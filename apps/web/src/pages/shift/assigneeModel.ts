// assigneeModel.ts — which "take it on" acts a viewer is offered on a todo.
//
// Mirrors the server's rules (jeryu-deploy `web/shift/assignment.rs`): a
// person may claim a todo nobody has, hand it on if nobody has it or they do,
// and give back or finish one they hold; an admin may do all of it. The server
// also requires write access to the todo's code and refuses bots and
// automation logins, with a reason the page shows.

import type { ShiftTodo } from '../../api/types';

export interface Viewer {
  login: string;
  admin: boolean;
}

export interface AssigneeChoices {
  claim: boolean;
  assign: boolean;
  unassign: boolean;
  /** Finish it: offered here to the holder; admins have it in the main actions. */
  done: boolean;
}

export const FINISHED: ReadonlySet<string> = new Set(['done', 'closed']);

export function assigneeChoices(
  todo: Pick<ShiftTodo, 'assignee' | 'status' | 'lease_live'>,
  viewer: Viewer | null
): AssigneeChoices {
  const none = { claim: false, assign: false, unassign: false, done: false };
  if (!viewer || FINISHED.has(todo.status)) return none;
  const holder = todo.assignee ?? '';
  const holds = holder !== '' && holder === viewer.login;
  const free = holder === '';
  // A worker running it now has it; taking it would put two on the work.
  const workerHasIt = todo.lease_live;
  // An administrator parked it on purpose; taking it on is theirs to undo.
  const parkedForAdmin = todo.status === 'parked' && !viewer.admin;
  const mayTake = !workerHasIt && !parkedForAdmin;
  return {
    claim: free && mayTake,
    assign: mayTake && (free || holds || viewer.admin),
    unassign: !free && (holds || viewer.admin),
    done: holds && !viewer.admin,
  };
}

/** The line that says who has the todo. */
export function assigneeLine(
  todo: Pick<ShiftTodo, 'assignee' | 'lease_live' | 'claim_by'>,
  viewer: string | null
): string {
  if (todo.assignee) {
    return todo.assignee === viewer ? 'You have this' : `${todo.assignee} has this`;
  }
  if (todo.lease_live) return `A worker has this${todo.claim_by ? ` (${todo.claim_by})` : ''}`;
  return 'Nobody has this yet';
}
