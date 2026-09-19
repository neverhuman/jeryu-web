import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_CHIPS,
  activeChip,
  activityHref,
  applyChip,
  eventLabel,
  eventLinks,
  eventTone,
  filtersToQuery,
  formatClock,
  formatSeconds,
  hasActiveFilters,
  hasMoreFilters,
  isWallMode,
  maxSeq,
  mergeEvents,
  minSeq,
  parseActivityFilters,
  primaryLink,
  summaryParts,
  wallCounters,
} from '../activity/activityModel';
import { EVENTS, pipelineEvent } from './pipelineTestData';

describe('activityModel', () => {
  it('reads filters from the URL and turns them into the events query', () => {
    const params = new URLSearchParams('family=jeryu&kind=todo.&pr=35&needs_human=1&wall=1&repo=%20');
    const filters = parseActivityFilters(params);
    expect(filters).toEqual({
      family: 'jeryu',
      repo: '',
      source: '',
      kind: 'todo.',
      todo_id: '',
      pr: '35',
      needs_human: true,
    });
    expect(filtersToQuery(filters)).toEqual({ family: 'jeryu', kind: 'todo.', pr: 35, needs_human: true });
    expect(isWallMode(params)).toBe(true);
    expect(hasActiveFilters(filters)).toBe(true);
    const empty = parseActivityFilters(new URLSearchParams('pr=abc'));
    expect(empty.pr).toBe('');
    expect(hasActiveFilters(empty)).toBe(false);
    expect(filtersToQuery(empty)).toEqual({});
  });

  it('builds filtered Activity links', () => {
    expect(activityHref({})).toBe('/activity');
    expect(activityHref({ repo: 'jeryu/jeryu-web', pr: 35 })).toBe('/activity?repo=jeryu%2Fjeryu-web&pr=35');
  });

  it('merges pages by seq, newest first, later pages winning', () => {
    const a = [pipelineEvent({ seq: 3, kind: 'a.b' }), pipelineEvent({ seq: 1, kind: 'a.b' })];
    const b = [pipelineEvent({ seq: 4, kind: 'a.b' }), pipelineEvent({ seq: 3, kind: 'a.c' })];
    const merged = mergeEvents(a, undefined, b);
    expect(merged.map((e) => e.seq)).toEqual([4, 3, 1]);
    expect(merged[1].kind).toBe('a.c');
    expect(maxSeq(merged)).toBe(4);
    expect(minSeq(merged)).toBe(1);
    expect(maxSeq([])).toBe(0);
    expect(minSeq([])).toBeNull();
  });

  it('tones rows: red for needs-human and failures, amber for retries, green for clean finishes', () => {
    expect(eventTone({ needs_human: true, outcome: 'success' })).toBe('danger');
    expect(eventTone({ needs_human: false, outcome: 'failure' })).toBe('danger');
    expect(eventTone({ needs_human: false, outcome: 'timed_out' })).toBe('danger');
    expect(eventTone({ needs_human: false, outcome: 'retry' })).toBe('warning');
    expect(eventTone({ needs_human: false, outcome: 'done' })).toBe('success');
    expect(eventTone({ needs_human: false, outcome: null })).toBe('info');
  });

  it('links an event to its todo, its PR, or its repo', () => {
    const todo = EVENTS.find((e) => e.seq === 9)!;
    expect(eventLinks(todo)).toEqual([
      { label: 'todo 20260919-121041-9d0b27', to: '/work/shift?family=jeryu&todo=20260919-121041-9d0b27' },
    ]);
    const merged = EVENTS.find((e) => e.seq === 11)!;
    expect(eventLinks(merged)).toEqual([
      { label: 'jeryu/jeryu-web#35', to: '/repos/jeryu/jeryu/jeryu-web/pulls/35' },
    ]);
    const staged = EVENTS.find((e) => e.seq === 12)!;
    expect(eventLinks(staged)).toEqual([{ label: 'jeryu/jeryu-deploy', to: '/repos/jeryu/jeryu/jeryu-deploy' }]);
    // A todo id without a family cannot be located in a queue.
    expect(eventLinks(pipelineEvent({ seq: 1, kind: 'todo.claimed', todo_id: 'x' }))).toEqual([]);
  });

  it('formats durations and clock times', () => {
    expect(formatSeconds(null)).toBe('');
    expect(formatSeconds(42)).toBe('42s');
    expect(formatSeconds(114)).toBe('1m 54s');
    expect(formatSeconds(3720)).toBe('1h 2m');
    expect(formatClock('2026-09-19T13:03:26Z')).toBe('13:03:26');
    expect(formatClock('nonsense')).toBe('nonsense');
  });

  it('counts the last 24 hours from the fetched events only', () => {
    const now = new Date('2026-09-19T14:00:00Z');
    const old = pipelineEvent({
      seq: 1,
      ts: '2026-09-18T13:00:00Z',
      kind: 'todo.attempt_finished',
      outcome: 'done',
      cost_usd: 5,
    });
    expect(wallCounters([...EVENTS, old], now)).toEqual({
      todosFinished: 1,
      blocked: 1,
      prsMerged: 1,
      deploys: 1,
      spentUsd: 0.54,
      events: 6,
    });
  });

  it('says what happened in plain words, and shows an unknown kind as it came', () => {
    const label = (kind: string, outcome: string | null = null): string => eventLabel({ kind, outcome });
    expect(label('gate.log', 'success')).toBe('Gate passed');
    expect(label('gate.log', 'failure')).toBe('Gate failed');
    expect(label('gate.finished', 'timed_out')).toBe('Gate timed out');
    expect(label('gate.log', 'inputs_changed')).toBe('Gate re-running');
    expect(label('pr.review', 'approve')).toBe('Review: approved');
    expect(label('review.finished', 'hold')).toBe('Review: changes requested');
    expect(label('todo.attempt_finished', 'done')).toBe('Todo finished');
    expect(label('todo.attempt_finished', 'blocked')).toBe('Todo blocked');
    expect(label('deploy.status', 'success')).toBe('Deployed');
    expect(label('deploy.status', 'failure')).toBe('Deploy failed');
    expect(label('deploy.status', 'in_progress')).toBe('Deploying');
    expect(label('release.staged')).toBe('Release staged');
    expect(label('queue.landed')).toBe('Merged by the queue');
    expect(label('pin.bump_opened')).toBe('Pin bump opened');
    expect(label('something.new', 'success')).toBe('something.new');
  });

  it('maps chips to URL filters and back, keeping the other filters', () => {
    const gates = ACTIVITY_CHIPS.find((chip) => chip.id === 'gates');
    const human = ACTIVITY_CHIPS.find((chip) => chip.id === 'human');
    const all = ACTIVITY_CHIPS.find((chip) => chip.id === 'all');
    if (!gates || !human || !all) throw new Error('chips missing');
    const start = new URLSearchParams('family=jeryu&needs_human=1');
    expect(applyChip(start, gates).toString()).toBe('family=jeryu&kind=gate.');
    expect(applyChip(new URLSearchParams('kind=gate.&repo=a%2Fb'), human).toString()).toBe('repo=a%2Fb&needs_human=1');
    expect(applyChip(new URLSearchParams('kind=gate.&family=jain'), all).toString()).toBe('family=jain');

    const filters = (qs: string) => parseActivityFilters(new URLSearchParams(qs));
    expect(activeChip(filters(''))).toBe('all');
    expect(activeChip(filters('kind=gate.'))).toBe('gates');
    expect(activeChip(filters('needs_human=1'))).toBe('human');
    expect(activeChip(filters('kind=gate.finished'))).toBeNull();
    // A chip's kind is not a reason to open More filters; a hand-made one is.
    expect(hasMoreFilters(filters('kind=gate.&family=jeryu'))).toBe(false);
    expect(hasMoreFilters(filters('kind=gate.finished'))).toBe(true);
    expect(hasMoreFilters(filters('repo=a%2Fb'))).toBe(true);
  });

  it('names an event\'s subject once, as the link inside its summary', () => {
    const gate = pipelineEvent({
      seq: 1,
      kind: 'gate.log',
      repo: 'jeryu/jeryu-deploy',
      pr: 57,
      summary: 'jeryu/jeryu-deploy#57 jeryu-deploy/required success in 176s',
    });
    expect(summaryParts(gate)).toEqual({
      before: '',
      link: { label: 'jeryu/jeryu-deploy#57', to: '/repos/jeryu/jeryu/jeryu-deploy/pulls/57' },
      after: ' jeryu-deploy/required success in 176s',
    });
    const deploy = pipelineEvent({ seq: 2, kind: 'deploy.status', repo: 'jeryu/jeryu-deploy', summary: 'production deploy: success' });
    expect(summaryParts(deploy).before).toBe('production deploy: success ');
    expect(summaryParts(deploy).link?.label).toBe('jeryu/jeryu-deploy');
    const bare = pipelineEvent({ seq: 3, kind: 'worker.error', summary: 'forge 502' });
    expect(summaryParts(bare)).toEqual({ before: 'forge 502', link: null, after: '' });
    expect(primaryLink(pipelineEvent({ seq: 4, kind: 'todo.claimed', family: 'jeryu', todo_id: 't1' }))?.label).toBe('todo t1');
  });
});
