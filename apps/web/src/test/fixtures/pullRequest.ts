// pullRequest.ts — one `PullRequestDetail`, built for a test to bend.
//
// The merge box, the checklist model and the page all read the same detail
// shape, so they share one factory rather than three drifting copies.

import type {
  PullRequestChecks,
  PullRequestDetail,
  PullRequestReview,
  ReviewThread,
} from '../../api/types';

export const HEAD_SHA = 'abcdef1234567890abcdef1234567890abcdef12';

export interface PullDetailOverrides {
  passport?: 'pass' | 'blocked';
  can_merge?: boolean;
  approvals?: number;
  required_approvals?: number;
  changes_requested?: number;
  unresolved_threads?: number;
  user_review_state?: string | null;
  passport_hash?: string | null;
  state?: 'open' | 'closed' | 'merged';
  author?: string;
  draft?: boolean;
  description?: string | null;
  reviews?: PullRequestReview[];
  blockers?: PullRequestDetail['merge_passport']['blockers'];
}

export function pullDetail(over: PullDetailOverrides = {}): PullRequestDetail {
  const passport = over.passport ?? 'blocked';
  const canMerge = over.can_merge ?? passport === 'pass';
  return {
    summary: {
      repo: { id: 'r1', host: 'acme', owner: 'acme', name: 'widget-api' },
      number: 32,
      entity: { kind: 'pull_request', id: 'r1#32' },
      title: 'Teach the login route to say why',
      author: over.author ?? '@dana',
      head_ref: 'feature/login',
      base_ref: 'main',
      head_sha: HEAD_SHA,
      base_sha: 'base000000000000000000000000000000000000',
      state: over.state ?? 'open',
      draft: over.draft ?? false,
      mergeable: {
        level: canMerge ? 'mergeable' : 'blocked',
        can_merge: canMerge,
        reason: canMerge ? null : 'the Passport has not cleared this head',
        exact_head_sha: HEAD_SHA,
        required_gate: canMerge ? null : 'passport',
      },
      review: {
        required_approvals: over.required_approvals ?? 1,
        approvals: over.approvals ?? 0,
        changes_requested: over.changes_requested ?? 0,
        unresolved_threads: over.unresolved_threads ?? 0,
        user_review_state: over.user_review_state ?? null,
      },
      checks: { total: 1, passing: 1, failing: 0, pending: 0, skipped: 0 },
      agents: {
        active_sessions: 0,
        proposed_patches: 0,
        evidence_packets: 0,
        blockers: 0,
      },
      labels: [],
      updated_at: '2026-05-26T00:00:00Z',
      passport_hash: over.passport_hash ?? 'hash-1',
      available_actions: [],
    },
    description: over.description ?? null,
    head_tree_sha: null,
    base_tree_sha: null,
    reviews: over.reviews ?? [],
    merge_passport: {
      status: passport,
      head_sha: HEAD_SHA,
      blockers:
        over.blockers ??
        (passport === 'blocked'
          ? [
              {
                code: 'passport_blocked_approvals',
                message: 'Approvals not met.',
                details: null,
              },
            ]
          : []),
      evaluated_at: '2026-05-26T00:00:00Z',
    },
    passport_hash: over.passport_hash ?? 'hash-1',
  };
}

export function approvalRow(
  over: Partial<PullRequestReview> = {}
): PullRequestReview {
  return {
    id: 'rev-1',
    author: '@red-team',
    state: 'approved',
    body_markdown: null,
    submitted_at: '2026-05-26T00:00:00Z',
    head_sha: HEAD_SHA,
    dismissed_review_id: null,
    effective: true,
    stale: false,
    ...over,
  };
}

/** The checks of a head: one required check, failing unless told otherwise. */
export function pullChecks(
  over: Partial<PullRequestChecks> & { requiredFailing?: boolean } = {}
): PullRequestChecks {
  const failing = over.requiredFailing ?? false;
  return {
    total: 1,
    passing: failing ? 0 : 1,
    failing: failing ? 1 : 0,
    pending: 0,
    skipped: 0,
    checks: [
      {
        id: 'check-1',
        name: 'acme/required',
        kind: 'status',
        status: failing ? 'failure' : 'success',
        conclusion: failing ? 'failure' : 'success',
        details_url: null,
        description: failing ? 'cargo test failed' : null,
        required: true,
        advisory: null,
        started_at: '2026-05-26T00:00:00Z',
        completed_at: '2026-05-26T00:01:00Z',
      },
    ],
    ...over,
  };
}

/** One review thread, anchored to a file by default. */
export function reviewThread(over: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: 'thread-1',
    repo: { id: 'r1', host: 'acme', owner: 'acme', name: 'widget-api' },
    pr_number: 32,
    resolved: false,
    file_path: 'src/login.rs',
    line: 42,
    anchor_sha: HEAD_SHA,
    comments: [
      {
        id: 'comment-1',
        author: '@red-team',
        body_markdown: 'This branch swallows the error; say why it failed.',
        body_html: null,
        created_at: '2026-05-26T00:00:00Z',
        edited_at: null,
        suggestion: null,
        evidence: null,
      },
    ],
    created_at: '2026-05-26T00:00:00Z',
    updated_at: '2026-05-26T00:00:00Z',
    ...over,
  };
}
