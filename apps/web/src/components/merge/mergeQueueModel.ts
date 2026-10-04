// mergeQueueModel.ts — what became of this pull request's merge queue entry.
//
// The queue only ever lands a commit that passed the gate, so an entry that
// failed its gate twice, or that left the queue because the replay could not
// be built, waits on a person: somebody rebases or simply queues it again on
// the head that is there now. These are the pure rules; the page renders them.

import type { QueueEntry, RepoMergeQueueResponse } from '../../api/types';

/** This pull request's entry, whatever state it is in. */
export function queueEntryFor(
  queue: RepoMergeQueueResponse | null | undefined,
  prNumber: string | null
): QueueEntry | null {
  const number = Number(prNumber);
  if (!queue || !Number.isFinite(number)) return null;
  return (queue.entries ?? []).find((entry) => entry.number === number) ?? null;
}

export interface QueueAgainOffer {
  /** The entry's state, as the server named it. */
  state: 'failed' | 'dequeued';
  /** One line: what became of the entry, and why when the server says. */
  line: string;
}

/**
 * The offer to queue again: only an entry that failed or left the queue. One
 * that is still building needs patience, and one that landed is done.
 */
export function queueAgainOffer(entry: QueueEntry | null): QueueAgainOffer | null {
  const state = entry?.state === 'failed' ? 'failed' : entry?.state === 'dequeued' ? 'dequeued' : null;
  if (!entry || !state) return null;
  const what =
    state === 'failed'
      ? 'The merge queue failed on this pull request.'
      : 'This pull request left the merge queue.';
  const why = (entry.reason ?? '').trim();
  return { state, line: why ? `${what} ${why}` : what };
}
