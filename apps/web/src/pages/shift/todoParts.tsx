// todoParts.tsx — one todo's parts, shared by a Work queue row and the todo's
// own page (`/work/<id>`): its lifecycle trace, why it is stuck, its body,
// note and attempts, and the admin actions on it (done, close, park, edit, and
// release or block), each of which asks before it writes to the queue.

import { Fragment, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import type { ShiftTodo, ShiftTodoActionRequest } from '../../api/types';
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
  todoActions,
  todoTrace,
  traceSummary,
  untilInputDefault,
  untilRfc3339,
  type RepoRefs,
  type TodoActionChoice,
  type TodoActionId,
} from './shiftModel';
import { todoHref } from './workPaths';

/** A family repo by name: a link to its code when this forge hosts it. */
export function RepoName({ refs, repo }: { refs: RepoRefs; repo: string }): JSX.Element {
  const href = repoCodeHref(refs, repo);
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
export function TodoTrace({ todo, refs }: { todo: ShiftTodo; refs: RepoRefs }): JSX.Element {
  const steps = todoTrace(todo);
  const prHref = todoPrHref(todo, refs);
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
        <div className="table-scroll">
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
        </div>
      )}
    </div>
  );
}

/**
 * What to do with this row. The first action is a button; the rest sit behind
 * a "More" menu, and each one but Release spells itself out and asks before it
 * goes: these edit a queue the workers are reading.
 *
 * Release is the exception only while nobody is running the todo. With a live
 * claim lease a worker is working on it right now, so releasing it would let a
 * second worker claim the same work; that release asks first and goes as
 * `force`, which is what the server needs to allow it.
 */
export function TodoActions({ todo }: { todo: ShiftTodo }): JSX.Element | null {
  const action = useShiftTodoAction();
  const { primary, more } = todoActions(todo);
  const [asking, setAsking] = useState<TodoActionId | null>(null);
  if (!primary) return null;
  // Taking the todo back from a worker that is still running it: the one
  // release that asks first, and the one that has to say `force`.
  const forces = (choice: TodoActionChoice): boolean =>
    choice.id === 'release' && todo.lease_live;
  const run = (choice: TodoActionChoice): void => {
    // Release is one keystroke back to the queue; everything else confirms.
    if (choice.id === 'release' && !forces(choice)) {
      setAsking(null);
      action.mutate({ family: todo.family, id: todo.id, action: 'release' });
      return;
    }
    setAsking((current) => (current === choice.id ? null : choice.id));
  };
  const open = [primary, ...more].find((choice) => choice.id === asking) ?? null;
  return (
    <span className="shift__actions">
      <ActionButton
        variant={primary.variant}
        disabled={action.isPending}
        onClick={() => run(primary)}
        aria-expanded={
          primary.id === 'release' && !forces(primary) ? undefined : asking === primary.id
        }
        aria-label={`${primary.label} ${todo.id}`}
      >
        {primary.label}
      </ActionButton>
      {more.length > 0 ? (
        <details className="shift__more-actions">
          <summary aria-label={`More actions for ${todo.id}`}>More</summary>
          <span className="shift__more-actions-list">
            {more.map((choice) => (
              <ActionButton
                key={choice.id}
                variant={choice.variant}
                disabled={action.isPending}
                onClick={() => run(choice)}
                aria-expanded={asking === choice.id}
                aria-label={`${choice.label} ${todo.id}`}
              >
                {choice.label}
              </ActionButton>
            ))}
          </span>
        </details>
      ) : null}
      {open ? (
        <TodoActionForm
          todo={todo}
          choice={open}
          pending={action.isPending}
          onSubmit={(request) =>
            action.mutate(
              { family: todo.family, id: todo.id, ...request },
              { onSuccess: () => setAsking(null) }
            )
          }
          onCancel={() => {
            action.reset();
            setAsking(null);
          }}
        />
      ) : null}
      {action.error ? (
        <span className="shift__error" role="alert">
          {action.error.message}
        </span>
      ) : null}
    </span>
  );
}

/** One action spelled out: what it will do, what it needs, and confirm or cancel. */
function TodoActionForm({
  todo,
  choice,
  pending,
  onSubmit,
  onCancel,
}: {
  todo: ShiftTodo;
  choice: TodoActionChoice;
  pending: boolean;
  onSubmit: (request: ShiftTodoActionRequest) => void;
  onCancel: () => void;
}): JSX.Element {
  const [note, setNote] = useState('');
  const [until, setUntil] = useState(() => untilInputDefault(new Date()));
  const [title, setTitle] = useState(todo.title);
  const [body, setBody] = useState(todo.body);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    switch (choice.id) {
      case 'release':
        return onSubmit({ action: 'release', force: true, note: note.trim() });
      case 'block':
        return onSubmit({ action: 'block', note: note.trim() });
      case 'close':
        return onSubmit({ action: 'close', note: note.trim() });
      case 'done':
        return onSubmit({ action: 'done' });
      case 'park': {
        const at = untilRfc3339(until);
        if (at) onSubmit({ action: 'park', until: at });
        return;
      }
      case 'edit':
        return onSubmit({ action: 'edit', title: title.trim(), body });
      default:
        return undefined;
    }
  };
  return (
    <form
      className="shift__block-form"
      onSubmit={submit}
      aria-label={`${choice.label} ${todo.id}?`}
    >
      {choice.id === 'release' ? (
        <>
          <span>
            {todo.claim_by || 'A worker'} is running {todo.id} and its lease is still live.
            Releasing it now lets a second worker claim the same work.
          </span>
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why? (replaces the note on the todo)"
            aria-label={`Reason for releasing ${todo.id}`}
          />
        </>
      ) : null}
      {choice.id === 'block' || choice.id === 'close' ? (
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why? (shown on the todo)"
          aria-label={`Reason for ${choice.id === 'block' ? 'blocking' : 'closing'} ${todo.id}`}
        />
      ) : null}
      {choice.id === 'park' ? (
        <label>
          Until{' '}
          <input
            type="datetime-local"
            value={until}
            onChange={(event) => setUntil(event.target.value)}
            aria-label={`Park ${todo.id} until`}
          />
        </label>
      ) : null}
      {choice.id === 'edit' ? (
        <>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label={`Title of ${todo.id}`}
          />
          <textarea
            value={body}
            rows={4}
            onChange={(event) => setBody(event.target.value)}
            aria-label={`Body of ${todo.id}`}
          />
        </>
      ) : null}
      {choice.id === 'done' ? <span>Mark {todo.id} done?</span> : null}
      <ActionButton
        variant={choice.id === 'edit' || choice.id === 'done' ? 'default' : 'danger'}
        type="submit"
        disabled={pending || (choice.id === 'park' && untilRfc3339(until) === null)}
      >
        {choice.confirm}
      </ActionButton>
      <ActionButton variant="ghost" type="button" onClick={onCancel}>
        Cancel
      </ActionButton>
    </form>
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
