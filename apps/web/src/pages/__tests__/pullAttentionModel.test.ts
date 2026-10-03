import { describe, expect, it } from 'vitest';

import { attentionByPull, attentionOffRows, pullAttentionKey } from '../pullAttentionModel';
import { attentionItem } from './pipelineTestData';

describe('pull request attention', () => {
  const checks = attentionItem({ id: 'a', kind: 'pr_checks_failing', repo: 'acme/widgets', pr: 3 });
  const review = attentionItem({ id: 'b', kind: 'pr_review_requested', repo: 'acme/widgets', pr: 3 });
  const other = attentionItem({ id: 'c', kind: 'pr_checks_failing', repo: 'globex/site', pr: 3 });
  const reviewer = attentionItem({ id: 'd', kind: 'reviewer_down', repo: null, pr: null });

  it('files every item under the one pull request it names', () => {
    const byPull = attentionByPull([checks, review, other, reviewer]);
    expect([...byPull.keys()]).toEqual(['acme/widgets#3', 'globex/site#3']);
    expect(byPull.get(pullAttentionKey('acme/widgets', 3))?.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('keeps what no shown row carries: no pull request, or one not on the page', () => {
    const shown = new Set([pullAttentionKey('acme/widgets', 3)]);
    expect(attentionOffRows([checks, review, other, reviewer], shown).map((item) => item.id)).toEqual([
      'c',
      'd',
    ]);
  });
});
