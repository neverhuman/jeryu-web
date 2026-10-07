import { describe, expect, it } from 'vitest';

import type { PipelineEvent } from '../../api/types';
import { clockText } from '../../format/when';

import {
  ACTIVITY_CHIPS,
  activeChip,
  activityHref,
  applyChip,
  eventDetailFields,
  eventJson,
  eventLabel,
  eventLinks,
  eventTone,
  eventsApiPath,
  filtersToQuery,
  foldEchoes,
  foldStageRuns,
  formatDay,
  groupByDay,
  groupRowsByDay,
  dayTotals,
  dayTotalsText,
  hasDetail,
  formatSeconds,
  hasActiveFilters,
  loadedCountText,
  loadedSinceText,
  longestSecondsByKind,
  durationShare,
  exactSecondsText,
  MIN_DURATION_SHARE,
  filterFieldError,
  hasMoreFilters,
  isKindFilter,
  isWallMode,
  kindPatterns,
  matchesKind,
  maxSeq,
  MAX_DETAIL_FIELDS,
  mergeEvents,
  minSeq,
  parseActivityFilters,
  primaryLink,
  resolvedSeqs,
  rowSeqs,
  stageFrom,
  stageName,
  stageRunTitle,
  stageSlot,
  stageSteps,
  summaryParts,
  summaryText,
  visibleEvents,
  wallCounters,
  wantsWorkerSteps,
  workerStepCount,
  showsWorkerSteps,
  applyWorkerSteps,
} from '../activity/activityModel';
import { EVENTS, pipelineEvent } from './pipelineTestData';

describe('activityModel', () => {
  it('marks a needs-you event resolved once a later event on the same subject succeeds', () => {
    const repo = 'jeryu/jeryu-deploy';
    const failed = pipelineEvent({ seq: 10, kind: 'deploy.status', repo, outcome: 'failure', needs_human: true });
    const otherRepo = pipelineEvent({ seq: 11, kind: 'deploy.status', repo: 'jeryu/jeryu-web', outcome: 'success' });
    const gate = pipelineEvent({ seq: 12, kind: 'gate.finished', repo, outcome: 'success' });
    expect(resolvedSeqs([gate, otherRepo, failed]).size).toBe(0);
    const later = pipelineEvent({ seq: 13, kind: 'deploy.status', repo, outcome: 'success' });
    expect([...resolvedSeqs([later, gate, otherRepo, failed])]).toEqual([10]);
    const earlier = pipelineEvent({ seq: 9, kind: 'deploy.status', repo, outcome: 'success' });
    expect(resolvedSeqs([failed, earlier]).size).toBe(0);
  });

  it('resolves a gate failure once its pull request is merged or gated green', () => {
    const pull = { repo: 'acme/widgets', pr: 99 };
    const failed = pipelineEvent({
      seq: 20,
      kind: 'gate.log',
      ...pull,
      outcome: 'failure',
      needs_human: true,
      summary: 'Gate failed on acme/widgets#99',
    });
    expect(resolvedSeqs([failed]).size).toBe(0);
    const merged = pipelineEvent({ seq: 21, kind: 'pr.merged', ...pull, outcome: 'success' });
    expect([...resolvedSeqs([merged, failed])]).toEqual([20]);
    const green = pipelineEvent({ seq: 21, kind: 'gate.finished', ...pull, outcome: 'success' });
    expect([...resolvedSeqs([green, failed])]).toEqual([20]);
    // Another pull request's merge says nothing about this gate.
    const elsewhere = pipelineEvent({ seq: 22, kind: 'pr.merged', repo: 'acme/widgets', pr: 7, outcome: 'success' });
    expect(resolvedSeqs([elsewhere, failed]).size).toBe(0);
  });

  it('resolves a gate failure that never needed a human, so history is not red', () => {
    const pull = { repo: 'globex/parts', pr: 12 };
    const failed = pipelineEvent({ seq: 30, kind: 'gate.log', ...pull, outcome: 'failure' });
    const merged = pipelineEvent({ seq: 31, kind: 'pr.merged', ...pull, outcome: 'success' });
    expect([...resolvedSeqs([merged, failed])]).toEqual([30]);
  });

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

  it('names the request a view is one page of, cursors excluded', () => {
    expect(eventsApiPath({})).toBe('/api/v1/events?limit=100');
    expect(eventsApiPath({ family: 'jeryu', kind: 'todo.', pr: 35, needs_human: true })).toBe(
      '/api/v1/events?family=jeryu&kind=todo.&pr=35&needs_human=true&limit=100'
    );
  });

  it('prints an event as the API returned it', () => {
    const event = pipelineEvent({ seq: 7, kind: 'gate.log', summary: 'Gate failed' });
    const text = eventJson(event);
    expect(JSON.parse(text)).toEqual(event);
    // Indented and newline-terminated: it pastes into a file or a ticket.
    expect(text).toContain('\n  "seq": 7');
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('takes the kinds the server takes and refuses the rest', () => {
    for (const kind of ['todo.claimed', 'todo.', 'gate.finished', 'pr.review_requested', 'a.b1_c', 'review.,pr.review']) {
      expect(isKindFilter(kind)).toBe(true);
    }
    for (const kind of ['todo', '', '.', '.todo', 'todo..claimed', 'Todo.claimed', 'todo claimed', '1todo.a', `${'a'.repeat(64)}.b`]) {
      expect(isKindFilter(kind)).toBe(false);
    }
  });

  it('says why a typed filter cannot be used, and says nothing about a good one', () => {
    expect(filterFieldError('kind', 'todo')).toContain('dotted lower-case');
    expect(filterFieldError('kind', 'todo.')).toBeNull();
    expect(filterFieldError('kind', '  ')).toBeNull();
    expect(filterFieldError('pr', 'abc')).toContain('digits only');
    expect(filterFieldError('pr', '35')).toBeNull();
    expect(filterFieldError('repo', 'anything at all')).toBeNull();
  });

  it('drops a URL kind the server would refuse, so a deep link does not 422 the feed', () => {
    const bare = parseActivityFilters(new URLSearchParams('kind=todo'));
    expect(bare.kind).toBe('');
    expect(filtersToQuery(bare)).toEqual({});
    expect(parseActivityFilters(new URLSearchParams('kind=todo.')).kind).toBe('todo.');
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

  it('keeps the human tone for needs-human alone: a failure gets its own', () => {
    expect(eventTone({ needs_human: true, outcome: 'success' })).toBe('human');
    // An agent picks a failed gate up itself, so it is never the red one.
    expect(eventTone({ needs_human: false, outcome: 'failure' })).toBe('failed');
    expect(eventTone({ needs_human: false, outcome: 'timed_out' })).toBe('failed');
    expect(eventTone({ needs_human: false, outcome: 'retry' })).toBe('warn');
    expect(eventTone({ needs_human: false, outcome: 'done' })).toBe('ok');
    expect(eventTone({ needs_human: false, outcome: null })).toBe('unknown');
  });

  it('links an event to its todo, its PR, or its repo, on the forge it names', () => {
    const todo = EVENTS.find((e) => e.seq === 9)!;
    // The link carries the event's family: `/work/<id>` resolves the id in the
    // queue the event names instead of whichever family the tab was scoped to.
    expect(eventLinks(todo, 'forge.example')).toEqual([
      {
        label: 'todo 20260919-121041-9d0b27',
        to: '/work/20260919-121041-9d0b27?family=jeryu',
      },
    ]);
    const merged = EVENTS.find((e) => e.seq === 11)!;
    expect(eventLinks(merged, 'forge.example')).toEqual([
      { label: 'jeryu/jeryu-web#35', to: '/repos/forge.example/jeryu/jeryu-web/pulls/35' },
    ]);
    const staged = EVENTS.find((e) => e.seq === 12)!;
    expect(eventLinks(staged, 'forge.example')).toEqual([{ label: 'jeryu/jeryu-deploy', to: '/repos/forge.example/jeryu/jeryu-deploy' }]);
    // A todo id without a family cannot be located in a queue.
    expect(eventLinks(pipelineEvent({ seq: 1, kind: 'todo.claimed', todo_id: 'x' }), 'forge.example')).toEqual([]);
  });

  it('formats durations and clock times', () => {
    expect(formatSeconds(null)).toBe('');
    expect(formatSeconds(42)).toBe('42s');
    expect(formatSeconds(114)).toBe('1m 54s');
    expect(formatSeconds(3720)).toBe('1h 2m');
    // The suite's zone is America/New_York: 13:03 UTC is 09:03 for the reader.
    expect(clockText('2026-09-19T13:03:26Z')).toBe('09:03:26');
    expect(clockText('nonsense')).toBe('nonsense');
  });

  it('scales a duration bar against the longest run of the same kind', () => {
    const events = [
      pipelineEvent({ seq: 1, kind: 'gate.log', seconds: 600 }),
      pipelineEvent({ seq: 2, kind: 'gate.log', seconds: 60 }),
      pipelineEvent({ seq: 3, kind: 'todo.attempt_finished', seconds: 1800 }),
      // Neither a missing nor a zero duration sets a scale.
      pipelineEvent({ seq: 4, kind: 'pr.opened', seconds: null }),
      pipelineEvent({ seq: 5, kind: 'pr.merged', seconds: 0 }),
    ];
    const longest = longestSecondsByKind(events);
    expect(longest.get('gate.log')).toBe(600);
    expect(longest.get('todo.attempt_finished')).toBe(1800);
    expect(longest.has('pr.opened')).toBe(false);
    expect(longest.has('pr.merged')).toBe(false);

    // The longest of its kind fills the width; a shorter one its own share.
    expect(durationShare(600, longest.get('gate.log'))).toBe(1);
    expect(durationShare(300, longest.get('gate.log'))).toBe(0.5);
    // A long attempt is not measured against the gates, so it is not clipped.
    expect(durationShare(1800, longest.get('todo.attempt_finished'))).toBe(1);
    // A sliver stays visible, and a row with nothing to scale draws no bar.
    expect(durationShare(1, 600)).toBe(MIN_DURATION_SHARE);
    expect(durationShare(null, 600)).toBeNull();
    expect(durationShare(0, 600)).toBeNull();
    expect(durationShare(60, undefined)).toBeNull();
    expect(durationShare(60, 0)).toBeNull();
  });

  it('says a duration once: the summary drops what the column repeats', () => {
    const gate = (summary: string, seconds: number | null) =>
      summaryText(pipelineEvent({ seq: 1, kind: 'gate.finished', summary, seconds }));
    // 'success in 91s' beside a column reading '1m 31s' said it twice.
    expect(gate('runner-1 gate of jeryu/jeryu-web#35: success in 91s', 91)).toBe(
      'runner-1 gate of jeryu/jeryu-web#35: success'
    );
    expect(gate('gate: success in 1m 31s', 91)).toBe('gate: success');
    expect(gate('gate: success in 2h 5m', 7500)).toBe('gate: success');
    // Rounding is the column's, not the summary's: 91.4s and 91s are one run.
    expect(gate('gate: success in 91.4s', 91.4)).toBe('gate: success');
    // A number that is not this row's duration, or not a duration at all,
    // stays: the column cannot be the one saying it.
    expect(gate('gate: success in 12s', 91)).toBe('gate: success in 12s');
    expect(gate('deploy of jeryu/jeryu-web: success in production', 91)).toBe(
      'deploy of jeryu/jeryu-web: success in production'
    );
    // No duration column at all, so the summary is the only place it is said.
    expect(gate('gate: success in 91s', null)).toBe('gate: success in 91s');
    // A duration mid-sentence is the writer's sentence, not a repeat.
    expect(gate('gate: success in 91s after a retry', 91)).toBe('gate: success in 91s after a retry');
  });

  it('says the exact seconds a rounded duration came from', () => {
    expect(exactSecondsText(null)).toBe('');
    expect(exactSecondsText(1)).toBe('1 second');
    expect(exactSecondsText(114.5)).toBe('114.5 seconds');
    expect(exactSecondsText(3720)).toBe('3720 seconds');
  });

  it('names a day in words and groups the feed into days', () => {
    const now = new Date('2026-09-19T14:00:00Z');
    expect(formatDay('2026-09-19T13:03:26Z', now)).toBe('Today · 19 Sep 2026 · EDT');
    // 23:59 UTC is still the 18th at 19:59 for the reader.
    expect(formatDay('2026-09-18T23:59:00Z', now)).toBe('Yesterday · 18 Sep 2026 · EDT');
    expect(formatDay('2026-09-16T08:00:00Z', now)).toBe('16 Sep 2026 · EDT');
    expect(formatDay('nonsense', now)).toBe('nonsense');

    const older = pipelineEvent({ seq: 2, ts: '2026-09-18T23:00:00Z', kind: 'todo.claimed' });
    const oldest = pipelineEvent({ seq: 1, ts: '2026-09-18T09:00:00Z', kind: 'todo.filed' });
    const groups = groupByDay([...EVENTS, older, oldest]);
    expect(groups.map((group) => group.day)).toEqual(['2026-09-19', '2026-09-18']);
    expect(groups[1].events.map((event) => event.seq)).toEqual([2, 1]);
  });

  it('says the live count is what is loaded, and how far back it reaches', () => {
    const now = new Date('2026-09-19T14:00:00Z');
    const loaded = [
      pipelineEvent({ seq: 3, ts: '2026-09-19T13:03:26Z', kind: 'pr.opened' }),
      pipelineEvent({ seq: 2, ts: '2026-09-19T12:40:00Z', kind: 'todo.claimed' }),
      pipelineEvent({ seq: 1, ts: '2026-09-19T12:38:10Z', kind: 'todo.filed' }),
    ];
    // The oldest loaded event is the boundary, to the minute, not the newest.
    expect(loadedCountText(loaded, now)).toBe('Showing 3 since 08:38');
    // A page that reaches back past midnight has to say which day it reaches.
    expect(loadedSinceText('2026-09-18T22:38:10Z', now)).toBe('18 Sep 18:38');
    expect(loadedSinceText('2026-09-19T12:38:10Z', now)).toBe('08:38');
    expect(loadedSinceText('nonsense', now)).toBe('nonsense');
    expect(loadedCountText([], now)).toBe('Showing 0 events');
  });

  it('knows which rows have more to say than their one line', () => {
    expect(hasDetail(EVENTS.find((e) => e.seq === 10)!)).toBe(true);
    expect(hasDetail(EVENTS.find((e) => e.seq === 12)!)).toBe(true);
    expect(hasDetail(EVENTS.find((e) => e.seq === 11)!)).toBe(false);
    // A field of its own is enough: a stage beat has neither reason nor log.
    expect(
      hasDetail(pipelineEvent({ seq: 30, kind: 'worker.stage', detail: { stage: 'gate' } }))
    ).toBe(true);
    expect(hasDetail(pipelineEvent({ seq: 31, kind: 'worker.stage' }))).toBe(false);
  });

  it('shows each kind the few detail fields its question needs', () => {
    const gate = eventDetailFields(
      pipelineEvent({
        seq: 40,
        kind: 'gate.finished',
        detail: { runner: 'xbabe2/slot0', recipe: 'just required', receipt: 'target/receipts/9.json' },
      })
    );
    expect(gate.map((field) => [field.label, field.value])).toEqual([
      ['Runner', 'xbabe2/slot0'],
      ['Recipe', 'just required'],
      ['Receipt', 'target/receipts/9.json'],
    ]);

    // A number reads as itself; the order is the kind's, not the producer's.
    const attempt = eventDetailFields(
      pipelineEvent({
        seq: 41,
        kind: 'todo.attempt_finished',
        detail: { shift: 'dayshift/2026-09-19', attempt: 2, model: 'claude-opus-5' },
      })
    );
    expect(attempt.map((field) => `${field.label} ${field.value}`)).toEqual([
      'Model claude-opus-5',
      'Attempt 2',
      'Shift dayshift/2026-09-19',
    ]);

    // The staged release's command is the one field worth a copy button.
    const staged = eventDetailFields(
      pipelineEvent({
        seq: 42,
        kind: 'release.staged',
        detail: {
          release: 'prod-20260919T130210Z-01dfe68-unsigned',
          head_sha: '01dfe680a6de5e02da4e9aa7821534742aa46d7e',
          deploy_command: 'jeryu deploy prod-20260919T130210Z-01dfe68-unsigned',
        },
      })
    );
    expect(staged.filter((field) => field.copy).map((field) => field.key)).toEqual(['deploy_command']);
    // A sha is shortened like every other sha on the screen, whole in its title.
    expect(staged.find((field) => field.key === 'head_sha')).toMatchObject({
      label: 'Head',
      value: '01dfe680',
      title: '01dfe680a6de5e02da4e9aa7821534742aa46d7e',
      mono: true,
    });

    expect(
      eventDetailFields(pipelineEvent({ seq: 43, kind: 'deploy.status', detail: { log_path: '/var/log/deploy.log' } }))
    ).toHaveLength(1);
  });

  it('leaves out the keys a producer did not send, and the kinds with no fields', () => {
    // An empty string is not a value; `usage` is drawn by the row, not here.
    expect(
      eventDetailFields(
        pipelineEvent({ seq: 50, kind: 'gate.finished', detail: { runner: '  ', usage: { input_tokens: 1 } } })
      )
    ).toEqual([]);
    expect(eventDetailFields(pipelineEvent({ seq: 51, kind: 'pr.merged', detail: { runner: 'x' } }))).toEqual([]);
    expect(eventDetailFields(pipelineEvent({ seq: 52, kind: 'gate.finished' }))).toEqual([]);
  });

  it('never shows more than four fields, however many the producer attached', () => {
    const fields = eventDetailFields(
      pipelineEvent({
        seq: 60,
        kind: 'todo.attempt_finished',
        detail: { model: 'm', attempt: 1, attempts: 3, shift: 's' },
      })
    );
    expect(fields).toHaveLength(MAX_DETAIL_FIELDS);
    expect(fields.map((field) => field.key)).toEqual(['model', 'attempt', 'attempts', 'shift']);
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
    // A repository tab pins the repo and hides the field, so the pin alone is
    // no reason to unfold a panel the reader cannot see it in.
    expect(hasMoreFilters(filters('repo=a%2Fb'), true)).toBe(false);
    expect(hasMoreFilters(filters('repo=a%2Fb&pr=7'), true)).toBe(true);
  });

  it('names an event\'s subject once, as the link inside its summary', () => {
    const gate = pipelineEvent({
      seq: 1,
      kind: 'gate.log',
      repo: 'jeryu/jeryu-deploy',
      pr: 57,
      summary: 'jeryu/jeryu-deploy#57 jeryu-deploy/required success in 176s',
    });
    expect(summaryParts(gate, 'forge.example')).toEqual({
      before: '',
      link: { label: 'jeryu/jeryu-deploy#57', to: '/repos/forge.example/jeryu/jeryu-deploy/pulls/57' },
      after: ' jeryu-deploy/required success in 176s',
    });
    const deploy = pipelineEvent({ seq: 2, kind: 'deploy.status', repo: 'jeryu/jeryu-deploy', summary: 'production deploy: success' });
    expect(summaryParts(deploy, 'forge.example').before).toBe('production deploy: success ');
    expect(summaryParts(deploy, 'forge.example').link?.label).toBe('jeryu/jeryu-deploy');
    const bare = pipelineEvent({ seq: 3, kind: 'worker.error', summary: 'forge 502' });
    expect(summaryParts(bare, 'forge.example')).toEqual({ before: 'forge 502', link: null, after: '' });
    const claimed = primaryLink(
      pipelineEvent({ seq: 4, kind: 'todo.claimed', family: 'jeryu', todo_id: 't1' }),
      'forge.example'
    );
    expect(claimed?.label).toBe('todo t1');
    expect(claimed?.to).toBe('/work/t1?family=jeryu');
  });
});

describe('foldStageRuns', () => {
  function beat(seq: number, from: string, to: string, overrides: Partial<PipelineEvent> = {}): PipelineEvent {
    return pipelineEvent({
      seq,
      kind: 'worker.stage',
      source: 'todoq',
      family: 'jeryu',
      todo_id: '20260919-0800-aaa',
      actor: 'alton@xbabe0/w1',
      summary: `w1 jeryu: ${from} -> ${to} on 20260919-0800-aaa`,
      ...overrides,
    });
  }

  // Newest first, the order the feed holds.
  const run = [beat(43, 'gate', 'land'), beat(42, 'agent', 'gate'), beat(41, 'prepare', 'agent')];

  it('reads the slot and the stage from the detail, the actor, or the words', () => {
    expect(stageSlot(run[0])).toBe('w1');
    expect(stageName(run[0])).toBe('land');
    expect(stageSlot(beat(44, 'agent', 'gate', { actor: null, summary: 'w7 jeryu: agent -> gate on t1' }))).toBe('w7');
    expect(stageName(beat(44, 'agent', 'gate', { detail: { stage: 'land' } }))).toBe('land');
    expect(stageName(beat(44, 'agent', 'gate', { outcome: 'prepare' }))).toBe('prepare');
    const nameless = pipelineEvent({ seq: 45, kind: 'worker.stage', actor: null, summary: 'stage report' });
    expect(stageSlot(nameless)).toBeNull();
    expect(stageName(nameless)).toBeNull();
    expect(stageFrom(run[1])).toBe('agent');
    expect(stageFrom(nameless)).toBeNull();
  });

  it('folds a run of beats into one row that keeps the path it walked', () => {
    const rows = foldStageRuns(run);
    expect(rows).toHaveLength(1);
    expect(rows[0].event.seq).toBe(43);
    expect(rows[0].run?.slot).toBe('w1');
    expect(rows[0].run?.steps).toEqual(['prepare', 'agent', 'gate', 'land']);
    expect(rows[0].run?.events.map((e) => e.seq)).toEqual([43, 42, 41]);
    expect(stageRunTitle(rows[0].run!)).toBe('3 stage events: prepare → agent → gate → land');
    // The oldest beat's own starting stage opens the path: without it the row
    // would say the run began at `agent`.
    expect(rows[0].run?.steps[0]).toBe('prepare');
  });

  it('keeps a lone beat as the plain row it is', () => {
    const rows = foldStageRuns([run[0]]);
    expect(rows).toEqual([{ event: run[0], run: null }]);
  });

  it('never folds across a slot, a todo, or anything that happened between', () => {
    const otherSlot = beat(40, 'prepare', 'agent', { actor: 'alton@xbabe0/w2', summary: 'w2 jeryu: prepare -> agent on t2' });
    expect(foldStageRuns([...run, otherSlot]).map((row) => row.event.seq)).toEqual([43, 40]);
    const otherTodo = beat(40, 'prepare', 'agent', { todo_id: 't2' });
    expect(foldStageRuns([...run, otherTodo]).map((row) => row.event.seq)).toEqual([43, 40]);
    // An outcome row between two beats is what the fold is for: it stays a row
    // of its own, with a run on either side of it.
    const finished = pipelineEvent({ seq: 42, kind: 'todo.attempt_finished', outcome: 'done' });
    const rows = foldStageRuns([beat(43, 'gate', 'land'), finished, beat(41, 'prepare', 'agent')]);
    expect(rows.map((row) => row.event.seq)).toEqual([43, 42, 41]);
    expect(rows.map((row) => row.run)).toEqual([null, null, null]);
  });

  it('leaves every other event where it was', () => {
    const rows = foldStageRuns(EVENTS);
    expect(rowSeqs(rows)).toEqual(EVENTS.map((event) => event.seq));
  });

  it('draws the whole ladder, with the stage the run is on marked', () => {
    const steps = stageSteps(foldStageRuns(run.slice(1))[0].run!);
    expect(steps.map((step) => step.stage)).toEqual(['prepare', 'agent', 'gate', 'land']);
    expect(steps.filter((step) => step.walked).map((step) => step.stage)).toEqual(['prepare', 'agent', 'gate']);
    expect(steps.filter((step) => step.current).map((step) => step.stage)).toEqual(['gate']);
  });

  it('keeps a stage this build does not know, after the four it does', () => {
    const run = [beat(51, 'agent', 'handover'), beat(50, 'prepare', 'agent')];
    const steps = stageSteps(foldStageRuns(run)[0].run!);
    expect(steps.map((step) => step.stage)).toEqual(['prepare', 'agent', 'gate', 'land', 'handover']);
    expect(steps.find((step) => step.current)?.stage).toBe('handover');
  });

  it('groups rows by day the way the events were grouped', () => {
    const rows = foldStageRuns(EVENTS);
    expect(groupRowsByDay(rows).map((group) => [group.day, group.rows.length])).toEqual(
      groupByDay(EVENTS).map((group) => [group.day, group.events.length])
    );
  });

  it('totals a day from its rows, counting every beat a folded run holds', () => {
    const spend = pipelineEvent({ seq: 60, kind: 'todo.attempt_finished', outcome: 'done', cost_usd: 2.5 });
    const broke = pipelineEvent({ seq: 61, kind: 'gate.finished', outcome: 'failure', cost_usd: 1.605 });
    const wants = pipelineEvent({ seq: 62, kind: 'deploy.status', outcome: 'success', needs_human: true });
    const rows = foldStageRuns([...run, spend, broke, wants]);
    // Three beats folded into one row still count as three events.
    expect(rows).toHaveLength(4);
    expect(dayTotals(rows)).toEqual({ events: 6, failed: 2, spentUsd: 4.11 });
    expect(dayTotalsText(dayTotals(rows))).toBe('6 events · 2 failed · $4.11');
  });

  it('says only what a day has to say, and says one event in the singular', () => {
    expect(dayTotalsText(dayTotals(foldStageRuns([run[0]])))).toBe('1 event');
    const day = dayTotals(foldStageRuns([pipelineEvent({ seq: 63, kind: 'pr.merged', outcome: 'merged', cost_usd: 0.4 }), run[0]]));
    expect(day).toEqual({ events: 2, failed: 0, spentUsd: 0.4 });
    expect(dayTotalsText(day)).toBe('2 events · $0.40');
  });

  it('totals each day on its own', () => {
    const rows = foldStageRuns(EVENTS);
    const totals = groupRowsByDay(rows).map((group) => dayTotals(group.rows).events);
    expect(totals.reduce((sum, events) => sum + events, 0)).toBe(EVENTS.length);
  });
});

describe('foldEchoes', () => {
  const SHA = '5c9fbdb1f4c6c5f23349bdab0bed81b8343a3718';
  const finished = pipelineEvent({
    seq: 40,
    kind: 'gate.finished',
    source: 'forge',
    repo: 'jeryu/jeryu-web',
    pr: 37,
    sha: SHA,
    outcome: 'success',
    ts: '2026-09-19T14:50:10Z',
  });
  const log = pipelineEvent({
    seq: 41,
    kind: 'gate.log',
    source: 'pr-gate',
    repo: 'jeryu/jeryu-web',
    pr: 37,
    sha: SHA,
    outcome: 'success',
    ts: '2026-09-19T14:50:16Z',
    log_tail: 'jeryu-web OK',
  });

  it('shows a finished gate once, as the report that carries the log', () => {
    expect(foldEchoes([log, finished]).map((e) => e.seq)).toEqual([41]);
    // Order in the list does not matter.
    expect(foldEchoes([finished, log]).map((e) => e.seq)).toEqual([41]);
  });

  it('keeps a lone report of either kind', () => {
    expect(foldEchoes([finished])).toEqual([finished]);
    expect(foldEchoes([log])).toEqual([log]);
  });

  it('keeps both when they are different gates', () => {
    const otherSha = { ...finished, sha: 'b3002ffafb4c80d6b421b9473b9c6873262c1757' };
    const otherOutcome = { ...finished, outcome: 'failure' };
    const otherRepo = { ...finished, repo: 'jeryu/jeryu-deploy' };
    const hoursLater = { ...finished, ts: '2026-09-19T16:50:16Z' };
    for (const other of [otherSha, otherOutcome, otherRepo, hoursLater]) {
      expect(foldEchoes([log, other])).toHaveLength(2);
    }
  });

  it('treats the heartbeat error as the timed_out or inputs_changed the runner reports', () => {
    const timedOut = { ...log, outcome: 'timed_out' };
    const error = { ...finished, outcome: 'error' };
    expect(foldEchoes([timedOut, error]).map((e) => e.kind)).toEqual(['gate.log']);
    // A plain failure is not an "error".
    expect(foldEchoes([{ ...log, outcome: 'failure' }, error])).toHaveLength(2);
  });

  it('shows a review once, as the verdict', () => {
    const verdict = pipelineEvent({
      seq: 50,
      kind: 'pr.review',
      repo: 'jeryu/jeryu-web',
      pr: 37,
      sha: SHA,
      outcome: 'approve',
      reason: 'Red team: approved.',
    });
    const beat = pipelineEvent({ seq: 49, kind: 'review.finished', repo: 'jeryu/jeryu-web', pr: 37, sha: SHA });
    const started = pipelineEvent({ seq: 48, kind: 'review.started', repo: 'jeryu/jeryu-web', pr: 37, sha: SHA });
    expect(foldEchoes([verdict, beat, started]).map((e) => e.kind)).toEqual(['pr.review', 'review.started']);
    expect(foldEchoes([beat])).toEqual([beat]);
    expect(foldEchoes([verdict, { ...beat, pr: 38 }])).toHaveLength(2);
  });

  it('does not let the wall count a gate twice', () => {
    const now = new Date('2026-09-19T15:00:00Z');
    expect(wallCounters(visibleEvents([log, finished]), now).events).toBe(1);
  });
});

describe('matchesKind', () => {
  it('follows the server rule, for one kind or several', () => {
    expect(matchesKind('gate.log', 'gate.')).toBe(true);
    expect(matchesKind('gate.log', 'gate.finished')).toBe(false);
    expect(matchesKind('pr.review', 'review.,pr.review')).toBe(true);
    expect(matchesKind('review.started', 'review.,pr.review')).toBe(true);
    expect(matchesKind('pr.merged', 'review.,pr.review')).toBe(false);
    expect(matchesKind('anything', '')).toBe(true);
  });

  // Every kind the pipeline emits, from jeryu-deploy's `docs/pipeline-events.md`:
  // the forge's own emit points, plus what the queue runner, auto-stage,
  // auto-pin and pr-gate post. A chip naming a kind missing from this list asks
  // for something nothing produces, and shows an empty or frozen feed.
  const EMITTED_KINDS = [
    'todo.filed', 'todo.action', 'todo.claimed', 'todo.attempt_finished', 'todo.merged',
    'todo.waiting_on_unmerged',
    'worker.stage', 'worker.error',
    'shift.pr_opened', 'shift.exhausted',
    'pr.opened', 'pr.review', 'pr.approved', 'pr.merged', 'pr.ready_for_review', 'pr.draft',
    'pr.skipped',
    'queue.enqueued', 'queue.building', 'queue.landed', 'queue.failed', 'queue.dequeued',
    'queue.refused',
    'gate.started', 'gate.finished', 'gate.log', 'review.started', 'review.finished',
    'release.staged', 'release.stage_failed',
    'pin.bump_opened', 'pin.bump_failed',
    'deploy.created', 'deploy.status',
  ];

  it('gives every chip kinds the pipeline emits', () => {
    for (const chip of ACTIVITY_CHIPS) {
      if (!chip.kind) continue;
      for (const pattern of kindPatterns(chip.kind)) {
        const covered = EMITTED_KINDS.some((kind) => matchesKind(kind, pattern));
        expect([chip.id, pattern, covered]).toEqual([chip.id, pattern, true]);
      }
    }
  });

  it('catches a merge whichever road it took: the queue, or a merge straight onto the base', () => {
    const merges = ACTIVITY_CHIPS.find((chip) => chip.id === 'merges');
    const filters = parseActivityFilters(applyChip(new URLSearchParams(), merges!));
    expect(activeChip(filters)).toBe('merges');
    // Several kinds, so the server sends everything and the narrowing happens here.
    expect(filtersToQuery(filters).kind).toBeUndefined();
    const events = [
      pipelineEvent({ seq: 1, kind: 'queue.enqueued' }),
      pipelineEvent({ seq: 2, kind: 'pr.merged' }),
      pipelineEvent({ seq: 3, kind: 'pr.opened' }),
      pipelineEvent({ seq: 4, kind: 'queue.landed' }),
      pipelineEvent({ seq: 5, kind: 'todo.merged' }),
    ];
    expect(visibleEvents(events, filters.kind).map((e) => e.seq)).toEqual([1, 2, 4]);
  });

  it('asks the server for everything when a chip spans several kinds, and narrows here', () => {
    const reviews = ACTIVITY_CHIPS.find((chip) => chip.id === 'reviews');
    const filters = parseActivityFilters(applyChip(new URLSearchParams(), reviews!));
    expect(filtersToQuery(filters).kind).toBeUndefined();
    expect(activeChip(filters)).toBe('reviews');
    const events = [
      pipelineEvent({ seq: 1, kind: 'pr.review' }),
      pipelineEvent({ seq: 2, kind: 'pr.merged' }),
      pipelineEvent({ seq: 3, kind: 'review.started' }),
    ];
    expect(visibleEvents(events, filters.kind).map((e) => e.seq)).toEqual([1, 3]);
  });
});

describe('worker steps', () => {
  const page = [
    pipelineEvent({ seq: 5, kind: 'gate.finished', outcome: 'success' }),
    pipelineEvent({ seq: 4, kind: 'worker.stage', outcome: 'gate', summary: 'w1 jeryu: agent -> gate' }),
    pipelineEvent({ seq: 3, kind: 'worker.stage', outcome: 'agent', summary: 'w1 jeryu: prepare -> agent' }),
    pipelineEvent({ seq: 2, kind: 'worker.error', summary: 'w1 fell over' }),
    pipelineEvent({ seq: 1, kind: 'todo.filed' }),
  ];

  it('leaves the step beats out of All and says how many that was', () => {
    expect(visibleEvents(page).map((event) => event.seq)).toEqual([5, 2, 1]);
    expect(workerStepCount(page)).toBe(2);
    // What went wrong in a slot is not a step: it stays on every view.
    expect(visibleEvents(page).some((event) => event.kind === 'worker.error')).toBe(true);
  });

  it('shows them when the reader asks, by the toggle or by the filter', () => {
    expect(visibleEvents(page, '', true).map((event) => event.seq)).toEqual([5, 4, 3, 2, 1]);
    const workers = ACTIVITY_CHIPS.find((chip) => chip.id === 'workers');
    const filters = parseActivityFilters(applyChip(new URLSearchParams(), workers!));
    expect(activeChip(filters)).toBe('workers');
    expect(wantsWorkerSteps(filters.kind)).toBe(true);
    expect(visibleEvents(page, filters.kind).map((event) => event.seq)).toEqual([4, 3, 2]);
    // One kind is the server's own filter, so nothing is narrowed here — but
    // the beats it asked for are still not folded away.
    expect(visibleEvents(page, 'worker.stage').map((event) => event.seq)).toEqual([5, 4, 3, 2, 1]);
    expect(wantsWorkerSteps('')).toBe(false);
    expect(wantsWorkerSteps('gate.')).toBe(false);
  });

  it('holds the toggle in the URL, and nowhere else', () => {
    expect(showsWorkerSteps(new URLSearchParams())).toBe(false);
    const on = applyWorkerSteps(new URLSearchParams('kind=gate.'), true);
    expect(on.toString()).toBe('kind=gate.&steps=1');
    expect(showsWorkerSteps(on)).toBe(true);
    const off = applyWorkerSteps(on, false);
    expect(off.toString()).toBe('kind=gate.');
    // Not a filter: it narrows nothing the server is asked for.
    expect(hasActiveFilters(parseActivityFilters(new URLSearchParams('steps=1')))).toBe(false);
  });
});
