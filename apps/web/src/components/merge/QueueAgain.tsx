// QueueAgain.tsx — the pull request page's merge queue strip.
//
// A queue entry that failed its gate twice, or that left the queue because
// its replay could not be built, is where the queue stops and a person starts.
// The strip says what became of the entry and offers the one act that follows:
// queue it again on the head that is there now. The forge's refusal (no write
// grant, a merge gate that no longer passes) is worded in place.

import { ListChecks } from 'lucide-react';

import { ActionButton } from '../action/ActionButton';
import { useEnqueuePr, useRepoMergeQueue } from '../../hooks/useMergeQueue';

import { queueAgainOffer, queueEntryFor } from './mergeQueueModel';

export interface QueueAgainProps {
  repoId: string | null;
  prNumber: string | null;
  /** False on a merged or closed pull request: there is nothing to queue. */
  enabled?: boolean;
}

export function QueueAgain({ repoId, prNumber, enabled = true }: QueueAgainProps): JSX.Element {
  const queue = useRepoMergeQueue(repoId, enabled);
  const enqueue = useEnqueuePr(repoId, prNumber);
  const offer = queueAgainOffer(queueEntryFor(queue.data, prNumber));
  // No entry, a queue the server does not have, or an entry still building:
  // nothing to say, so the page stays as it was.
  if (!offer) return <></>;
  return (
    <div className="pr-cockpit__recovery" role="status" data-testid="pr-queue-again">
      <div className="pr-cockpit__recovery-title">
        <ListChecks aria-hidden="true" size={14} />
        {offer.line}
      </div>
      <ActionButton
        variant="primary"
        disabled={enqueue.isPending}
        onClick={() => {
          enqueue.reset();
          enqueue.mutate();
        }}
      >
        Queue again
      </ActionButton>
      {enqueue.error ? (
        <div className="pr-cockpit__recovery-shas" role="alert" data-testid="pr-queue-again-error">
          {enqueue.error.message}
        </div>
      ) : null}
    </div>
  );
}
