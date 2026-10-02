// todoParts.tsx — one todo's parts, shared by a Work queue row and the todo's
// own page (`/work/<id>`): its lifecycle trace, why it is stuck, its body,
// note and attempts, and the admin actions on it.

import { Fragment, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import type { ShiftTodo } from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { useShiftTodoAction } from '../../hooks/useShift';
import {
  SHIFT_PRIORITIES,
  formatCost,
  isLongNote,
  latestWorker,
  repoCodeHref,
  slotLabel,
  todoPrHref,
  todoTrace,
  traceSummary,
  type RepoOwners,
} from './shiftModel';
import { todoHref } from './workPaths';

/** A family repo by name: a link to its code when this forge hosts it. */
export function RepoName({ owners, repo }: { owners: RepoOwners; repo: string }): JSX.Element {
  const href = repoCodeHref(owners, repo);
  return href ? <Link to={href}>{repo}</Link> : <span>{repo}</span>;
}

/**
 * Why a todo is stuck, inline. A worker's note can run to twenty lines, which
 * pushed every other row off the screen: four lines show, the rest unfolds.
 */
export function WhyStuck({ id, note }: { id: string; note: string }): JSX.Element {
  const [full, setFull] = useState(false);
  const long = isLongNote(note);
  const noteId = `shift-why-text-${id}`;
  return (
    <div className="shift__why-wrap">
      <p
        id={noteId}
        className={`shift__why${long && !full ? ' shift__why--clamped' : ''}`}
        data-testid={`shift-why-${id}`}
      >
        {note}
      </p>
      {long ? (
        <button
          type="button"
          className="shift__why-toggle"
          aria-expanded={full}
          aria-controls={noteId}
          onClick={() => setFull((v) => !v)}
        >
          {full ? 'Show less' : 'Show full note'}
        </button>
      ) : null}
    </div>
  );
}

/** Queued > Claimed > Done > PR > Merged > Released, with the PR step linked. */
export function TodoTrace({ todo, owners }: { todo: ShiftTodo; owners: RepoOwners }): JSX.Element {
  const steps = todoTrace(todo);
  const prHref = todoPrHref(todo, owners);
  return (
    <ol className="shift-trace" aria-label={`Lifecycle of ${todo.id}: ${traceSummary(steps)}`}>
      {steps.map((step) => (
        <li key={step.key} className={`shift-trace__step is-${step.state}`}>
          {step.key === 'pr' && prHref ? <Link to={prHref}>{step.label}</Link> : step.label}
          {step.state === 'unknown' ? '?' : ''}
        </li>
      ))}
    </ol>
  );
}

export function TodoDetail({
  todo,
  isAdmin,
  showNote = true,
}: {
  todo: ShiftTodo;
  isAdmin: boolean;
  /** False where the note already stands above as why the todo is stuck. */
  showNote?: boolean;
}): JSX.Element {
  const worker = latestWorker(todo);
  return (
    <div data-testid={`shift-todo-detail-${todo.id}`}>
      <pre>{todo.body || '(no body)'}</pre>
      {showNote && todo.note ? <p><strong>Note:</strong> {todo.note}</p> : null}
      {isAdmin ? <TodoAdjust todo={todo} /> : null}
      <p className="shift__muted">
        Requested by {todo.requested_by || '—'} · worker {worker ?? '—'} · filed {todo.filed_at}
        {todo.shift ? ` · shift ${todo.shift}` : ''}
        {todo.blocked_by.length > 0 ? (
          <>
            {' · blocked by '}
            {todo.blocked_by.map((id, i) => (
              <Fragment key={id}>
                {i > 0 ? ', ' : ''}
                <Link to={todoHref(id)}>{id}</Link>
              </Fragment>
            ))}
          </>
        ) : null}
        {todo.change_set ? ` · change set ${todo.change_set}` : ''}
      </p>
      {todo.worked_by.length === 0 ? (
        <p className="shift__muted">No attempts yet.</p>
      ) : (
        <table className="shift__table" aria-label={`Attempts for ${todo.id}`}>
          <thead>
            <tr>
              <th scope="col">Worker</th>
              <th scope="col">Model</th>
              <th scope="col">Started</th>
              <th scope="col">Ended</th>
              <th scope="col">Outcome</th>
              <th scope="col">Cost</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {todo.worked_by.map((attempt, i) => (
              <tr key={`${attempt.started}-${i}`}>
                <td>
                  {slotLabel(attempt.by, attempt.host, attempt.slot)}
                </td>
                <td>{attempt.model}</td>
                <td>{attempt.started}</td>
                <td>{attempt.ended ?? '—'}</td>
                <td>{attempt.outcome}</td>
                <td>{formatCost(attempt.cost_usd)}</td>
                <td>{attempt.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The one thing to do with this row: release what is stuck, block what should not run. */
export function TodoPrimaryAction({ todo }: { todo: ShiftTodo }): JSX.Element | null {
  const action = useShiftTodoAction();
  const base = { family: todo.family, id: todo.id };
  const [blocking, setBlocking] = useState(false);
  const [note, setNote] = useState('');
  const submitBlock = (event: FormEvent): void => {
    event.preventDefault();
    action.mutate(
      { ...base, action: 'block', note: note.trim() },
      {
        onSuccess: () => {
          setBlocking(false);
          setNote('');
        },
      }
    );
  };
  const releasable =
    todo.status === 'claimed' || todo.status === 'blocked' || todo.status === 'handoff';
  if (todo.status === 'done') return null;
  return (
    <span className="shift__actions">
      {releasable ? (
        <ActionButton
          // Outlined, never filled: the page's one filled action is "Open review PR".
          variant={todo.status === 'claimed' ? 'ghost' : 'default'}
          disabled={action.isPending}
          onClick={() => action.mutate({ ...base, action: 'release' })}
          aria-label={`Release ${todo.id}`}
        >
          Release
        </ActionButton>
      ) : (
        <ActionButton
          variant="ghost"
          disabled={action.isPending}
          onClick={() => setBlocking((v) => !v)}
          aria-expanded={blocking}
          aria-label={`Block ${todo.id}`}
        >
          Block
        </ActionButton>
      )}
      {blocking ? (
        <form className="shift__block-form" onSubmit={submitBlock} aria-label={`Why block ${todo.id}?`}>
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why? (shown on the todo)"
            aria-label={`Reason for blocking ${todo.id}`}
          />
          <ActionButton variant="danger" type="submit" disabled={action.isPending}>
            Confirm block
          </ActionButton>
          <ActionButton variant="ghost" type="button" onClick={() => setBlocking(false)}>
            Cancel
          </ActionButton>
        </form>
      ) : null}
      {action.error ? (
        <span className="shift__error" role="alert">
          {action.error.message}
        </span>
      ) : null}
    </span>
  );
}

/** Priority and now/night: adjustments, so they live in the opened row. */
function TodoAdjust({ todo }: { todo: ShiftTodo }): JSX.Element | null {
  const action = useShiftTodoAction();
  const base = { family: todo.family, id: todo.id };
  if (todo.status === 'done') return null;
  const otherMode = todo.mode === 'now' ? 'night' : 'now';
  return (
    <p className="shift__actions">
      <label>
        Priority{' '}
        <select
          aria-label={`Priority for ${todo.id}`}
          value={todo.priority}
          disabled={action.isPending}
          onChange={(event) =>
            action.mutate({ ...base, action: 'priority', value: Number(event.target.value) })
          }
        >
          {SHIFT_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              P{p}
            </option>
          ))}
        </select>
      </label>
      <ActionButton
        variant="ghost"
        disabled={action.isPending}
        onClick={() => action.mutate({ ...base, action: 'mode', value: otherMode })}
        aria-label={`Move ${todo.id} to ${otherMode}`}
      >
        Move to {otherMode}
      </ActionButton>
      {action.error ? (
        <span className="shift__error" role="alert">
          {action.error.message}
        </span>
      ) : null}
    </p>
  );
}
