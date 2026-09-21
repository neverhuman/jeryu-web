// mergeAttemptModel.test.ts — the PR page names why an approved PR has not merged.

import { describe, expect, it } from 'vitest';

import { mergeAttemptLine } from '../mergeAttemptModel';

const base = {
  repo: 'veox-ai/ai-veox-app',
  number: 6,
  attempt: null,
  blockedReason: null,
  grantGap: null,
  approvedBy: ['pr-redteam'],
};

describe('mergeAttemptLine', () => {
  it('names the approver and the forge refusal', () => {
    expect(
      mergeAttemptLine({
        ...base,
        attempt: {
          result: 'refused',
          status: 409,
          code: 'queue_merge_commits',
          message: 'rebase onto main',
          at: '2026-09-21T16:00:00Z',
        },
        blockedReason: 'queue_merge_commits - rebase onto main',
      })
    ).toBe('pr-redteam approved; merge refused: queue_merge_commits - rebase onto main');
  });

  it('flags a missing merge grant before any attempt', () => {
    expect(
      mergeAttemptLine({
        ...base,
        grantGap: {
          repo: 'veox-ai/ai-veox-app',
          identity: 'jain-merge-bot',
          message: 'jain-merge-bot has no write grant on veox-ai/ai-veox-app; its merges answer 403',
        },
      })
    ).toBe(
      'pr-redteam approved; merge will be refused: jain-merge-bot has no write grant on veox-ai/ai-veox-app; its merges answer 403'
    );
  });

  it('says nothing when nothing blocks the merge', () => {
    expect(mergeAttemptLine(base)).toBeNull();
    expect(mergeAttemptLine(undefined)).toBeNull();
  });
});
