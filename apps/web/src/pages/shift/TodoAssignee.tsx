// TodoAssignee.tsx — who has a todo, and the acts to take it on or hand it over.
//
// Shown to every signed-in viewer, not only admins: anyone with write access
// to the todo's code may pick up blocked work or delegate it to another such
// person. The server decides; a refusal is shown under the buttons. The
// picker lists the family's people only, never bots or automation logins.

import { useState, type FormEvent } from 'react';

import type { ShiftTodo } from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { useShiftTodoAction } from '../../hooks/useShift';
import { usePeople } from '../../hooks/usePeople';
import { FINISHED, assigneeChoices, assigneeLine, type Viewer } from './assigneeModel';

export function TodoAssignee({
  todo,
  viewer,
}: {
  todo: ShiftTodo;
  viewer: Viewer | null;
}): JSX.Element | null {
  const action = useShiftTodoAction();
  const choices = assigneeChoices(todo, viewer);
  const [picking, setPicking] = useState(false);
  const people = usePeople(todo.family, picking);
  const [target, setTarget] = useState('');
  const run = (request: Parameters<typeof action.mutate>[0], after?: () => void): void =>
    action.mutate(request, { onSuccess: after });
  const base = { family: todo.family, id: todo.id };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!target) return;
    run({ ...base, action: 'assign', value: target }, () => {
      setPicking(false);
      setTarget('');
    });
  };
  const candidates = (people.data ?? []).filter((person) => person.login !== todo.assignee);
  // Finished work nobody took on has nothing to say here.
  if (FINISHED.has(todo.status) && !todo.assignee) return null;
  return (
    <div className="shift__assignee" data-testid="todo-assignee">
      <span className="shift__assignee-line" data-testid="todo-assignee-line">
        {assigneeLine(todo, viewer?.login ?? null)}
      </span>
      <span className="shift__actions">
        {choices.claim ? (
          <ActionButton
            variant="primary"
            disabled={action.isPending}
            onClick={() => run({ ...base, action: 'claim' })}
            aria-label={`Claim ${todo.id}`}
          >
            I'll take it
          </ActionButton>
        ) : null}
        {choices.done ? (
          <ActionButton
            variant="primary"
            disabled={action.isPending}
            onClick={() => run({ ...base, action: 'done' })}
            aria-label={`Mark ${todo.id} done`}
          >
            Mark done
          </ActionButton>
        ) : null}
        {choices.assign ? (
          <ActionButton
            variant="default"
            disabled={action.isPending}
            aria-expanded={picking}
            onClick={() => setPicking((open) => !open)}
            aria-label={`Assign ${todo.id} to someone`}
          >
            Assign to…
          </ActionButton>
        ) : null}
        {choices.unassign ? (
          <ActionButton
            variant="default"
            disabled={action.isPending}
            onClick={() => run({ ...base, action: 'unassign' })}
            aria-label={`Unassign ${todo.id}`}
          >
            {todo.assignee === viewer?.login ? 'Give it back' : 'Unassign'}
          </ActionButton>
        ) : null}
      </span>
      {picking ? (
        <form className="shift__block-form" onSubmit={submit} aria-label={`Assign ${todo.id}`}>
          {people.isPending ? (
            <span>Loading people…</span>
          ) : people.error ? (
            <span role="alert">Could not load people: {people.error.message}</span>
          ) : (
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              aria-label={`Person to assign ${todo.id} to`}
            >
              <option value="">Pick a person</option>
              {candidates.map((person) => (
                <option key={person.login} value={person.login}>
                  {person.display_name && person.display_name !== person.login
                    ? `${person.display_name} (${person.login})`
                    : person.login}
                </option>
              ))}
            </select>
          )}
          <ActionButton type="submit" variant="primary" disabled={!target || action.isPending}>
            Assign
          </ActionButton>
          <ActionButton variant="default" onClick={() => setPicking(false)}>
            Cancel
          </ActionButton>
        </form>
      ) : null}
      {action.error ? (
        <span className="shift__error" role="alert">
          {action.error.message}
        </span>
      ) : null}
    </div>
  );
}
