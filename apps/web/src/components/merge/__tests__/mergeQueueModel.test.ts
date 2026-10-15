import { describe, expect, it } from 'vitest';

import type { QueueEntry } from '../../../api/types';
import { pullDetail } from '../../../test/fixtures/pullRequest';
import {
  mergeQueueOffer,
  queueAgainOffer,
  queueEntryFor,
  queueGateStartedAt,
  queueGateWaiting,
  readyButBehindBase,
  refusalAsksForQueue,
} from '../mergeQueueModel';

const STALE_BASE = [
  {
    code: 'passport_blocked_stale_base',
    message: 'main moved since this head was gated.',
    details: null,
  },
];

/** The forge's own words when it refuses a merge onto a moved base. */
const REFUSAL =
  'main requires linear history, and the replay of the pull request onto it (9f3c1ab) has no result for acme/required; queue the pull request so the forge gates the commit it lands';

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

  it('reads a head that is behind its base off the Passport', () => {
    expect(readyButBehindBase(pullDetail({ approvals: 1, blockers: STALE_BASE }))).toBe(true);
    // The forge's mergeability gate says the same thing in its own words.
    expect(
      readyButBehindBase(
        pullDetail({
          approvals: 1,
          blockers: [
            {
              code: 'passport_blocked_mergeability',
              message: 'The forge will not merge this head.',
              details: 'behind',
            },
          ],
        })
      )
    ).toBe(true);
    // Not approved, nothing blocked at all, something else blocked, or settled.
    expect(readyButBehindBase(pullDetail({ blockers: STALE_BASE }))).toBe(false);
    expect(readyButBehindBase(pullDetail({ passport: 'pass', approvals: 1 }))).toBe(false);
    expect(readyButBehindBase(pullDetail({ approvals: 1 }))).toBe(false);
    expect(
      readyButBehindBase(pullDetail({ approvals: 1, blockers: STALE_BASE, state: 'merged' }))
    ).toBe(false);
  });

  it('hears the queue in a merge refusal', () => {
    expect(refusalAsksForQueue(REFUSAL)).toBe(true);
    expect(refusalAsksForQueue('the head SHA you merged is not the head any more')).toBe(false);
    expect(refusalAsksForQueue(null)).toBe(false);
  });

  it('offers Queue to merge on a green head whose base moved', () => {
    const detail = pullDetail({ approvals: 1, blockers: STALE_BASE });
    expect(mergeQueueOffer({ detail, entry: null })).toEqual({
      kind: 'queue',
      state: null,
      line: 'main moved since this was gated; the queue replays it onto main, gates that commit, then lands it',
      cta: 'Queue to merge',
    });
    // The same offer after the forge refused the merge in so many words, even
    // though this Passport passes and nothing on the page said to queue it.
    expect(
      mergeQueueOffer({
        detail: pullDetail({ passport: 'pass', approvals: 1 }),
        entry: null,
        mergeError: REFUSAL,
      })?.cta
    ).toBe('Queue to merge');
    // Nothing to offer: the queue is not the obstacle.
    expect(mergeQueueOffer({ detail: pullDetail({ approvals: 1 }), entry: null })).toBeNull();
    expect(mergeQueueOffer({ detail: null, entry: null })).toBeNull();
  });

  it('says what the entry is doing once there is one', () => {
    const detail = pullDetail({ approvals: 1, blockers: STALE_BASE });
    expect(mergeQueueOffer({ detail, entry: entry({ state: 'building' }) })).toEqual({
      kind: 'building',
      state: 'building',
      line: 'In the merge queue: 3333333 is this head replayed onto main, and the gate is running on it.',
      cta: null,
    });
    // Stacked behind another queued pull request: its gate also covers #41.
    expect(mergeQueueOffer({ detail, entry: entry({ state: 'building', after: 41 }) })?.line).toBe(
      "In the merge queue: 3333333 is this head replayed onto #41's queue commit on main (it lands with or after #41), and the gate is running on it."
    );
    expect(
      mergeQueueOffer({ detail, entry: entry({ state: 'failed', reason: 'The gate failed twice.' }) })
    ).toEqual({
      kind: 'again',
      state: 'failed',
      line: 'The merge queue failed on this pull request. The gate failed twice.',
      cta: 'Queue again',
    });
    // Landed: the pull request is on its way to merged, so the strip is done.
    expect(mergeQueueOffer({ detail, entry: entry({ state: 'landed' }) })).toBeNull();
  });

  it('dates the replay gate from the last attempt, or from the enqueue', () => {
    expect(queueGateStartedAt(entry({ state: 'building' }))).toBe('2026-10-01T09:00:00Z');
    expect(
      queueGateStartedAt(
        entry({
          state: 'building',
          attempts: [
            { queue_sha: 'a', base_sha: 'b', conclusion: 'failure', at: '2026-10-01T09:05:00Z' },
            { queue_sha: 'c', base_sha: 'b', conclusion: null, at: '2026-10-01T09:30:00Z' },
          ],
        })
      )
    ).toBe('2026-10-01T09:30:00Z');
    expect(queueGateStartedAt(entry({ state: 'failed' }))).toBeNull();
    expect(queueGateStartedAt(null)).toBeNull();
  });

  it('waits for a gate runner until the forge says a gate reported on the queue commit', () => {
    const detail = pullDetail({ approvals: 1, blockers: STALE_BASE });
    const waiting = entry({ state: 'building', gate_started_at: null });
    expect(queueGateWaiting(waiting)).toBe(true);
    expect(queueGateStartedAt(waiting)).toBeNull();
    expect(mergeQueueOffer({ detail, entry: waiting })?.line).toBe(
      'In the merge queue: 3333333 is this head replayed onto main, waiting for a gate runner to pick it up.'
    );
    const running = entry({ state: 'building', gate_started_at: '2026-10-01T09:02:30Z' });
    expect(queueGateWaiting(running)).toBe(false);
    expect(queueGateStartedAt(running)).toBe('2026-10-01T09:02:30Z');
    expect(mergeQueueOffer({ detail, entry: running })?.line).toBe(
      'In the merge queue: 3333333 is this head replayed onto main, and the gate is running on it.'
    );
    // A forge that does not report it is never read as waiting.
    expect(queueGateWaiting(entry({ state: 'building' }))).toBe(false);
    expect(queueGateWaiting(entry({ state: 'failed', gate_started_at: null }))).toBe(false);
  });
});
