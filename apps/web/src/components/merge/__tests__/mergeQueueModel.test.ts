import { describe, expect, it } from 'vitest';

import type { QueueEntry } from '../../../api/types';
import { queueAgainOffer, queueEntryFor } from '../mergeQueueModel';

function entry(partial: Partial<QueueEntry>): QueueEntry {
  return {
    repo: 'acme/web',
    base: 'main',
    number: 7,
    pr_head_sha: '1111111111111111111111111111111111111111',
    base_sha: '2222222222222222222222222222222222222222',
    queue_ref: 'refs/queue/main/7',
    queue_sha: '3333333333333333333333333333333333333333',
    state: 'building',
    enqueued_at: '2026-10-01T09:00:00Z',
    enqueued_by: 'pr-redteam',
    ...partial,
  };
}

describe('mergeQueueModel', () => {
  it('finds this pull request among the repository\'s entries', () => {
    const queue = { entries: [entry({ number: 6 }), entry({ number: 7 })] };
    expect(queueEntryFor(queue, '7')?.number).toBe(7);
    expect(queueEntryFor(queue, '8')).toBeNull();
    expect(queueEntryFor(queue, null)).toBeNull();
    expect(queueEntryFor(undefined, '7')).toBeNull();
  });

  it('offers to queue again only after a failure or a dequeue, and says why', () => {
    expect(queueAgainOffer(entry({ state: 'failed', reason: 'The queue gate failed twice.' }))).toEqual({
      state: 'failed',
      line: 'The merge queue failed on this pull request. The queue gate failed twice.',
    });
    expect(queueAgainOffer(entry({ state: 'dequeued', reason: '  ' }))).toEqual({
      state: 'dequeued',
      line: 'This pull request left the merge queue.',
    });
    // Still building, already landed, an unknown state, or no entry: nothing to offer.
    for (const state of ['building', 'landed', 'parked']) {
      expect(queueAgainOffer(entry({ state }))).toBeNull();
    }
    expect(queueAgainOffer(null)).toBeNull();
  });
});
