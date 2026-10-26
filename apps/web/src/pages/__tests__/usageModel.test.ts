// usageModel.test.ts — the token usage an Activity row carries: read from a
// finished attempt's `detail.usage`, worded short on the row and in full in
// its title, and nothing at all when the producer reported no counts.

import { describe, expect, it } from 'vitest';

import { attemptUsage, attemptUsageText, attemptUsageTitle } from '../activity/usageModel';
import { pipelineEvent } from './pipelineTestData';

const finished = (usage: unknown) =>
  pipelineEvent({ seq: 1, kind: 'todo.attempt_finished', detail: { usage } });

describe('attempt usage', () => {
  it('reads the counts an attempt reported, a missing one as 0', () => {
    const tokens = attemptUsage(
      finished({ input_tokens: 1200, output_tokens: 1400, cache_read_tokens: 17_000 })
    );
    expect(tokens).toEqual({ input: 1200, output: 1400, cacheRead: 17_000, cacheWrite: 0, total: 19_600 });
    expect(attemptUsageText(tokens!)).toBe('18.2k in · 1.4k out');
    expect(attemptUsageTitle(tokens!)).toBe(
      '1,200 input, 1,400 output, 17,000 read from cache, 0 written to cache'
    );
  });

  it('is no usage, not zero, when the producer sent no counts or no object', () => {
    for (const usage of [undefined, null, 'lots', [1, 2], {}, { input_tokens: -1 }]) {
      expect(attemptUsage(finished(usage))).toBeNull();
    }
  });
});
