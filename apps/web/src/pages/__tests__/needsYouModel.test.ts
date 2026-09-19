import { describe, expect, it } from 'vitest';

import {
  attentionBadgeCount,
  findAttention,
  groupAttention,
  kindLabel,
  safeHref,
  severityOf,
  severityTone,
} from '../needsYou/needsYouModel';
import { ATTENTION, attentionItem } from './pipelineTestData';

describe('needsYouModel', () => {
  it('groups critical, action, watch in that order, oldest first, dropping empty groups', () => {
    const groups = groupAttention(ATTENTION.items);
    expect(groups.map((g) => g.severity)).toEqual(['critical', 'action', 'watch']);
    expect(groups[1].items.map((i) => i.kind)).toEqual(['release_staged', 'todo_blocked']);
    expect(groupAttention([attentionItem({ id: 'a', kind: 'x', severity: 'watch' })]).map((g) => g.severity)).toEqual([
      'watch',
    ]);
    expect(groupAttention([])).toEqual([]);
  });

  it('keeps an unknown severity visible under watch and sorts undated rows last', () => {
    expect(severityOf({ severity: 'mystery' })).toBe('watch');
    const groups = groupAttention([
      attentionItem({ id: 'b', kind: 'x', severity: 'mystery' }),
      attentionItem({ id: 'a', kind: 'x', severity: 'watch', since: '2026-09-19T00:00:00Z' }),
    ]);
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('paints critical and action red, watch amber', () => {
    expect(severityTone('critical')).toBe('danger');
    expect(severityTone('action')).toBe('danger');
    expect(severityTone('watch')).toBe('warning');
  });

  it('counts critical + action for the badge, falling back to the items', () => {
    expect(attentionBadgeCount(undefined)).toBe(0);
    expect(attentionBadgeCount(ATTENTION)).toBe(3);
    const noCounts = { ...ATTENTION, counts: undefined as never };
    expect(attentionBadgeCount(noCounts)).toBe(3);
  });

  it('labels kinds, finds items, and only follows app paths', () => {
    expect(kindLabel('todo_blocked')).toBe('todo blocked');
    expect(findAttention(ATTENTION, 'release_staged')?.action?.label).toBe('Deploy');
    expect(findAttention(undefined, 'release_staged')).toBeUndefined();
    expect(safeHref('/releases')).toBe('/releases');
    expect(safeHref('//evil.example')).toBeNull();
    expect(safeHref('https://evil.example')).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});
