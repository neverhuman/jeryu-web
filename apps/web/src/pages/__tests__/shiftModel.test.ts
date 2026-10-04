// shiftModel.test.ts — pure helpers behind the Work page.

import { describe, expect, it } from 'vitest';

import type { ShiftBranch } from '../../api/types';

import {
  DEFAULT_QUEUE_FILTERS,
  attemptSummary,
  capacityGeometry,
  commitHref,
  countNeedsHuman,
  dateInTz,
  filterShiftTodos,
  isLastNight,
  isLongStale,
  lastNightDate,
  needsHuman,
  normalizeShiftKind,
  latestWorker,
  layoutSegments,
  parseList,
  queueOptions,
  canOpenReviewPr,
  repoCodeHref,
  repoNeedsReviewPr,
  unmergedTodosNote,
  repoRefs,
  shiftIsLive,
  splitFinished,
  slotLabel,
  sortShifts,
  splitParagraphs,
  splitWorkers,
  todoCost,
  todoPrHref,
  todoTrace,
  traceSummary,
  todoWorkers,
  isLongNote,
  isFinishedTodo,
  todoActions,
  untilInputDefault,
  untilRfc3339,
} from '../shift/shiftModel';
import { SHIFTS, TODOS, WORKERS, attempt, todo } from './shiftTestData';

describe('shiftModel', () => {
  it('filters by status, mode, repo, requester, worker and shift', () => {
    const f = DEFAULT_QUEUE_FILTERS;
    expect(filterShiftTodos(TODOS, f).map((t) => t.status)).toEqual(['claimed', 'open', 'done']);
    expect(filterShiftTodos(TODOS, { ...f, mode: 'night' })).toHaveLength(1);
    expect(filterShiftTodos(TODOS, { ...f, repo: 'jeryu-deploy' })[0].id).toBe('20260918-2201-a9z');
    // A todo naming `owner/name` answers to its bare name, and the reverse.
    const owned = todo({ id: 'owned', repos: ['jeryu/jeryu-api'] });
    expect(filterShiftTodos([owned], { ...f, repo: 'jeryu-api' })).toHaveLength(1);
    expect(filterShiftTodos(TODOS, { ...f, repo: 'jeryu/jeryu-deploy' })[0].id).toBe('20260918-2201-a9z');
    expect(filterShiftTodos([owned], { ...f, repo: 'other/jeryu-api' })).toHaveLength(0);
    expect(filterShiftTodos(TODOS, { ...f, requested_by: 'jeryu' })).toHaveLength(1);
    expect(filterShiftTodos(TODOS, { ...f, worked_by: 'bob' })[0].status).toBe('claimed');
    expect(filterShiftTodos(TODOS, { ...f, shift: 'nightshift/2026-09-18' })).toHaveLength(1);
  });

  it('orders open work by priority then filed time', () => {
    const a = todo({ id: 'a', priority: 3, filed_at: '2026-01-01' });
    const b = todo({ id: 'b', priority: 1, filed_at: '2026-01-02' });
    const c = todo({ id: 'c', priority: 1, filed_at: '2026-01-01' });
    expect(filterShiftTodos([a, b, c], DEFAULT_QUEUE_FILTERS).map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });

  it('derives filter options and worker names', () => {
    const opts = queueOptions(TODOS);
    expect(opts.repos).toEqual(['jeryu-deploy', 'jeryu-web']);
    expect(opts.requesters).toEqual(['alton', 'jeryu']);
    expect(opts.workers).toEqual(['alton', 'bob']);
    expect(opts.shifts).toEqual(['nightshift/2026-09-18']);
    expect(todoWorkers(TODOS[2])).toEqual(['bob']);
  });

  it('names the latest worker', () => {
    expect(latestWorker(TODOS[1])).toBe('alton/w1');
    expect(latestWorker(TODOS[2])).toBe('bob@xbabe1/w2');
    expect(latestWorker(todo({ worked_by: [attempt(), attempt({ by: 'eve', slot: '' })] }))).toBe('eve');
    expect(latestWorker(TODOS[0])).toBeNull();
  });

  it('splits paste-many text on blank lines', () => {
    expect(splitParagraphs('one\nstill one\n\n  \ntwo\n\n\n')).toEqual(['one\nstill one', 'two']);
    expect(splitParagraphs('  ')).toEqual([]);
    expect(parseList('a, b  c,a')).toEqual(['a', 'b', 'c']);
  });

  it('dates last night in the shift time zone', () => {
    // 2026-09-19 03:00 UTC is 2026-09-18 20:00 in Los Angeles.
    const at = new Date('2026-09-19T03:00:00Z');
    expect(dateInTz(at, 'America/Los_Angeles')).toBe('2026-09-18');
    expect(lastNightDate(at, 'America/Los_Angeles')).toBe('2026-09-17');
    // 16:00 UTC is 09:00 LA on the 19th → last night began the 18th.
    const morning = new Date('2026-09-19T16:00:00Z');
    expect(lastNightDate(morning, 'America/Los_Angeles')).toBe('2026-09-18');
    expect(isLastNight(SHIFTS.shifts[0], morning, 'America/Los_Angeles')).toBe(true);
    expect(isLastNight(SHIFTS.shifts[1], morning, 'America/Los_Angeles')).toBe(false);
    expect(dateInTz(at, 'Not/AZone')).toBe('2026-09-19');
  });

  it('reads the legacy bulletshift name as a dayshift', () => {
    expect(normalizeShiftKind('dayshift')).toBe('dayshift');
    expect(normalizeShiftKind('bulletshift')).toBe('dayshift');
    expect(normalizeShiftKind('nightshift')).toBe('nightshift');
  });

  it('sorts a legacy bulletshift where its dayshift would sort', () => {
    const shift = (branch: string, kind: ShiftBranch['kind'], date: string): ShiftBranch => ({
      branch,
      kind,
      date,
      repos: [],
      todo_ids: [],
    });
    const sorted = sortShifts([
      shift('nightshift/2026-09-17', 'nightshift', '2026-09-17'),
      shift('bulletshift/2026-09-17', 'bulletshift', '2026-09-17'),
    ]);
    expect(sorted.map((s) => s.branch)).toEqual([
      'bulletshift/2026-09-17',
      'nightshift/2026-09-17',
    ]);
  });

  it('sorts shifts newest first', () => {
    expect(sortShifts([...SHIFTS.shifts].reverse()).map((s) => s.branch)).toEqual([
      'nightshift/2026-09-18',
      'dayshift/2026-09-17',
    ]);
  });

  it('builds repo paths', () => {
    const refs = repoRefs({ queue_repo: 'jeryu/jeryu-todo', repos: [] }, 'forge.example');
    expect(repoCodeHref(refs, 'jeryu-web')).toBe('/repos/forge.example/jeryu/jeryu-web');
    expect(repoCodeHref(refs, 'other/x')).toBe('/repos/forge.example/other/x');
  });

  it('lays out timeline segments clipped to the window', () => {
    const bars = layoutSegments(
      [
        { from: '2026-09-18T00:00:00Z', to: '2026-09-18T06:00:00Z', state: 'idle' },
        { from: '2026-09-18T06:00:00Z', to: '2026-09-18T18:00:00Z', state: 'working', todo_id: 't1', stage: 'gate' },
        { from: '2026-09-19T00:00:00Z', to: '2026-09-19T01:00:00Z', state: 'idle' },
      ],
      '2026-09-18T00:00:00Z',
      '2026-09-19T00:00:00Z',
      240
    );
    expect(bars).toHaveLength(2);
    expect(bars[0]).toMatchObject({ x: 0, width: 60, state: 'idle' });
    expect(bars[1]).toMatchObject({ x: 60, width: 120, label: 't1' });
    expect(bars[1].title).toContain('working · gate · t1');
    expect(layoutSegments([], 'x', 'y', 10)).toEqual([]);
  });

  it('computes capacity geometry', () => {
    const geo = capacityGeometry(
      [
        { at: 'h0', planned: 2, busy: 1, queue_depth: 4 },
        { at: 'h1', planned: 4, busy: 4 },
      ],
      100,
      40
    );
    expect(geo.max).toBe(4);
    expect(geo.plannedPath).toBe('M0,20 L50,20 L50,0 L100,0');
    expect(geo.bars[0]).toMatchObject({ y: 30, height: 10 });
    expect(geo.queuePoints).toBe('25,0 75,40');
    expect(capacityGeometry([{ at: 'h', planned: 1, busy: 0 }], 10, 10).queuePoints).toBe('');
    expect(capacityGeometry([], 10, 10).bars).toEqual([]);
  });
});

describe('slotLabel', () => {
  it('does not repeat a host the operator name already carries', () => {
    expect(slotLabel('alton@xbabe0', 'xbabe0', 'w1')).toBe('alton@xbabe0/w1');
    expect(slotLabel('alton', 'xbabe0', 'w1')).toBe('alton@xbabe0/w1');
    expect(slotLabel('alton', '', 'w1')).toBe('alton/w1');
  });

  it('totals a todo cost across attempts, null when none reported one', () => {
    expect(todoCost(todo())).toBeNull();
    expect(todoCost(todo({ worked_by: [attempt({ cost_usd: null })] }))).toBeNull();
    expect(todoCost(todo({ worked_by: [attempt({ cost_usd: 1.25 }), attempt({ cost_usd: null }), attempt({ cost_usd: 0.5 })] }))).toBe(1.75);
  });
  it('puts todos that wait on a person first and can filter to them', () => {
    const blocked = todo({ id: 'blk', status: 'blocked', priority: 4 });
    const handoff = todo({ id: 'hand', status: 'handoff' });
    const untriaged = todo({ id: 'new', triaged: false });
    const doneUntriaged = todo({ id: 'old', triaged: false, status: 'done' });
    const all = [...TODOS, doneUntriaged, untriaged, handoff, blocked];
    expect(filterShiftTodos(all, DEFAULT_QUEUE_FILTERS).map((t) => t.status).slice(0, 3)).toEqual([
      'blocked',
      'handoff',
      'claimed',
    ]);
    expect(needsHuman(blocked)).toBe(true);
    // An open untriaged todo is the workers' own to triage on their next pass.
    expect(needsHuman(untriaged)).toBe(false);
    expect(needsHuman(doneUntriaged)).toBe(false);
    expect(needsHuman(TODOS[0])).toBe(false);
    expect(countNeedsHuman(all)).toBe(2);
  });

  it('traces a todo from queued to released, saying unknown on an older server', () => {
    const states = (t: Parameters<typeof todoTrace>[0]): string =>
      todoTrace(t)
        .map((s) => `${s.key}:${s.state}`)
        .join(' ');
    expect(states(todo())).toBe('queued:done claimed:pending done:pending pr:pending merged:pending released:pending');
    expect(states(todo({ status: 'claimed' }))).toContain('claimed:current');
    expect(states(todo({ status: 'blocked', attempts: 2 }))).toContain('claimed:done done:failed');
    // An older server sends no `pr` / `released`: those steps are unknown, not "not yet".
    const landed = todo({ status: 'done', commits: { 'jeryu-web': 'abc' }, worked_by: [attempt()] });
    expect(states(landed)).toBe('queued:done claimed:done done:done pr:unknown merged:pending released:pending');
    expect(states({ ...landed, merged: true })).toContain('pr:done merged:done released:unknown');
    const pr = { repo: 'jeryu-web', number: 35, state: 'open', url: '/repos/jeryu/jeryu/jeryu-web/pulls/35' };
    expect(states({ ...landed, pr, released: null })).toContain('pr:done merged:pending released:pending');
    const shipped = { ...landed, pr: { ...pr, state: 'merged' }, merged: true, released: true };
    expect(states(shipped)).toBe('queued:done claimed:done done:done pr:done merged:done released:done');
    expect(states({ ...shipped, released: false })).toContain('released:pending');
    expect(todoTrace(shipped)[3].label).toBe('PR #35');
    expect(traceSummary(todoTrace(todo({ status: 'blocked' })))).toBe(
      'Queued, Claimed not yet, blocked — needs a human, PR not yet, Merged not yet, Released not yet'
    );
  });

  it('summarises attempts on the row and flags a failing last attempt', () => {
    expect(attemptSummary(todo())).toBeNull();
    expect(attemptSummary(todo({ attempts: 1, worked_by: [attempt()] }))).toEqual({
      text: '1 attempt · last: done',
      failing: false,
    });
    expect(
      attemptSummary(todo({ attempts: 2, worked_by: [attempt({ outcome: 'retry' }), attempt({ outcome: 'retry' })] }))
    ).toEqual({ text: '2 attempts · last: retry', failing: true });
    expect(attemptSummary(todo({ attempts: 2 }))).toEqual({ text: '2 attempts', failing: false });
  });

  it('links a commit to the PR that carries it, else to the code', () => {
    const owners = repoRefs({ queue_repo: 'jeryu/jeryu-todo', repos: [] }, 'jeryu');
    const pr = { repo: 'jeryu-web', number: 35, state: 'open', url: '/repos/jeryu/jeryu/jeryu-web/pulls/35' };
    expect(commitHref({ pr }, owners, 'jeryu-web')).toBe('/repos/jeryu/jeryu/jeryu-web/pulls/35');
    expect(commitHref({ pr: { ...pr, repo: 'jeryu/jeryu-web' } }, owners, 'jeryu-web')).toBe(
      '/repos/jeryu/jeryu/jeryu-web/pulls/35'
    );
    expect(commitHref({ pr }, owners, 'jeryu-deploy')).toBe('/repos/jeryu/jeryu/jeryu-deploy');
    expect(commitHref({}, owners, 'jeryu-web')).toBe('/repos/jeryu/jeryu/jeryu-web');
    expect(todoPrHref({ pr }, owners)).toBe(pr.url);
    expect(todoPrHref({ pr: { ...pr, url: 'https://elsewhere.example/x' } }, owners)).toBe(
      '/repos/jeryu/jeryu/jeryu-web/pulls/35'
    );
    expect(todoPrHref({ pr: null }, owners)).toBeNull();
  });

  it('links a family repo under the owner that hosts it, or not at all', () => {
    // The jain queue is jain-split/jain-todo; its code is veox/*.
    const jain = repoRefs({
      queue_repo: 'jain-split/jain-todo',
      repos: [
        { name: 'jain-deploy', order: 1, owner: 'veox' },
        { name: 'jain-elsewhere', order: 2, owner: null },
        { name: 'jain-report', order: 0 },
      ],
    }, 'forge.example');
    expect(repoCodeHref(jain, 'jain-deploy')).toBe('/repos/forge.example/veox/jain-deploy');
    expect(repoCodeHref(jain, 'jain-elsewhere')).toBeNull();
    // An older server names no owner: the queue's owner is the best guess.
    expect(repoCodeHref(jain, 'jain-report')).toBe('/repos/forge.example/jain-split/jain-report');
    expect(repoCodeHref(jain, 'veox/jain-web')).toBe('/repos/forge.example/veox/jain-web');
    expect(commitHref({}, jain, 'jain-elsewhere')).toBeNull();
  });

  it('offers a review PR only when it would carry something, and folds finished work', () => {
    const repo = (over: Partial<ShiftBranch['repos'][number]>): ShiftBranch['repos'][number] => ({
      repo: 'jeryu-deploy',
      head: 'abc',
      ahead: 0,
      behind: 0,
      ...over,
    });
    // Level with its base, no pull request: nothing to review.
    expect(canOpenReviewPr({ repos: [repo({ ahead: 0 })] })).toBe(false);
    // The server says exactly what is unmerged.
    expect(canOpenReviewPr({ repos: [repo({ ahead: 2, unmerged_todos: ['t1'] })] })).toBe(true);
    expect(canOpenReviewPr({ repos: [repo({ ahead: 6, unmerged_todos: [], pr: { number: 44, state: 'closed', url: '/x' } })] })).toBe(false);
    expect(repoNeedsReviewPr(repo({ ahead: 1, unmerged_todos: ['t'], pr: { number: 70, state: 'merged', url: '/x' } }))).toBe(true);
    expect(repoNeedsReviewPr(repo({ ahead: 1, unmerged_todos: ['t'], pr: { number: 71, state: 'mergeable', url: '/x' } }))).toBe(false);
    // The card says what the count means: a review PR to open, or a request to wait on.
    expect(unmergedTodosNote(repo({ ahead: 1, unmerged_todos: ['t'] }))).toBe(
      '1 todo needs a review PR to reach the base branch'
    );
    expect(unmergedTodosNote(repo({ ahead: 2, unmerged_todos: ['t', 'u'], pr: { number: 70, state: 'merged', url: '/x' } }))).toBe(
      '2 todos need a review PR to reach the base branch'
    );
    expect(unmergedTodosNote(repo({ ahead: 1, unmerged_todos: ['t'], pr: { number: 71, state: 'mergeable', url: '/x' } }))).toBe(
      '1 todo waiting for PR #71 to merge into the base branch'
    );
    // Nothing to say: all of it is on the base branch, or an older server sent no todos.
    expect(unmergedTodosNote(repo({ ahead: 0, unmerged_todos: [] }))).toBeNull();
    expect(unmergedTodosNote(repo({ ahead: 2 }))).toBeNull();
    // An older server: commits ahead and no pull request at all.
    expect(canOpenReviewPr({ repos: [repo({ ahead: 2 })] })).toBe(true);
    expect(canOpenReviewPr({ repos: [repo({ ahead: 2, pr: { number: 1, state: 'merged', url: '/x' } })] })).toBe(false);

    expect(shiftIsLive({ repos: [repo({ pr: { number: 9, state: 'mergeable', url: '/x' } })] })).toBe(true);
    expect(shiftIsLive({ repos: [repo({ ahead: 3, unmerged_todos: [], pr: { number: 9, state: 'merged', url: '/x' } })] })).toBe(false);

    const todos = [todo({ id: 'a', status: 'done' }), todo({ id: 'b', status: 'blocked' }), todo({ id: 'c', status: 'open' })];
    const split = splitFinished(todos);
    expect(split.live.map((t) => t.id)).toEqual(['b', 'c']);
    expect(split.finished.map((t) => t.id)).toEqual(['a']);
  });

  it('prefers the server cost and hides slots unseen for over an hour', () => {
    expect(todoCost({ worked_by: [attempt()], cost_usd: 3 })).toBe(3);
    const now = new Date('2026-09-19T09:00:00Z');
    expect(WORKERS.workers.map((w) => isLongStale(w, now))).toEqual([false, false]);
    const later = new Date('2026-09-19T09:30:00Z');
    const split = splitWorkers(WORKERS.workers, later);
    expect(split.hidden.map((w) => w.slot)).toEqual(['w2']);
    expect(split.shown.map((w) => w.slot)).toEqual(['w1']);
  });
});

describe('isLongNote', () => {
  it('folds only a note that will not fit four lines', () => {
    expect(isLongNote('The tag split.7 does not exist.')).toBe(false);
    expect(isLongNote('one\ntwo\nthree\nfour')).toBe(false);
    expect(isLongNote('one\ntwo\nthree\nfour\nfive')).toBe(true);
    expect(isLongNote('x'.repeat(4 * 72 + 1))).toBe(true);
  });
});

describe('todo actions', () => {
  it("leads an owner's own task with Mark done and never offers Release", () => {
    const owner = todoActions(todo({ block_kind: 'owner_task', status: 'open' }));
    expect(owner.primary?.label).toBe('Mark done');
    expect([owner.primary, ...owner.more].map((c) => c?.id)).toEqual([
      'done',
      'close',
      'park',
      'edit',
    ]);
  });

  it("leads a worker's task with what is stuck, and keeps the rest behind it", () => {
    const open = todoActions(todo({ status: 'open' }));
    expect(open.primary?.id).toBe('block');
    expect(open.more.map((c) => c.id)).toEqual(['done', 'close', 'park', 'edit']);
    expect(todoActions(todo({ status: 'blocked' })).primary?.id).toBe('release');
    // A claimed todo's Release is quiet: it takes work away from a worker.
    expect(todoActions(todo({ status: 'claimed' })).primary?.variant).toBe('ghost');
    // An unknown block_kind is a worker's task, as an older server's absent one is.
    expect(todoActions(todo({ status: 'open', block_kind: 'something_new' })).primary?.id).toBe(
      'block'
    );
  });

  it('offers nothing on a todo that is finished, done or closed', () => {
    for (const status of ['done', 'closed']) {
      const actions = todoActions(todo({ status }));
      expect(actions.primary).toBeNull();
      expect(actions.more).toEqual([]);
    }
    expect(isFinishedTodo({ status: 'closed' })).toBe(true);
    expect(needsHuman({ status: 'closed' })).toBe(false);
  });

  it('sends an until as an RFC 3339 instant in UTC, and refuses a non-date', () => {
    const at = untilRfc3339('2026-10-05T09:30');
    expect(at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(at).toBe(`${new Date('2026-10-05T09:30').toISOString().slice(0, 19)}Z`);
    expect(untilRfc3339('')).toBeNull();
    expect(untilRfc3339('tomorrow')).toBeNull();
    // The input starts a day out, in the reader's own zone, so it parses back.
    const started = untilInputDefault(new Date('2026-10-04T12:00:00Z'));
    expect(started).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(untilRfc3339(started)).toBe('2026-10-05T12:00:00Z');
  });
});
