// PullConversationTab.tsx — the front page of a pull request: what happened,
// in order, and where the merge stands now.
//
// Two parts. The timeline (`PullConversationTimeline`) is the story, oldest
// first: the description, each push, the reviews, the threads and the
// pipeline's runs in the order they happened, so "the gate failed, then the
// reviewer held it, then a fix was pushed" reads top to bottom instead of being
// pieced together from five lists. The status panel says where things stand
// right now: the review on each head, the one merge box (with what blocks the
// merge and who can clear it) and the work trace. On a wide screen the panel is
// a column on the right that stays in view while the story scrolls; on a narrow
// one it comes first, above the story.
//
// The Files, Checks and Commits of the pull request are tabs of their own.

import { useCallback, type ReactNode } from 'react';

import { MergeBox, ReviewHeads } from '../components/merge';
import type { MergeBoxProps } from '../components/merge/MergeBox';
import { ErrorState } from '../components/state';
import type { PullRequestReview, ReviewThread } from '../api/types';
import type { usePrThreads } from '../hooks/usePrThreads';
import { PullConversationTimeline } from './PullConversationTimeline';
import type { PullCommit } from './pullCommitsModel';
import { pullFileHref } from './pullTabsModel';

export interface PullConversationTabProps {
  /** Everything the merge box needs, passed through unchanged. */
  merge: MergeBoxProps;
  threads: ReturnType<typeof usePrThreads>;
  /** The pull request's own description, as the forge reports it. */
  description?: string | null;
  /** The review rows; each lands in the timeline when it was submitted. */
  reviews?: readonly PullRequestReview[];
  /** The commits, oldest first: each is a divider in the timeline. */
  commits?: readonly PullCommit[];
  /** The pull request's base path, for the links out of a thread or a finding. */
  base: string;
  /** `owner/name` and the number, for the pipeline's runs. */
  repoFullName: string;
  prNumber: string;
  /** Where the change stands on the work trace, and the todos it carries. */
  work?: ReactNode;
}

const NO_THREADS: ReviewThread[] = [];
const NO_COMMITS: PullCommit[] = [];

export function PullConversationTab({
  merge,
  threads,
  description,
  reviews = [],
  commits = NO_COMMITS,
  base,
  repoFullName,
  prNumber,
  work,
}: PullConversationTabProps): JSX.Element {
  const threadHref = useCallback(
    (thread: ReviewThread): string | null =>
      thread.file_path ? pullFileHref(base, thread.file_path, thread.line) : null,
    [base]
  );
  // A review finding opens its file in the unified diff, whatever mode was last used.
  const findingHref = useCallback(
    (location: { path: string; line: number | null }) =>
      pullFileHref(base, location.path, location.line, 'unified'),
    [base]
  );
  const summary = merge.detail.summary;

  return (
    <div className="pr-conversation" data-testid="pr-conversation-tab">
      <aside className="pr-conversation__status" aria-label="Where the merge stands">
        <ReviewHeads detail={merge.detail} conversationHref={base} />
        <MergeBox {...merge} />
        {work}
      </aside>

      <div className="pr-conversation__story">
        {threads.error ? (
          <ErrorState title="Could not load the review threads" error={threads.error} />
        ) : null}
        <PullConversationTimeline
          author={summary.author}
          description={description ?? null}
          headSha={summary.head_sha}
          commits={commits}
          reviews={reviews}
          threads={threads.data?.threads ?? NO_THREADS}
          repoFullName={repoFullName}
          prNumber={prNumber}
          threadHref={threadHref}
          findingHref={findingHref}
        />
      </div>
    </div>
  );
}
