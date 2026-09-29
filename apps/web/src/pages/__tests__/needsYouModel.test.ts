import { describe, expect, it } from 'vitest';

import {
  FORGE_FAMILY,
  familyCounts,
  familyName,
  familyOf,
  filterByFamily,
  areaBadgeCount,
  attentionArea,
  attentionBadgeCount,
  attentionContext,
  commandPlace,
  primaryAction,
  systemPulse,
  findAttention,
  groupAttention,
  kindLabel,
  needsYouHref,
  repoFamilyMap,
  safeHref,
  severityOf,
  urgentAttention,
  severityTone,
  urgentInArea,
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
      where: 'Run on xbabe0, in a jeryu/jeryu-deploy checkout',
    });
    const blocked = findAttention(ATTENTION, 'todo_blocked')!;
    expect(primaryAction(blocked)).toEqual({ type: 'link', label: 'Open', to: blocked.href });
    expect(primaryAction(attentionItem({ id: 'x', kind: 'y', href: 'https://evil.example' }))).toBeNull();
  });

  it('says where a command runs: the server\'s place, else a checkout of the repository, else nothing', () => {
    const command = 'systemctl --user start jeryu-auto-pin.service';
    const item = (action: { run_in?: string | null }, repo: string | null): ReturnType<typeof attentionItem> =>
      attentionItem({ id: 'x', kind: 'pin_behind', repo, action: { label: 'Run', command, ...action } });
    expect(commandPlace(item({ run_in: 'xbabe0, any directory' }, 'jeryu/jeryu-deploy'))).toBe(
      'Run on xbabe0, any directory'
    );
    // A server that predates `run_in`, or sent it blank: the repository is the hint.
    expect(commandPlace(item({}, 'jeryu/jeryu-deploy'))).toBe('Run in a checkout of jeryu/jeryu-deploy');
    expect(commandPlace(item({ run_in: ' ' }, 'jeryu/jeryu-deploy'))).toBe(
      'Run in a checkout of jeryu/jeryu-deploy'
    );
    expect(commandPlace(item({ run_in: null }, null))).toBeNull();
    expect(commandPlace(attentionItem({ id: 'y', kind: 'z' }))).toBeNull();
    expect(primaryAction(item({}, null))).toEqual({ type: 'command', label: 'Run', command, where: null });
  });

  it('never shows a raw kind', () => {
    expect(kindLabel('todo_blocked')).toBe('Blocked todo');
    expect(kindLabel('release_staged')).toBe('Release ready to deploy');
    expect(kindLabel('pin_behind')).toBe('Merged, not pinned for release');
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

  it('finds the family of an item: what the server says, else its repository, else the forge', () => {
    const repoFamilies = new Map([
      ['veox-ai/ai-veox-app', 'veox-ai'],
      ['jeryu/jeryu-deploy', 'jeryu-split'],
    ]);
    expect(familyName('jeryu-split')).toBe('jeryu');
    expect(familyName('  ')).toBeNull();
    expect(familyOf({ family: 'jain', repo: null }, repoFamilies)).toBe('jain');
    expect(familyOf({ family: null, repo: 'veox-ai/ai-veox-app' }, repoFamilies)).toBe('veox-ai');
    // The repositories list calls it jeryu-split, the shift queue calls it jeryu: one family.
    expect(familyOf({ family: null, repo: 'jeryu/jeryu-deploy' }, repoFamilies)).toBe('jeryu');
    expect(familyOf({ family: null, repo: 'nobody/knows' }, repoFamilies)).toBe(FORGE_FAMILY);
    expect(familyOf({ family: null, repo: null }, repoFamilies)).toBe(FORGE_FAMILY);
  });

  it('counts families busiest first with the forge last, and filters to one', () => {
    const repoFamilies = new Map([['veox-ai/ai-veox-app', 'veox-ai']]);
    const items = [
      { family: 'jeryu', repo: null },
      { family: 'jeryu', repo: null },
      { family: null, repo: 'veox-ai/ai-veox-app' },
      { family: null, repo: null },
      { family: null, repo: null },
      { family: null, repo: null },
    ];
    expect(familyCounts(items, repoFamilies)).toEqual([
      { family: 'jeryu', count: 2 },
      { family: 'veox-ai', count: 1 },
      { family: FORGE_FAMILY, count: 3 },
    ]);
    expect(filterByFamily(items, 'jeryu', repoFamilies)).toHaveLength(2);
    expect(filterByFamily(items, FORGE_FAMILY, repoFamilies)).toHaveLength(3);
    expect(filterByFamily(items, '', repoFamilies)).toHaveLength(6);
  });

  it('files each kind under the page where its cause lives', () => {
    expect(attentionArea('todo_blocked')).toBe('work');
    expect(attentionArea('shift_without_pr')).toBe('work');
    expect(attentionArea('pr_checks_failing')).toBe('pulls');
    expect(attentionArea('queue_failed')).toBe('pulls');
    expect(attentionArea('reviewer_stuck')).toBe('pulls');
    expect(attentionArea('release_staged')).toBe('releases');
    expect(attentionArea('deploy_failed')).toBe('releases');
    expect(attentionArea('pin_behind')).toBe('releases');
    expect(attentionArea('gate_runner_down')).toBe('system');
    expect(attentionArea('workers_down')).toBe('system');
    expect(attentionArea('something_new')).toBeNull();
  });

  it('counts only critical + action rows per page, and the pages add up to the badge', () => {
    expect(areaBadgeCount(ATTENTION, 'work')).toBe(1);
    expect(areaBadgeCount(ATTENTION, 'releases')).toBe(1);
    expect(areaBadgeCount(ATTENTION, 'system')).toBe(1);
    expect(areaBadgeCount(ATTENTION, 'pulls')).toBe(0);
    expect(areaBadgeCount(undefined, 'work')).toBe(0);
    const total = (['work', 'pulls', 'releases', 'system'] as const)
      .map((area) => areaBadgeCount(ATTENTION, area))
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(attentionBadgeCount(ATTENTION));
  });

  it('lists a page\'s rows critical first, never a watch row', () => {
    const rows = urgentInArea(
      {
        ...ATTENTION,
        items: [
          attentionItem({ id: 'w', kind: 'pr_awaiting_approval', severity: 'watch' }),
          attentionItem({ id: 'a', kind: 'pr_ready_to_merge', severity: 'action' }),
          attentionItem({ id: 'c', kind: 'pr_checks_failing', severity: 'critical' }),
        ],
      },
      'pulls'
    );
    expect(rows.map((row) => row.id)).toEqual(['c', 'a']);
  });

  it('hands the other surfaces one set and one link', () => {
    // The rows Needs you shows in red: the `watch` claim on 20260919-1 is not one.
    expect(urgentAttention(ATTENTION).map((item) => item.kind)).toEqual([
      'release_staged',
      'todo_blocked',
      'workers_down',
    ]);
    expect(urgentAttention(undefined)).toEqual([]);
    expect(needsYouHref()).toBe('/needs-you');
    expect(needsYouHref('')).toBe('/needs-you');
    // The queue calls it jeryu, the repositories list jeryu-split: one link.
    expect(needsYouHref('jeryu-split')).toBe('/needs-you?family=jeryu');
    expect(needsYouHref('a b')).toBe('/needs-you?family=a%20b');
    expect([
      ...repoFamilyMap([
        { id: { owner: 'jeryu', name: 'jeryu-deploy' }, family: 'jeryu-split' },
        { id: { owner: 'jeryu', name: 'orphan' }, family: null },
      ]),
    ]).toEqual([['jeryu/jeryu-deploy', 'jeryu-split']]);
  });
});
