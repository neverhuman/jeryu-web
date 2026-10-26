// PullConversationTab.tsx — the front page of a pull request: what it says it
// does, where the merge stands, the threads, and the pipeline's record of it.
//
// One column, in reading order: the description, where the review stands on
// each head the pull request has had, the reviews with what each
// reviewer wrote, the one merge box (which carries the merge queue's own act
// when the queue is the way to land this change), the review
// threads (each linking into the Files tab), where the change stands on the
// work trace, then the pipeline timeline. The
// Files, Checks and Commits of the pull request are tabs of their own, so
// nothing here is below the fold of a nested scroller.

import { useCallback, type ReactNode } from 'react';

import { MarkdownSource } from '../components/browser';
import { MergeBox, ReviewHeads, ReviewList, ThreadList } from '../components/merge';
import type { MergeBoxProps } from '../components/merge/MergeBox';
import { ErrorState, LoadingState } from '../components/state';
import type { PullRequestReview, ReviewThread } from '../api/types';
import type { usePrThreads } from '../hooks/usePrThreads';
import { PullPipelineEvents } from './activity/PullPipelineEvents';
import { pullFileHref } from './pullTabsModel';

export interface PullConversationTabProps {
  /** Everything the merge box needs, passed through unchanged. */
  merge: MergeBoxProps;
  threads: ReturnType<typeof usePrThreads>;
  /** The pull request's own description, as the forge reports it. */
  description?: string | null;
  /** The review rows, newest first on the page; each body is read here. */
  reviews?: readonly PullRequestReview[];
  /** The pull request's base path, for the links out of a thread or a finding. */
  base: string;
  /** `owner/name` and the number, for the pipeline timeline. */
  repoFullName?: string | null;
  prNumber?: string | null;
  /** Where the change stands on the work trace, and the todos it carries. */
  work?: ReactNode;
}

export function PullConversationTab({
  merge,
  threads,
  description,
  reviews = [],
  base,
  repoFullName,
  prNumber,
  work,
}: PullConversationTabProps): JSX.Element {
  const anchorHref = (thread: ReviewThread): string | null =>
    thread.file_path ? pullFileHref(base, thread.file_path, thread.line) : null;
  // A review finding opens its file in the unified diff, whatever mode was last used.
  const findingHref = useCallback(
    (location: { path: string; line: number | null }) =>
      pullFileHref(base, location.path, location.line, 'unified'),
    [base]
  );

  return (
    <div className="pr-conversation" data-testid="pr-conversation-tab">
      {description ? (
        <section
          className="pr-conversation__description"
          aria-label="Description"
          data-testid="pr-description"
        >
          {/* Written in Markdown, as every forge reads it: headings, lists and
              code fences, not one paragraph of literal backticks. */}
          <MarkdownSource markdown={description} />
        </section>
      ) : null}

      <ReviewHeads detail={merge.detail} conversationHref={base} />

      <ReviewList reviews={reviews} fileHref={findingHref} />

      <MergeBox {...merge} />

      {threads.isPending ? (
        <LoadingState title="Loading the threads…" variant="skeleton" rows={3} />
      ) : threads.error ? (
        <ErrorState title="Could not load the review threads" error={threads.error} />
      ) : (
        <ThreadList
          threads={threads.data?.threads ?? []}
          anchorHref={anchorHref}
        />
      )}

      {work}

      {repoFullName && prNumber ? (
        <PullPipelineEvents repo={repoFullName} pr={prNumber} />
      ) : null}
    </div>
  );
}
