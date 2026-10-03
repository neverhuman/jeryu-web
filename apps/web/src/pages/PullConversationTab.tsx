// PullConversationTab.tsx — the front page of a pull request: what it says it
// does, where the merge stands, the threads, and the pipeline's record of it.
//
// One column, in reading order: the description, the one merge box, the review
// threads (each linking into the Files tab), where the change stands on the
// work trace, then the pipeline timeline. The
// Files, Checks and Commits of the pull request are tabs of their own, so
// nothing here is below the fold of a nested scroller.

import type { ReactNode } from 'react';

import { MergeBox, ThreadList } from '../components/merge';
import type { MergeBoxProps } from '../components/merge/MergeBox';
import { ErrorState, LoadingState } from '../components/state';
import type { ReviewThread } from '../api/types';
import type { usePrThreads } from '../hooks/usePrThreads';
import { PullPipelineEvents } from './activity/PullPipelineEvents';
import { pullFileHref } from './pullTabsModel';

export interface PullConversationTabProps {
  /** Everything the merge box needs, passed through unchanged. */
  merge: MergeBoxProps;
  threads: ReturnType<typeof usePrThreads>;
  /** The pull request's own description, as the forge reports it. */
  description?: string | null;
  /** The pull request's base path, for the links out of a thread. */
  base: string;
  /** `owner/name` and the number, for the pipeline timeline. */
  repoFullName?: string | null;
  prNumber?: string | null;
  /**
   * The merge queue's own act, above the box: a queue entry that failed is the
   * one case where the queue stops and a person starts.
   */
  queueAgain?: ReactNode;
  /** Where the change stands on the work trace, and the todos it carries. */
  work?: ReactNode;
}

export function PullConversationTab({
  merge,
  threads,
  description,
  base,
  repoFullName,
  prNumber,
  queueAgain,
  work,
}: PullConversationTabProps): JSX.Element {
  const anchorHref = (thread: ReviewThread): string | null =>
    thread.file_path ? pullFileHref(base, thread.file_path, thread.line) : null;

  return (
    <div className="pr-conversation" data-testid="pr-conversation-tab">
      {description ? (
        <section
          className="pr-conversation__description"
          aria-label="Description"
          data-testid="pr-description"
        >
          <p>{description}</p>
        </section>
      ) : null}

      {queueAgain}

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
