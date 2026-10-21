import { describe, expect, it } from 'vitest';

import { attentionBadge, personalAttention } from '../needsYou/needsYouModel';
import { attentionItem } from './pipelineTestData';
import type { AttentionResponse } from '../../api/types';

const data: AttentionResponse = {
  generated_at: '2026-10-21T00:00:00Z',
  counts: { critical: 1, action: 5, watch: 1 },
  families: [{ family: 'acme', subjects: { critical: 0, action: 100, watch: 0 } }],
  items: [
    attentionItem({ id: 'other', kind: 'todo_blocked', requested_by: 'bea' }),
    attentionItem({ id: 'assigned', kind: 'todo_blocked', requested_by: 'bea', assignee: 'ada' }),
    attentionItem({ id: 'filed', kind: 'todo_untriaged', requested_by: 'ada' }),
    attentionItem({ id: 'handoff', kind: 'todo_handoff', assignee: 'ada' }),
    attentionItem({ id: 'waiting', kind: 'todo_waiting_on_blocker', assignee: 'ada', severity: 'watch' }),
    attentionItem({ id: 'unrelated', kind: 'todo_untriaged', assignee: 'ada' }),
    attentionItem({ id: 'pr', kind: 'pr_checks_failing', severity: 'critical' }),
    attentionItem({ id: 'no-fields', kind: 'todo_blocked' }),
  ],
};

describe('personal attention', () => {
  it('keeps creator blocks and assigned blocked or handoff work, including watch rows', () => {
    const mine = personalAttention(data, 'ada');
    expect(mine?.items.map((item) => item.id)).toEqual(['assigned', 'filed', 'handoff', 'waiting']);
    expect(attentionBadge(mine)).toEqual({ count: 3, elsewhere: 0 });
    expect(data.items).toHaveLength(8);
  });

  it('counts one personal todo once when several causes describe it', () => {
    const mine = personalAttention({ ...data, items: [
      attentionItem({ id: 'block', kind: 'todo_blocked', todo_id: 'same', family: 'acme', requested_by: 'ada' }),
      attentionItem({ id: 'outcome', kind: 'todo_check_outcome', todo_id: 'same', family: 'acme', requested_by: 'ada' }),
    ] }, 'ada');
    expect(attentionBadge(mine)).toEqual({ count: 1, elsewhere: 0 });
  });

  it('uses canonical logins exactly and treats absent identity fields conservatively', () => {
    expect(personalAttention(data, undefined)?.items).toEqual([]);
    expect(personalAttention(data, 'Ada')?.items).toEqual([]);
    expect(personalAttention(undefined, 'ada')).toBeUndefined();
  });
});
