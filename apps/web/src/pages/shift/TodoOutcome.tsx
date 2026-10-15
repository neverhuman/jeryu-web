import { useId, useState, type FormEvent } from 'react';

import type { ShiftTodo } from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { useShiftTodoAction } from '../../hooks/useShift';

export function TodoOutcome({
  todo,
  canEdit,
}: {
  todo: ShiftTodo;
  canEdit: boolean;
}): JSX.Element {
  const action = useShiftTodoAction();
  const outcomeId = useId();
  const [editing, setEditing] = useState(false);
  const [hypothesis, setHypothesis] = useState(todo.hypothesis ?? '');
  const [checkAfter, setCheckAfter] = useState(String(todo.check_after ?? ''));
  const [outcome, setOutcome] = useState(todo.outcome ?? 'not_checked');
  const [note, setNote] = useState(todo.outcome_note ?? '');
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    action.mutate(
      {
        family: todo.family,
        id: todo.id,
        action: 'outcome_check',
        value: {
          hypothesis,
          check_after: checkAfter === '' ? null : /^\d+$/.test(checkAfter) ? Number(checkAfter) : checkAfter,
          outcome,
          outcome_note: note,
        },
      },
      { onSuccess: () => setEditing(false) }
    );
  };
  const edit = (): void => {
    setHypothesis(todo.hypothesis ?? '');
    setCheckAfter(String(todo.check_after ?? ''));
    setOutcome(todo.outcome ?? 'not_checked');
    setNote(todo.outcome_note ?? '');
    setEditing(true);
  };
  return (
    <section className="shift__section todo-outcome" aria-label="Hypothesis and outcome">
      <h2>Hypothesis and outcome</h2>
      <p>{todo.hypothesis || 'No hypothesis recorded'}</p>
      <p>
        Check after: {typeof todo.check_after === 'number'
          ? `${todo.check_after} days after deploy`
          : todo.check_after || 'No date recorded'}
      </p>
      <p>Outcome: {(todo.outcome ?? 'not_checked').replaceAll('_', ' ')}</p>
      {todo.outcome_note ? <p>{todo.outcome_note}</p> : null}
      {canEdit && !editing ? (
        <ActionButton onClick={edit}>Edit outcome check</ActionButton>
      ) : null}
      {editing ? (
        <form className="shift__block-form todo-outcome__form" onSubmit={submit}>
          <label>
            Hypothesis
            <input value={hypothesis} maxLength={1000} onChange={(event) => setHypothesis(event.target.value)} />
          </label>
          <label>
            Check after
            <input
              value={checkAfter}
              placeholder="YYYY-MM-DD or days after deploy"
              onChange={(event) => setCheckAfter(event.target.value)}
            />
          </label>
          <label htmlFor={outcomeId}>Outcome</label>
          <select
            id={outcomeId}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as NonNullable<ShiftTodo['outcome']>)}
          >
            <option value="not_checked">Not checked</option>
            <option value="met">Met</option>
            <option value="not_met">Not met</option>
            <option value="unclear">Unclear</option>
          </select>
          <label>
            Outcome note
            <textarea value={note} maxLength={16000} onChange={(event) => setNote(event.target.value)} />
          </label>
          <ActionButton type="submit" variant="primary" disabled={action.isPending}>
            Save outcome check
          </ActionButton>
          <ActionButton disabled={action.isPending} onClick={() => setEditing(false)}>Cancel</ActionButton>
          {action.error ? <p role="alert">{action.error.message}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
