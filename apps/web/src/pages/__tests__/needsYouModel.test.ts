import { describe, expect, it } from 'vitest';

import {
  attentionBadgeCount,
  attentionContext,
  primaryAction,
  systemPulse,
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

  it('reserves red for critical and action; watch stays neutral', () => {
    expect(severityTone('critical')).toBe('danger');
    expect(severityTone('action')).toBe('danger');
    expect(severityTone('watch')).toBe('neutral');
  });

  it('gives each row exactly one action: the command when there is one, else the link', () => {
    const staged = findAttention(ATTENTION, 'release_staged')!;
    expect(primaryAction(staged)).toEqual({
      type: 'command',
      label: 'Deploy',
      command: staged.action!.command,
    });
    const blocked = findAttention(ATTENTION, 'todo_blocked')!;
    expect(primaryAction(blocked)).toEqual({ type: 'link', label: 'Open', to: blocked.href });
    expect(primaryAction(attentionItem({ id: 'x', kind: 'y', href: 'https://evil.example' }))).toBeNull();
  });

  it('never shows a raw kind', () => {
    expect(kindLabel('todo_blocked')).toBe('Blocked todo');
    expect(kindLabel('release_staged')).toBe('Release ready to deploy');
    expect(kindLabel('some_new.kind')).toBe('Some new kind');
    expect(kindLabel('')).toBe('Needs attention');
    expect(
      attentionContext(attentionItem({ id: 'p', kind: 'pr_checks_failing', family: 'jeryu', repo: 'jeryu/jeryu-web', pr: 35 }))
    ).toBe('Checks failing · jeryu · jeryu/jeryu-web#35');
  });

  it('describes what the system is doing in one line, skipping parts with no data', () => {
    const ago = (): string => '3m ago';
    expect(systemPulse({}, ago)).toBe('');
    expect(
      systemPulse(
        {
          workers: [
            { healthy: true, state: 'working', slot: 'w1' },
            { healthy: true, state: 'idle', slot: 'w2' },
            { healthy: true, state: 'idle', slot: 'supervisor' },
            { healthy: false, state: 'working', slot: 'w3' },
          ],
          runners: { onlineRunners: 6, busyRunners: 1 },
          lastEvent: { ts: 'x', summary: 'Merged jeryu/jeryu-web#35' },
        },
        ago
      )
    ).toBe('1 of 2 worker slots busy · 1 of 6 gate runners busy · last event 3m ago: Merged jeryu/jeryu-web#35');
    expect(systemPulse({ workers: [{ healthy: true, state: 'idle', slot: 'w1' }] }, ago)).toBe(
      '0 of 1 worker slot busy'
    );
  });

  it('counts critical + action for the badge, falling back to the items', () => {
    expect(attentionBadgeCount(undefined)).toBe(0);
    expect(attentionBadgeCount(ATTENTION)).toBe(3);
    const noCounts = { ...ATTENTION, counts: undefined as never };
    expect(attentionBadgeCount(noCounts)).toBe(3);
  });

  it('labels kinds, finds items, and only follows app paths', () => {
    expect(findAttention(ATTENTION, 'release_staged')?.action?.label).toBe('Deploy');
    expect(findAttention(undefined, 'release_staged')).toBeUndefined();
    expect(safeHref('/releases')).toBe('/releases');
    expect(safeHref('//evil.example')).toBeNull();
    expect(safeHref('https://evil.example')).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});
