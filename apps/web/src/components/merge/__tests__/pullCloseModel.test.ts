import { describe, expect, it } from 'vitest';

import type { PullRequestDetail } from '../../../api/types';
import {
  mayClosePull,
  pullStateAction,
  targetState,
  type PullCloseViewer,
} from '../pullCloseModel';

const SHA = 'abcdef1234567890abcdef1234567890abcdef12';

function detail(over: {
  state?: 'open' | 'closed' | 'merged';
  author?: string;
}): PullRequestDetail {
  return {
    summary: {
      repo: { id: 'r1', host: 'jeryu', owner: 'jeryu', name: 'jeryu-web' },
      number: 12,
      entity: { kind: 'pull_request', id: 'r1#12' },
      title: 'Stale shift work',
      author: over.author ?? '@author',
      head_ref: 'shift/stale',
      base_ref: 'main',
      head_sha: SHA,
      base_sha: SHA,
      state: over.state ?? 'open',
      draft: false,
      mergeable: {
        level: 'blocked',
        can_merge: false,
        reason: null,
        exact_head_sha: SHA,
        required_gate: null,
      },
      review: {
        required_approvals: 1,
        approvals: 0,
        changes_requested: 0,
        unresolved_threads: 0,
        user_review_state: null,
      },
      checks: { total: 0, passing: 0, failing: 0, pending: 0, skipped: 0 },
      agents: {
        active_sessions: 0,
        proposed_patches: 0,
        evidence_packets: 0,
        blockers: 0,
      },
      labels: [],
      updated_at: '2026-09-28T20:57:00Z',
      passport_hash: null,
      available_actions: [],
    },
    description: null,
    head_tree_sha: null,
    base_tree_sha: null,
    reviews: [],
    merge_passport: {
      status: 'blocked',
      head_sha: SHA,
      blockers: [],
      evaluated_at: '2026-09-28T20:57:00Z',
    },
    passport_hash: null,
  };
}

const AUTHOR: PullCloseViewer = { login: '@author', permissions: [] };
const BYSTANDER: PullCloseViewer = { login: '@someone', permissions: ['pr.read'] };
const ADMIN: PullCloseViewer = { login: '@admin', permissions: ['repo.admin'] };
const MAINTAINER: PullCloseViewer = { login: '@maint', permissions: ['pr.write'] };
const SIGNED_OUT: PullCloseViewer = { login: null, permissions: ['repo.admin'] };

describe('pull close model', () => {
  it('lets the author and a maintainer close, and nobody else', () => {
    const open = detail({});
    expect(mayClosePull(open, AUTHOR)).toBe(true);
    expect(mayClosePull(open, ADMIN)).toBe(true);
    expect(mayClosePull(open, MAINTAINER)).toBe(true);
    expect(mayClosePull(open, BYSTANDER)).toBe(false);
    expect(mayClosePull(open, SIGNED_OUT)).toBe(false);
  });

  it('matches the author whether or not the login carries the @ sigil', () => {
    const open = detail({ author: 'alton' });
    expect(mayClosePull(open, { login: '@alton', permissions: [] })).toBe(true);
    expect(mayClosePull(open, { login: 'Alton', permissions: [] })).toBe(true);
    expect(mayClosePull(detail({ author: '' }), { login: '', permissions: [] })).toBe(
      false
    );
  });

  it('offers Close on an open pull request and Reopen on a closed one', () => {
    expect(pullStateAction(detail({ state: 'open' }), AUTHOR)).toBe('close');
    expect(pullStateAction(detail({ state: 'closed' }), AUTHOR)).toBe('reopen');
  });

  it('offers nothing on a merged pull request, whoever is looking', () => {
    expect(pullStateAction(detail({ state: 'merged' }), AUTHOR)).toBeNull();
    expect(pullStateAction(detail({ state: 'merged' }), ADMIN)).toBeNull();
  });

  it('offers nothing to a viewer who may not close', () => {
    expect(pullStateAction(detail({ state: 'open' }), BYSTANDER)).toBeNull();
    expect(pullStateAction(detail({ state: 'closed' }), BYSTANDER)).toBeNull();
  });

  it('spells the state the forge expects', () => {
    expect(targetState('close')).toBe('closed');
    expect(targetState('reopen')).toBe('open');
  });
});
