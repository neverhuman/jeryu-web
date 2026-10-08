// mergeQueueModel.ts — what became of this pull request's merge queue entry.
//
// The queue only ever lands a commit that passed the gate, so an entry that
// failed its gate twice, or that left the queue because the replay could not
// be built, waits on a person: somebody rebases or simply queues it again on
// the head that is there now. These are the pure rules; the page renders them.
//
// A pull request that was never queued needs the same offer: when its head is
// behind the base, a direct merge is refused (the replay onto the base tip is
// a commit no gate has run on), and the queue is the only way to land it.

import type {
  MergePassportBlocker,
  PullRequestDetail,
  QueueEntry,
  RepoMergeQueueResponse,
} from '../../api/types';
import { approvalsSatisfied, isSettled } from './pullReviewModel';

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

/**
 * A head that is behind its base: either the Passport's own stale-base gate,
 * or the forge's mergeability gate reporting `behind`.
 */
function behindBaseBlocker(blocker: MergePassportBlocker): boolean {
  if (blocker.code === 'passport_blocked_stale_base') return true;
  return (
    blocker.code === 'passport_blocked_mergeability' &&
    (blocker.details ?? '').trim().toLowerCase() === 'behind'
  );
}

/**
 * Green, approved, and the only thing left is that the base moved. A direct
 * merge is refused on a base that wants linear history, because the replay of
 * this head onto the base tip is a commit no gate has run on yet.
 */
export function readyButBehindBase(detail: PullRequestDetail): boolean {
  if (isSettled(detail)) return false;
  const blockers = detail.merge_passport.blockers;
  return (
    approvalsSatisfied(detail.summary.review) &&
    blockers.length > 0 &&
    blockers.every(behindBaseBlocker)
  );
}

/** A merge refusal that names the queue as the way to land this head. */
export function refusalAsksForQueue(message: string | null | undefined): boolean {
  return /queue the pull request/i.test(message ?? '');
}

/** What the merge queue offers this pull request right now. */
export interface MergeQueueOffer {
  /**
   * `queue` — never queued, and the queue is the way to land it; `again` — the
   * entry failed or left the queue; `building` — the replay is being gated.
   */
  kind: 'queue' | 'again' | 'building';
  /** The entry's state, when there is an entry. */
  state: QueueEntry['state'] | null;
  /** One sentence: what is happening, and why the queue is the answer. */
  line: string;
  /** The button's words; null while there is nothing to press. */
  cta: string | null;
}

/** Where the replay gate started, so the page can show its progress. */
export function queueGateStartedAt(entry: QueueEntry | null): string | null {
  if (!entry || entry.state !== 'building') return null;
  const attempts = entry.attempts ?? [];
  return attempts[attempts.length - 1]?.at ?? entry.enqueued_at;
}

/**
 * The one act the merge queue offers. A pull request that was never queued
 * gets the offer too: without it a reader whose merge was refused for the
 * base having moved has nothing on the page to press.
 */
export function mergeQueueOffer(input: {
  detail: PullRequestDetail | null | undefined;
  entry: QueueEntry | null;
  /** The forge's last merge refusal, verbatim. */
  mergeError?: string | null;
}): MergeQueueOffer | null {
  const again = queueAgainOffer(input.entry);
  if (again) {
    return { kind: 'again', state: again.state, line: again.line, cta: 'Queue again' };
  }
  const entry = input.entry;
  if (entry) {
    if (entry.state !== 'building') return null;
    return {
      kind: 'building',
      state: 'building',
      line: `In the merge queue: ${entry.queue_sha.slice(0, 7)} is this head replayed onto ${entry.base}, and the gate is running on it.`,
      cta: null,
    };
  }
  const detail = input.detail;
  if (!detail || isSettled(detail)) return null;
  if (!readyButBehindBase(detail) && !refusalAsksForQueue(input.mergeError)) {
    return null;
  }
  const base = detail.summary.base_ref;
  return {
    kind: 'queue',
    state: null,
    line: `${base} moved since this was gated; the queue replays it onto ${base}, gates that commit, then lands it`,
    cta: 'Queue to merge',
  };
}
