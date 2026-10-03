// ThreadList.tsx — the review threads of a pull request, on the Conversation.
//
// A thread used to be a single truncated line with no comment in it, so the
// reader learned that somebody had said something about `ca…` and nothing
// more. Each thread is now a card: where it is anchored (a link that opens
// that file at that line on the Files tab), who wrote it, and the body of
// every comment, oldest first. Unresolved threads come first.

import { MessageSquare, MessageSquareOff } from 'lucide-react';
import { Link } from 'react-router-dom';

import { compareInstants } from '../../format/when';
import { When } from '../../format/When';
import type { ReviewThread } from '../../api/types';

import './merge.css';

export interface ThreadListProps {
  threads: ReviewThread[];
  /**
   * Where a thread's anchor is read: the Files tab with that file open at
   * that line. Absent for a thread anchored to no file.
   */
  anchorHref?: (thread: ReviewThread) => string | null;
  className?: string;
}

export function ThreadList({
  threads,
  anchorHref,
  className,
}: ThreadListProps): JSX.Element {
  const unresolved = threads.filter((thread) => !thread.resolved).length;

  // Unresolved first, then most recently updated.
  const sorted = [...threads].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    return compareInstants(b.updated_at, a.updated_at);
  });

  return (
    <section
      className={`thread-list ${className ?? ''}`.trim()}
      aria-label="Review threads"
      id="pr-threads"
      data-testid="pr-threads"
    >
      <header className="thread-list__header">
        <h2 className="thread-list__title">Threads</h2>
        <span className="thread-list__count" data-testid="pr-threads-count">
          {unresolved} unresolved
        </span>
      </header>
      {sorted.length === 0 ? (
        <p className="thread-list__empty" data-testid="pr-threads-empty">
          No conversation threads on this pull request yet.
        </p>
      ) : (
        <ul className="thread-list__items">
          {sorted.map((thread) => {
            const Icon = thread.resolved ? MessageSquareOff : MessageSquare;
            const href = anchorHref?.(thread) ?? null;
            const anchor = thread.file_path
              ? `${thread.file_path}${thread.line ? `:${thread.line}` : ''}`
              : null;
            return (
              <li
                key={thread.id}
                className={`thread-list__item ${
                  thread.resolved ? 'thread-list__item--resolved' : ''
                }`.trim()}
                data-testid="pr-thread"
                data-resolved={thread.resolved ? 'true' : 'false'}
              >
                <header className="thread-list__item-header">
                  <Icon aria-hidden="true" size={12} className="thread-list__icon" />
                  {anchor ? (
                    href ? (
                      <Link className="thread-list__path" to={href}>
                        {anchor}
                      </Link>
                    ) : (
                      <code className="thread-list__path">{anchor}</code>
                    )
                  ) : (
                    <span className="thread-list__general">
                      On the pull request
                    </span>
                  )}
                  <span className="thread-list__state">
                    {thread.resolved ? 'resolved' : 'unresolved'}
                  </span>
                </header>
                <ol className="thread-list__comments">
                  {thread.comments.map((comment) => (
                    <li key={comment.id} className="thread-list__comment">
                      <span className="thread-list__comment-meta">
                        <strong>{comment.author}</strong>
                        <When at={comment.created_at} />
                      </span>
                      <p
                        className="thread-list__comment-body"
                        data-testid="pr-thread-body"
                      >
                        {comment.body_markdown}
                      </p>
                    </li>
                  ))}
                </ol>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
