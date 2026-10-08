// QueueToMerge.tsx — the merge queue's own act, inside the merge box.
//
// Two readers need it. One has a queue entry that failed its gate twice, or
// that left the queue because its replay could not be built: that is where the
// queue stops and a person starts. The other has a green, approved pull request
// whose base moved, so a direct merge is refused — the replay onto the base tip
// is a commit no gate has run on, and the queue is the only way to land it.
//
// Both get one sentence saying what is happening and one button: Queue again,
// or Queue to merge. Once the entry is building, the strip says so and shows
// the replay gate's progress until it lands. The forge's refusal (no write
// grant, a merge gate that no longer passes) is worded in place.

import { ListChecks } from 'lucide-react';

import { ActionButton } from '../action/ActionButton';
import { CiProgress } from '../ciProgress/CiProgress';
import { useEnqueuePr, useRepoMergeQueue } from '../../hooks/useMergeQueue';
import { useServerNow } from '../../hooks/useServerNow';
import type { PullRequestDetail } from '../../api/types';

import {
  mergeQueueOffer,
  queueEntryFor,
  queueGateStartedAt,
} from './mergeQueueModel';

export interface QueueToMergeProps {
  repoId: string | null;
  prNumber: string | null;
  /** The pull request itself: whether the queue is the way to land it. */
  detail?: PullRequestDetail | null;
  /** The forge's last merge refusal; it may name the queue as the answer. */
  mergeError?: string | null;
  /** False on a merged or closed pull request: there is nothing to queue. */
  enabled?: boolean;
}

/** The strip's test id per case, so each one is addressable on its own. */
const TEST_IDS = {
  queue: 'pr-queue-to-merge',
  again: 'pr-queue-again',
  building: 'pr-queue-building',
} as const;

export function QueueToMerge({
  repoId,
  prNumber,
  detail = null,
  mergeError = null,
  enabled = true,
}: QueueToMergeProps): JSX.Element {
  const queue = useRepoMergeQueue(repoId, enabled);
  const enqueue = useEnqueuePr(repoId, prNumber);
  const entry = queueEntryFor(queue.data, prNumber);
  const offer = enabled ? mergeQueueOffer({ detail, entry, mergeError }) : null;
  const startedAt = queueGateStartedAt(entry);
  const nowMs = useServerNow(null, 0, startedAt !== null);
  // An entry that landed, a queue the server does not have, and a pull request
  // the queue has nothing to do with all leave the page as it was.
  if (!offer) return <></>;
  const testId = TEST_IDS[offer.kind];
  return (
    <div className="pr-cockpit__recovery" role="status" data-testid={testId}>
      <div className="pr-cockpit__recovery-title">
        <ListChecks aria-hidden="true" size={14} />
        {offer.line}
      </div>
      {offer.cta ? (
        <ActionButton
          variant="primary"
          disabled={enqueue.isPending}
          actionId="pull.queue"
          onClick={() => {
            enqueue.reset();
            enqueue.mutate();
          }}
        >
          {offer.cta}
        </ActionButton>
      ) : null}
      {startedAt ? (
        <CiProgress
          startedAt={startedAt}
          nowMs={nowMs}
          variant="inline"
          testId="pr-queue-gate-progress"
        />
      ) : null}
      {enqueue.error ? (
        <div className="pr-cockpit__recovery-shas" role="alert" data-testid={`${testId}-error`}>
          {enqueue.error.message}
        </div>
      ) : null}
    </div>
  );
}
