import { describe, expect, it } from 'vitest';

import { clockText } from '../../format/when';

import {
  ACTIVITY_CHIPS,
  activeChip,
  activityHref,
  applyChip,
  eventJson,
  eventLabel,
  eventLinks,
  eventTone,
  eventsApiPath,
  filtersToQuery,
  foldEchoes,
  formatDay,
  groupByDay,
  hasDetail,
  formatSeconds,
  hasActiveFilters,
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
  mergeEvents,
  minSeq,
  parseActivityFilters,
  primaryLink,
  resolvedSeqs,
  summaryParts,
  visibleEvents,
  wallCounters,
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

  it('knows which rows have more to say than their one line', () => {
    expect(hasDetail(EVENTS.find((e) => e.seq === 10)!)).toBe(true);
    expect(hasDetail(EVENTS.find((e) => e.seq === 12)!)).toBe(true);
    expect(hasDetail(EVENTS.find((e) => e.seq === 11)!)).toBe(false);
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

