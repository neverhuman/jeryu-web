// mergeQueue.ts — hand-written wire types for the merge queue
// (`jeryu-deploy/docs/merge-queue.md`).
//
// An approved pull request whose only obstacle is that the base moved joins
// the queue; the forge replays it onto the base tip and the gate runner gates
// that exact commit. JSON is snake_case, like the rest of the v1 API.

/** Where one entry stands. An unknown state is read as nothing to offer. */
export type QueueEntryState = 'building' | 'landed' | 'failed' | 'dequeued';

export interface QueueAttempt {
  queue_sha: string;
  base_sha: string;
  /** `success`, `failure`, or null while the gate is still running. */
  conclusion?: string | null;
  at: string;
}

export interface QueueEntry {
  /** `owner/name`. */
  repo: string;
  base: string;
  number: number;
  pr_head_sha: string;
  base_sha: string;
  queue_ref: string;
  queue_sha: string;
  state: QueueEntryState | string;
  enqueued_at: string;
  enqueued_by: string;
  attempts?: QueueAttempt[];
  /** Why it failed or left the queue; null while it is building. */
  reason?: string | null;
  landed_sha?: string | null;
}

/** `GET /api/v1/repos/{id}/merge-queue`. */
export interface RepoMergeQueueResponse {
  entries: QueueEntry[];
}
