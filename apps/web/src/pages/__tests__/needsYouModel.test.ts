import { describe, expect, it } from 'vitest';

import {
  FORGE_FAMILY,
  acknowledgeTarget,
  familyCounts,
  familyName,
  familyOf,
  filterByFamily,
  alsoLine,
  attentionSubjects,
  groupSubjects,
  kindRank,
  subjectKey,
  areaBadgeCount,
  attentionArea,
  attentionBadgeCount,
  attentionAbout,
  attentionContext,
  apiMethod,
  commandPlace,
  primaryAction,
  rowDetail,
  safeApiPath,
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
import { ATTENTION, REVIEW_HOLD, attentionItem } from './pipelineTestData';

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

  it('is one row with one act for the three items of one review hold', () => {
    const subjects = attentionSubjects(REVIEW_HOLD);
    expect(subjects).toHaveLength(1);
    const [subject] = subjects;
    expect(subject.key).toBe('pr:acme/widgets#7');
    // The reviewer that could not finish acts; the rest are the row's context.
    expect(subject.primary.kind).toBe('reviewer_stuck');
    expect(subject.also.map((item) => item.kind)).toEqual([
      'pr_changes_requested',
      'queue_failed',
    ]);
    // The worst severity among them, and the oldest of their dates.
    expect(subject.severity).toBe('critical');
    expect(subject.since).toBe('2026-10-03T08:00:00Z');
    // One section, one row.
    const groups = groupSubjects(REVIEW_HOLD);
    expect(groups.map((group) => [group.severity, group.subjects.length])).toEqual([
      ['critical', 1],
    ]);
  });

  it('names a row by its pull request, else its todo, else its shift, else the item', () => {
    expect(subjectKey(attentionItem({ id: 'a', kind: 'x', repo: 'acme/widgets', pr: 7 }))).toBe(
      'pr:acme/widgets#7'
    );
    // A pull request row of the same family is not the family's todo row.
    expect(
      subjectKey(attentionItem({ id: 'b', kind: 'x', family: 'acme-split', todo_id: '20261003-1' }))
    ).toBe('todo:acme:20261003-1');
    expect(
      subjectKey(attentionItem({ id: 'c', kind: 'x', family: 'acme', shift: 'nightshift/2026-10-03' }))
    ).toBe('shift:acme:nightshift/2026-10-03');
    expect(subjectKey(attentionItem({ id: 'd', kind: 'x' }))).toBe('item:d');
    // A repository with no pull request number is not a subject of its own:
    // two release rows on one repository stay two rows.
    expect(subjectKey(attentionItem({ id: 'e', kind: 'x', repo: 'acme/widgets' }))).toBe('item:e');
  });

  it('leaves the rows of unrelated subjects alone, worst and oldest first', () => {
    const subjects = attentionSubjects(ATTENTION.items);
    expect(subjects.map((subject) => subject.primary.id)).toEqual([
      'workers_down:jain',
      'release_staged:jeryu/jeryu-deploy',
      'todo-blocked:jeryu:20260919-130515-f8cc66',
      'todo-stuck:jeryu:20260919-1',
    ]);
    expect(subjects.every((subject) => subject.also.length === 0)).toBe(true);
  });

  it('ranks a kind it does not know last, so it is context beside a known act', () => {
    expect(kindRank('reviewer_stuck')).toBeLessThan(kindRank('pr_ready_to_merge'));
    expect(kindRank('pr_ready_to_merge')).toBeLessThan(kindRank('pr_invented_kind'));
    const [subject] = attentionSubjects([
      attentionItem({ id: 'new', kind: 'pr_invented_kind', severity: 'critical', repo: 'acme/widgets', pr: 7 }),
      ...REVIEW_HOLD,
    ]);
    expect(subject.primary.kind).toBe('reviewer_stuck');
    expect(subject.also.map((item) => item.kind)).toContain('pr_invented_kind');
  });

  it('words an "also" line as what it is, what it wants, and where to go', () => {
    expect(alsoLine(REVIEW_HOLD[0])).toEqual({
      label: 'Changes requested',
      detail: 'Push a fix, or dismiss the review: open /repos/jeryu/acme/widgets/pulls/7',
      to: '/repos/jeryu/acme/widgets/pulls/7',
    });
    expect(alsoLine(attentionItem({ id: 'z', kind: 'pin_behind', href: 'https://evil.example' }))).toEqual({
      label: 'Merged, not pinned for release',
      detail: 'z',
      to: null,
    });
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

  it('prefers the call the forge can make itself, and words a confirmation for it', () => {
    const queued = attentionItem({
      id: 'queue_failed:acme/web:7',
      kind: 'queue_failed',
      href: '/repos/jeryu/acme/web/pulls/7',
      action: {
        label: 'Queue again',
        command: 'gh pr merge 7',
        api: { path: '/api/v1/repos/jeryu:acme%2Fweb/pulls/7/queue' },
      },
    });
    expect(primaryAction(queued)).toEqual({
      type: 'api',
      label: 'Queue again',
      method: 'POST',
      path: '/api/v1/repos/jeryu:acme%2Fweb/pulls/7/queue',
      body: undefined,
      confirm: 'Queue again now? The forge acts straight away.',
    });
    // The server's own sentence wins when it sends one.
    const spoken = attentionItem({
      id: 'q2',
      kind: 'queue_failed',
      action: {
        label: 'Leave the queue',
        command: null,
        api: {
          method: 'delete',
          path: '/api/v1/repos/acme/pulls/7/queue',
          body: { reason: 'rebasing by hand' },
          confirm: 'Take acme/web#7 out of the merge queue?',
        },
      },
    });
    expect(primaryAction(spoken)).toEqual({
      type: 'api',
      label: 'Leave the queue',
      method: 'DELETE',
      path: '/api/v1/repos/acme/pulls/7/queue',
      body: { reason: 'rebasing by hand' },
      confirm: 'Take acme/web#7 out of the merge queue?',
    });
  });

  it('offers no button for a call it cannot make: off-origin, outside the API, or another method', () => {
    const api = (over: Record<string, unknown>): ReturnType<typeof attentionItem> =>
      attentionItem({
        id: 'x',
        kind: 'queue_failed',
        href: '/repos/jeryu/acme/web/pulls/7',
        action: { label: 'Queue again', command: null, api: { path: '/api/v1/ok', ...over } },
      });
    expect(safeApiPath('https://evil.example/api/v1/x')).toBeNull();
    expect(safeApiPath('//evil.example/api/v1/x')).toBeNull();
    expect(safeApiPath('/work/shift')).toBeNull();
    expect(safeApiPath(' /api/v1/ok ')).toBe('/api/v1/ok');
    expect(safeApiPath(undefined)).toBeNull();
    expect(apiMethod(undefined)).toBe('POST');
    expect(apiMethod('post')).toBe('POST');
    expect(apiMethod('PATCH')).toBeNull();
    // Each of these falls back to the row's link rather than lying about an act.
    for (const over of [{ path: '//evil.example/x' }, { path: '/work/shift' }, { method: 'PATCH' }]) {
      expect(primaryAction(api(over))).toEqual({
        type: 'link',
        label: 'Queue again',
        to: '/repos/jeryu/acme/web/pulls/7',
      });
    }
  });

  it('reads the second line as the next step, keeping the reason as the tooltip', () => {
    expect(
      rowDetail({ next_step: 'Deploy: on xbabe0, run `deploy.sh`', reason: 'Production is 3 commits behind.' })
    ).toEqual({
      text: 'Deploy: on xbabe0, run `deploy.sh`',
      title: 'Production is 3 commits behind.',
    });
    // A server that predates `next_step`, or sent it blank: the reason is the line.
    expect(rowDetail({ next_step: '  ', reason: 'Checks are failing.' })).toEqual({
      text: 'Checks are failing.',
      title: 'Checks are failing.',
    });
    expect(rowDetail({ next_step: null, reason: null })).toBeNull();
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
    expect(kindLabel('pr_draft_waiting')).toBe('Draft waiting to be marked ready');
    expect(kindLabel('shift_budget_spent')).toBe('Shift budget spent');
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
    expect(attentionArea('shift_budget_spent')).toBe('work');
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

describe('acknowledgeTarget', () => {
  it('is the todo behind the row, and nothing when the row is not about one', () => {
    expect(acknowledgeTarget({ family: 'jeryu', todo_id: '20260919-1' })).toEqual({
      family: 'jeryu',
      id: '20260919-1',
    });
    expect(acknowledgeTarget({ family: 'jeryu', todo_id: null })).toBeNull();
    expect(acknowledgeTarget({ family: null, todo_id: '20260919-1' })).toBeNull();
    expect(acknowledgeTarget({ family: ' ', todo_id: ' ' })).toBeNull();
  });
});

describe('attentionAbout', () => {
  const rows = {
    schema_version: 1,
    generated_at: '2026-09-19T09:00:00Z',
    counts: { critical: 0, action: 3, watch: 1 },
    items: [
      attentionItem({ id: 'blocked', kind: 'todo_blocked', todo_id: '20260919-1' }),
      attentionItem({ id: 'queue', kind: 'queue_failed', repo: 'acme/web', pr: 7 }),
      attentionItem({ id: 'other-pr', kind: 'pr_checks_failing', repo: 'globex/api', pr: 7 }),
      attentionItem({ id: 'calm', kind: 'todo_stuck_claim', severity: 'watch', todo_id: '20260919-1' }),
    ],
  };

  it('finds the rows about one todo, and leaves the calm ones out', () => {
    expect(attentionAbout(rows, { todoId: '20260919-1' }).map((s) => s.primary.id)).toEqual([
      'blocked',
    ]);
  });

  it('finds the rows about one pull request, not another repo at the same number', () => {
    expect(attentionAbout(rows, { repo: 'acme/web', pr: 7 }).map((s) => s.primary.id)).toEqual([
      'queue',
    ]);
    expect(attentionAbout(rows, { repo: 'web', pr: '7' }).map((s) => s.primary.id)).toEqual([
      'queue',
    ]);
    expect(attentionAbout(rows, { repo: 'acme/web', pr: 8 })).toEqual([]);
  });

  it('is one row for a pull request that raised several items at once', () => {
    const both = {
      ...rows,
      items: [
        attentionItem({ id: 'queue', kind: 'queue_failed', repo: 'acme/web', pr: 7 }),
        attentionItem({ id: 'hold', kind: 'reviewer_stuck', repo: 'acme/web', pr: 7 }),
      ],
    };
    const [subject, ...rest] = attentionAbout(both, { repo: 'acme/web', pr: 7 });
    expect(rest).toEqual([]);
    expect(subject.primary.id).toBe('hold');
    expect(subject.also.map((i) => i.id)).toEqual(['queue']);
  });

  it('matches nothing when the subject names neither a todo nor a pull request', () => {
    expect(attentionAbout(rows, { repo: 'acme/web' })).toEqual([]);
    expect(attentionAbout(undefined, { todoId: '20260919-1' })).toEqual([]);
  });
});
