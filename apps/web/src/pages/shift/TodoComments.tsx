// TodoComments.tsx — the comment thread under a todo's body (`/work/<id>`).
//
// A todo's `note` is one field every status action overwrites, so context the
// todo gains later — a second incident, a measurement, an owner's reply — has
// nowhere to go without destroying what was there. The thread is append-only:
// newest last, rendered as markdown, each comment stamped with its author and
// the time the server stored it. Posting one changes no status, note, lease or
// attempt count, so anyone who may act on todos may add to it.

import { useState, type FormEvent } from 'react';

import type { ShiftTodo } from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { MarkdownSource } from '../../components/browser/MarkdownSource';
import { relativeText } from '../../format/when';
import { useAddShiftTodoComment, useShiftTodoComments } from '../../hooks/useShift';

export function TodoComments({
  todo,
  canComment,
}: {
  todo: ShiftTodo;
  /** Whether this reader may act on todos, which is who may comment. */
  canComment: boolean;
}): JSX.Element {
  const thread = useShiftTodoComments(todo.family, todo.id);
  const add = useAddShiftTodoComment(todo.family, todo.id);
  const [draft, setDraft] = useState('');
  const now = new Date();
  const comments = thread.data?.comments ?? [];
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const body = draft.trim();
    if (body === '') return;
    add.mutate({ body }, { onSuccess: () => setDraft('') });
  };
  return (
    <section
      className="shift__section shift-comments"
      aria-label={`Comments on ${todo.id}`}
      data-testid={`todo-comments-${todo.id}`}
    >
      <h2 className="shift-comments__title">Comments</h2>
      {thread.isError ? (
        <p className="shift__error" role="alert">
          Could not load the comments: {thread.error.message}
        </p>
      ) : null}
      {comments.length === 0 && !thread.isPending && !thread.isError ? (
        <p className="shift__muted">
          No comments yet. A comment adds context without changing the todo.
        </p>
      ) : null}
      <ol className="shift-comments__list">
        {comments.map((comment, index) => (
          <li
            key={`${comment.at}-${index}`}
            className="shift-comments__item"
            data-testid={`todo-comment-${todo.id}-${index}`}
          >
            <p className="shift__muted shift-comments__byline">
              <strong>{comment.author}</strong> · <time dateTime={comment.at}>{relativeText(comment.at, now)}</time>
            </p>
            <MarkdownSource markdown={comment.body} className="shift-comments__body" />
          </li>
        ))}
      </ol>
      {canComment ? (
        <form className="shift-comments__form" onSubmit={submit} aria-label={`Add a comment to ${todo.id}`}>
          <textarea
            value={draft}
            rows={4}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What happened? (markdown, added to the thread)"
            aria-label={`Comment on ${todo.id}`}
          />
          <span className="shift__actions">
            <ActionButton variant="primary" type="submit" disabled={add.isPending || draft.trim() === ''}>
              Add comment
            </ActionButton>
            {add.error ? (
              <span className="shift__error" role="alert">
                {add.error.message}
              </span>
            ) : null}
          </span>
        </form>
      ) : null}
    </section>
  );
}
