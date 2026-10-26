// ActivityPage.test.tsx — feed rows, log tails, URL filters, the API line and a
// row's JSON, load older, the live tail, wall mode, and degradation on an older
// server.

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { absoluteText, clockText } from '../../format/when';
import { htmlShell, mockPipelineApi } from './pipelinePageHelpers';
import { EVENTS, eventPage, pipelineEvent } from './pipelineTestData';
import { errorResponse, json, renderAt } from './shiftPageHelpers';
import { useRealtimeStore } from '../../stores/realtimeStore';

function renderPage(path = '/activity'): void {
  renderAt(path, '/activity', <ActivityPage />);
}

describe('ActivityPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws a duration bar scaled within the row\'s own kind', async () => {
    const events = [
      pipelineEvent({ seq: 4, kind: 'gate.log', seconds: 600, summary: 'slow gate' }),
      pipelineEvent({ seq: 3, kind: 'gate.log', seconds: 150, summary: 'quick gate' }),
      pipelineEvent({ seq: 2, kind: 'todo.attempt_finished', seconds: 1800, summary: 'long attempt' }),
      pipelineEvent({ seq: 1, kind: 'pr.opened', seconds: null, summary: 'no duration' }),
    ];
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events' ? json({ events, latest_seq: 4 }) : undefined
    );
    renderPage();
    const slow = await screen.findByTestId('activity-event-4');
    const bar = (row: HTMLElement): HTMLElement | null =>
      row.querySelector('.activity-row__duration-bar');
    expect(bar(slow)).toHaveStyle({ width: '100.0%' });
    // Scaled against the longest gate on the page, not against the attempt.
    expect(bar(screen.getByTestId('activity-event-3'))).toHaveStyle({ width: '25.0%' });
    // The attempt is the longest of its own kind, so it fills its bar too.
    expect(bar(screen.getByTestId('activity-event-2'))).toHaveStyle({ width: '100.0%' });
    // No duration, no bar — and the exact seconds are on the row that has one.
    expect(bar(screen.getByTestId('activity-event-1'))).toBeNull();
    expect(within(slow).getByTitle('600 seconds')).toHaveTextContent('10m 0s');
  });

  it('says a gate row\'s duration once, in the column', async () => {
    const events = [
      pipelineEvent({
        seq: 2,
        kind: 'gate.finished',
        repo: 'jeryu/jeryu-web',
        pr: 35,
        seconds: 91,
        summary: 'runner-1 gate of jeryu/jeryu-web#35: success in 91s',
      }),
      // A sentence of its own keeps its words: the column did not say this.
      pipelineEvent({ seq: 1, kind: 'deploy.status', seconds: 91, summary: 'rollout in production' }),
    ];
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events' ? json({ events, latest_seq: 2 }) : undefined
    );
    renderPage();
    const gate = await screen.findByTestId('activity-event-2');
    expect(gate).toHaveTextContent('gate of jeryu/jeryu-web#35: success');
    expect(gate).not.toHaveTextContent('in 91s');
    expect(within(gate).getByTitle('91 seconds')).toHaveTextContent('1m 31s');
    expect(screen.getByTestId('activity-event-1')).toHaveTextContent('rollout in production');
  });

  it('folds a run of stage beats into one row that opens to the beats', async () => {
    const beat = (seq: number, from: string, to: string) =>
      pipelineEvent({
        seq,
        kind: 'worker.stage',
        source: 'todoq',
        family: 'jeryu',
        todo_id: '20260919-0800-aaa',
        actor: 'operator@node-0/w1',
        summary: `w1 jeryu: ${from} -> ${to} on 20260919-0800-aaa`,
      });
    const events = [
      pipelineEvent({ seq: 24, kind: 'todo.attempt_finished', outcome: 'done', summary: 'w1 finished' }),
      beat(23, 'gate', 'land'),
      beat(22, 'agent', 'gate'),
      beat(21, 'prepare', 'agent'),
    ];
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events' ? json({ events, latest_seq: 24 }) : undefined
    );
    // The beats are out of All by default; this is the view that shows them.
    renderPage('/activity?steps=1');
    // The outcome row is not buried: the three beats are one row under it.
    const row = await screen.findByTestId('activity-stages-23');
    expect(screen.getByTestId('activity-event-24')).toBeInTheDocument();
    for (const seq of [21, 22, 23]) expect(screen.queryByTestId(`activity-event-${seq}`)).toBeNull();
    expect(within(row).getByText('Worker w1')).toBeInTheDocument();
    const ladder = within(row).getByRole('list', { name: '3 stage events: prepare → agent → gate → land' });
    expect(within(ladder).getByText('land')).toHaveAttribute('aria-current', 'step');
    expect(within(ladder).getByText('prepare').className).toContain('is-walked');

    fireEvent.click(within(row).getByTestId('activity-stages-toggle-23'));
    for (const seq of [21, 22, 23]) {
      expect(within(row).getByTestId(`activity-event-${seq}`)).toBeInTheDocument();
    }
  });

  it('links a row to the forge the repository list says its repo is on', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/repos'
        ? json({
            generated_at: '2026-10-04T00:00:00Z',
            total: 1,
            repositories: [
              {
                id: { id: 'r1', host: 'forge.example', owner: 'jeryu', name: 'jeryu-web' },
                default_branch: 'main',
              },
            ],
            facets: { hosts: ['forge.example'], owners: [], families: [], languages: [] },
          })
        : undefined
    );
    renderPage();
    const gate = await screen.findByTestId('activity-event-10');
    await waitFor(() =>
      expect(within(gate).getByRole('link', { name: 'jeryu/jeryu-web#35' })).toHaveAttribute(
        'href',
        '/repos/forge.example/jeryu/jeryu-web/pulls/35'
      )
    );
  });

  it('renders events newest first with join-key links and an expandable log tail', async () => {
    mockPipelineApi();
    renderPage();
    const gate = await screen.findByTestId('activity-event-10');
    // Plain words on the row; the wire kind is a tooltip and sits in the opened row.
    expect(within(gate).getByText('Gate failed')).toHaveAttribute('title', 'gate.log');
    expect(within(gate).queryByText('gate.log')).toBeNull();
    // The summary names its subject once, as the link.
    expect(within(gate).getAllByText(/jeryu\/jeryu-web#35/)).toHaveLength(1);
    expect(within(gate).getByText('1m 54s')).toBeInTheDocument();
    expect(within(gate).getByRole('link', { name: 'jeryu/jeryu-web#35' })).toHaveAttribute(
      'href',
      '/repos/jeryu/jeryu/jeryu-web/pulls/35'
    );
    expect(within(gate).queryByLabelText('Log tail of event 10')).toBeNull();
    fireEvent.click(within(gate).getByRole('button', { name: /Log for event 10/ }));
    expect(within(gate).getByLabelText('Log tail of event 10')).toHaveTextContent('gate: FAILED');

    const staged = screen.getByTestId('activity-event-12');
    expect(staged).toHaveClass('is-needs-human');
    expect(within(staged).getByText('needs you')).toBeInTheDocument();
    const todo = screen.getByTestId('activity-event-9');
    expect(within(todo).getByText('$0.33')).toBeInTheDocument();
    expect(within(todo).getByRole('link', { name: 'todo 20260919-121041-9d0b27' })).toBeInTheDocument();

    const seqs = screen.getAllByTestId(/^activity-event-\d+$/).map((el) => el.getAttribute('data-testid'));
    expect(seqs).toEqual(EVENTS.map((e) => `activity-event-${e.seq}`));
    expect(screen.getByText('That is every stored event (30-day retention).')).toBeInTheDocument();
    // The internal sequence number is not operator-facing.
    expect(screen.queryByText(/newest #/)).toBeNull();

    // A row with a reason or a log says so; a plain one keeps its toggle quiet.
    expect(within(gate).getByRole('button', { name: /Hide for event 10/ })).not.toHaveClass(
      'activity-row__toggle--quiet'
    );
    const merged = screen.getByTestId('activity-event-11');
    expect(within(merged).getByRole('button', { name: /More for event 11/ })).toHaveClass(
      'activity-row__toggle--quiet'
    );
  });

  it('paints red on the needs-you rows alone, and a failed gate in its own tone', async () => {
    mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');
    // The legend above draws the same tones as a key, so the claim is about
    // the list: inside it, red only ever appears on a row that needs a person.
    const list = screen.getByRole('list', { name: 'Pipeline events' });

    // Every element in the human tone — the red one — sits in a row that
    // says a person is needed, and those rows are the fixture's own.
    const red = [...list.querySelectorAll('[class*="--human"]')];
    expect(red.length).toBeGreaterThan(0);
    const reddened = new Set(red.map((el) => el.closest('.is-needs-human')));
    expect(reddened.has(null)).toBe(false);
    expect([...reddened].map((row) => row?.getAttribute('data-testid')).sort()).toEqual(
      EVENTS.filter((event) => event.needs_human).map((event) => `activity-event-${event.seq}`).sort()
    );

    // The fixture's gate failure was cleared by the merge after it, so it
    // keeps its words and loses its colour; either way it is never red.
    const gate = screen.getByTestId('activity-event-10');
    expect(gate).toHaveClass('activity-row--unknown');
    expect(gate.querySelector('[class*="--human"]')).toBeNull();
  });

  it('reads a failed gate as a failure, not as a row waiting on a person', async () => {
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events'
        ? json({
            events: [
              pipelineEvent({
                seq: 50,
                kind: 'gate.log',
                repo: 'acme/widgets',
                pr: 7,
                outcome: 'failure',
                summary: 'Gate failed on acme/widgets#7',
              }),
            ],
            latest_seq: 50,
          })
        : undefined
    );
    renderPage();
    const gate = await screen.findByTestId('activity-event-50');
    expect(gate).toHaveClass('activity-row--failed');
    expect(gate.querySelector('[class*="--human"]')).toBeNull();
    expect(within(gate).getByText('Gate failed')).toHaveClass('page__pill--failed');
  });

  it('names the live count as the loaded rows and where they reach back to', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-19T14:00:00Z') });
    try {
      mockPipelineApi((req) =>
        req.pathname === '/api/v1/events'
          ? json({
              events: [
                pipelineEvent({ seq: 3, ts: '2026-09-19T13:00:00Z', kind: 'todo.claimed' }),
                pipelineEvent({ seq: 2, ts: '2026-09-19T12:38:00Z', kind: 'todo.claimed' }),
              ],
              latest_seq: 3,
            })
          : undefined
      );
      renderPage();
      // Not "2 events", which read as the pipeline's total: the pill says it is
      // showing what it has loaded, from the oldest row it holds.
      expect(await screen.findByTestId('activity-live')).toHaveTextContent(
        /^Live · Showing 2 since 08:38 · updated \d+s ago$/
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('separates the days, so a clock time can be placed', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-19T14:00:00Z') });
    try {
      mockPipelineApi((req) =>
        req.pathname === '/api/v1/events'
          ? json({
              events: [
                pipelineEvent({ seq: 3, ts: '2026-09-19T13:00:00Z', kind: 'todo.claimed' }),
                pipelineEvent({ seq: 2, ts: '2026-09-18T23:00:00Z', kind: 'todo.claimed' }),
                pipelineEvent({ seq: 1, ts: '2026-09-16T08:00:00Z', kind: 'todo.filed' }),
              ],
              latest_seq: 3,
            })
          : undefined
      );
      renderPage();
      expect(await screen.findByTestId('activity-day-2026-09-19')).toHaveTextContent('Today · 19 Sep 2026');
      expect(screen.getByTestId('activity-day-2026-09-18')).toHaveTextContent('Yesterday · 18 Sep 2026');
      expect(screen.getByTestId('activity-day-2026-09-16')).toHaveTextContent('16 Sep 2026');
      expect(screen.getAllByTestId(/^activity-day-/)).toHaveLength(3);
      // Each header also counts what is loaded of its own day.
      expect(screen.getByTestId('activity-counts-2026-09-19')).toHaveTextContent('1 event');
      expect(screen.getByTestId('activity-counts-2026-09-18')).toHaveTextContent('1 event');
    } finally {
      vi.useRealTimers();
    }
  });

  it("ages today's rows on one shared clock and leaves older rows their clock", async () => {
    vi.useFakeTimers({
      toFake: ['Date', 'setInterval', 'clearInterval'],
      now: new Date('2026-09-19T14:00:00Z'),
    });
    try {
      mockPipelineApi((req) =>
        req.pathname === '/api/v1/events'
          ? json({
              events: [
                pipelineEvent({ seq: 3, ts: '2026-09-19T13:58:00Z', kind: 'todo.claimed' }),
                pipelineEvent({ seq: 1, ts: '2026-09-16T08:00:00Z', kind: 'todo.filed' }),
              ],
              latest_seq: 3,
            })
          : undefined
      );
      renderPage();
      const today = await screen.findByTestId('activity-event-3');
      const when = (row: HTMLElement): HTMLElement => within(row).getByText(/./, { selector: 'time' });
      expect(when(today)).toHaveTextContent('2 min ago');
      // The absolute instant stays on hover, which is where the clock lives now.
      expect(when(today)).toHaveAttribute('title', absoluteText('2026-09-19T13:58:00Z'));
      // An older day keeps its clock: its heading already says which day it is.
      expect(when(screen.getByTestId('activity-event-1'))).toHaveTextContent(
        clockText('2026-09-16T08:00:00Z')
      );

      // The tick moves the label on without a fetch or a timer per row.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(when(screen.getByTestId('activity-event-3'))).toHaveTextContent('3 min ago');
      expect(when(screen.getByTestId('activity-event-1'))).toHaveTextContent(
        clockText('2026-09-16T08:00:00Z')
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the needs-you pill from a failure a later success cleared', async () => {
    const repo = 'jeryu/jeryu-deploy';
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events'
        ? json({
            events: [
              pipelineEvent({ seq: 31, kind: 'deploy.status', repo, outcome: 'success' }),
              pipelineEvent({ seq: 30, kind: 'deploy.status', repo, outcome: 'failure', needs_human: true }),
            ],
            latest_seq: 31,
          })
        : undefined
    );
    renderPage();
    const failed = await screen.findByTestId('activity-event-30');
    expect(failed).not.toHaveClass('is-needs-human');
    expect(within(failed).queryByText('needs you')).toBeNull();
    expect(within(failed).getByText('resolved')).toBeInTheDocument();
  });

  it('stops a merged pull request\u2019s gate failure from reading red', async () => {
    const pull = { repo: 'acme/widgets', pr: 99 };
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events'
        ? json({
            events: [
              pipelineEvent({ seq: 41, kind: 'pr.merged', ...pull, outcome: 'success', summary: 'Merged acme/widgets#99' }),
              pipelineEvent({
                seq: 40,
                kind: 'gate.log',
                ...pull,
                outcome: 'failure',
                needs_human: true,
                summary: 'Gate failed on acme/widgets#99',
              }),
            ],
            latest_seq: 41,
          })
        : undefined
    );
    renderPage();
    const failed = await screen.findByTestId('activity-event-40');
    // A cleared row keeps its words but not its colour: neutral, not red.
    expect(failed).toHaveClass('activity-row--unknown');
    expect(failed).not.toHaveClass('activity-row--human');
    expect(within(failed).queryByText('needs you')).toBeNull();
    expect(within(failed).getByText('resolved')).toBeInTheDocument();
    expect(within(failed).getByText('Gate failed')).toBeInTheDocument();
  });

  it('sends URL filters to the server and commits a typed filter on Enter', async () => {
    const calls = mockPipelineApi();
    renderPage('/activity?family=jeryu&needs_human=1');
    await screen.findByTestId('activity-event-12');
    expect(calls.some((c) => c.pathname === '/api/v1/events' && c.search === '?family=jeryu&needs_human=true&limit=100')).toBe(
      true
    );
    expect(screen.getByRole('button', { name: 'Needed a human' })).toHaveAttribute('aria-pressed', 'true');
    // The log does not answer "what needs a human now": Needs you does, on the same family.
    expect(screen.getByTestId('activity-needs-you')).toHaveTextContent('waiting on a person right now');
    expect(screen.getByRole('link', { name: 'Blocked' })).toHaveAttribute(
      'href',
      '/needs-you?view=all&family=jeryu'
    );
    // The family is a pill at the far left of the chip row, not a select.
    const strip = screen.getByRole('group', { name: 'Filter by family' });
    expect(within(strip).getByRole('button', { name: 'jeryu' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(strip).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    // A chip is one click and keeps the family.
    fireEvent.click(screen.getByRole('button', { name: 'Gates' }));
    await waitFor(() =>
      expect(calls.some((c) => c.search.includes('kind=gate.') && c.search.includes('family=jeryu') && !c.search.includes('needs_human'))).toBe(true)
    );
    expect(screen.getByRole('button', { name: 'Gates' })).toHaveAttribute('aria-pressed', 'true');
    // The free-text filters are still there, folded.
    const kind = screen.getByLabelText('Kind');
    fireEvent.change(kind, { target: { value: 'todo.' } });
    fireEvent.keyDown(kind, { key: 'Enter' });
    await waitFor(() =>
      expect(calls.some((c) => c.search.includes('kind=todo.') && c.search.includes('family=jeryu'))).toBe(true)
    );
  });

  it('keeps More filters open while a field is cleared', async () => {
    mockPipelineApi();
    renderPage('/activity?pr=7');
    await screen.findByTestId('activity-event-12');
    const panel = (): Element | null => document.querySelector('details.activity__more');
    // A folded filter came in on the URL, so the panel arrives unfolded.
    expect(panel()).toHaveAttribute('open');
    const pr = screen.getByLabelText('PR');
    fireEvent.change(pr, { target: { value: '' } });
    fireEvent.keyDown(pr, { key: 'Enter' });
    // Emptying the last value no longer folds the panel away under the caret.
    await waitFor(() => expect(screen.getByLabelText('PR')).toHaveValue(''));
    expect(panel()).toHaveAttribute('open');
  });

  it('leaves More filters folded on a repository tab, whose repo is the pin', async () => {
    mockPipelineApi();
    renderAt('/activity', '/activity', <ActivityPage repo="jeryu/jeryu-web" />);
    await screen.findByTestId('activity-event-12');
    // The pinned repository has no field to clear, so it is not a filter the
    // panel should unfold for.
    expect(screen.queryByLabelText('Repo')).toBeNull();
    expect(document.querySelector('details.activity__more')).not.toHaveAttribute('open');
  });

  it('is a section of the repository shell when pinned, with no wall and no second sentence', async () => {
    mockPipelineApi();
    // `?wall=1` reaches the tab as easily as any other address; the pin wins.
    renderAt('/activity?wall=1', '/activity', <ActivityPage repo="jeryu/jeryu-web" />);
    await screen.findByTestId('activity-event-12');
    // The repository shell above owns the h1, so the panel's heading is an h2.
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Activity' })).toBeInTheDocument();
    // Neither the page subtitle nor the way into wall mode belongs on a tab.
    expect(screen.queryByText(/^Every step the pipeline takes/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Enter wall mode' })).toBeNull();
    expect(document.querySelector('.activity--wall')).toBeNull();
  });

  it('keeps its own heading, sentence and wall control on /activity', async () => {
    mockPipelineApi();
    renderPage('/activity');
    await screen.findByTestId('activity-event-12');
    expect(screen.getByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByText('Every step the pipeline takes, as it happens.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Enter wall mode' })).toBeInTheDocument();
  });

  it('names the request the list is one page of and copies a row as the API returns it', async () => {
    const calls = mockPipelineApi();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage('/activity?family=jeryu&needs_human=1');
    await screen.findByTestId('activity-event-12');

    // The line under the filters is the request the feed actually made.
    const api = screen.getByTestId('activity-api');
    const path = '/api/v1/events?family=jeryu&needs_human=true&limit=100';
    expect(within(api).getByRole('link', { name: 'API' })).toHaveAttribute('href', path);
    expect(within(api).getByText(path)).toBeInTheDocument();
    expect(calls.some((c) => `${c.pathname}${c.search}` === path)).toBe(true);
    // What is copied is what is shown.
    fireEvent.click(within(api).getByTestId('activity-api-copy'));
    expect(writeText).toHaveBeenLastCalledWith(path);

    // The row's own JSON is in its detail, not on the quiet line.
    const gate = screen.getByTestId('activity-event-10');
    expect(within(gate).queryByTestId('activity-event-json-10')).toBeNull();
    fireEvent.click(within(gate).getByRole('button', { name: /Log for event 10/ }));
    const copyJson = within(gate).getByTestId('activity-event-json-10');
    expect(copyJson).toHaveAccessibleName('Copy event 10 as JSON');
    fireEvent.click(copyJson);
    const copied = writeText.mock.calls[writeText.mock.calls.length - 1][0] as string;
    expect(JSON.parse(copied)).toEqual(EVENTS.find((event) => event.seq === 10));
    expect(await within(gate).findByText('Copied')).toBeInTheDocument();

    // A chip is a different view, so it is a different query, and the line follows it.
    fireEvent.click(screen.getByRole('button', { name: 'Gates' }));
    await waitFor(() =>
      expect(within(screen.getByTestId('activity-api')).getByRole('link', { name: 'API' })).toHaveAttribute(
        'href',
        '/api/v1/events?family=jeryu&kind=gate.&limit=100'
      )
    );
  });

  it('refuses a Kind the server would 422, inline, without touching the feed', async () => {
    const calls = mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');
    const kindQueries = (): number => calls.filter((c) => c.search.includes('kind=')).length;

    const kind = screen.getByLabelText('Kind');
    fireEvent.change(kind, { target: { value: 'todo' } });
    fireEvent.keyDown(kind, { key: 'Enter' });
    expect(await screen.findByTestId('activity-filter-error-kind')).toHaveTextContent(
      'dotted lower-case words'
    );
    expect(kind).toHaveAttribute('aria-invalid', 'true');
    // Nothing was asked of the server, and the typed text is still there to fix.
    expect(kindQueries()).toBe(0);
    expect(kind).toHaveValue('todo');

    // A PR that is not a number says so too, instead of being dropped silently.
    const pr = screen.getByLabelText('PR');
    fireEvent.change(pr, { target: { value: 'abc' } });
    fireEvent.keyDown(pr, { key: 'Enter' });
    expect(await screen.findByTestId('activity-filter-error-pr')).toHaveTextContent('digits only');

    // Finishing the kind clears the hint, and that one is asked for.
    fireEvent.change(kind, { target: { value: 'todo.claimed' } });
    expect(screen.queryByTestId('activity-filter-error-kind')).toBeNull();
    fireEvent.keyDown(kind, { key: 'Enter' });
    await waitFor(() =>
      expect(calls.some((c) => c.search.includes('kind=todo.claimed'))).toBe(true)
    );
  });

  it('puts the family pills at the far left of the chip row, and a pill is the scope', async () => {
    const calls = mockPipelineApi((req) =>
      req.pathname === '/api/v1/shift/families'
        ? json({
            families: [
              { name: 'jeryu', queue_repo: 'jeryu/jeryu-todo', repos: [], shift_tz: 'UTC', landing: 'shifts' },
              { name: 'globex', queue_repo: 'globex/todo', repos: [], shift_tz: 'UTC', landing: 'shifts' },
            ],
          })
        : undefined
    );
    renderPage('/activity?family=jeryu');
    await screen.findByTestId('activity-event-12');

    const strip = await screen.findByRole('group', { name: 'Filter by family' });
    const slot = strip.parentElement as HTMLElement;
    const row = slot.parentElement as HTMLElement;
    const show = within(row).getByRole('group', { name: 'Show' });
    // Far left: the pills' slot is the row's first child, the chips follow.
    expect(slot).toHaveClass('activity__family-slot');
    expect(row.firstElementChild).toBe(slot);
    expect(strip.compareDocumentPosition(show) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Names only: Activity has no per-family event count to put on a pill.
    expect(within(strip).getByRole('button', { name: 'globex' }).textContent).toBe('globex');

    fireEvent.click(within(strip).getByRole('button', { name: 'globex' }));
    await waitFor(() =>
      expect(calls.some((c) => c.pathname === '/api/v1/events' && c.search.includes('family=globex'))).toBe(true)
    );
    expect(within(strip).getByRole('button', { name: 'globex' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('offers a pill for a family only the feed has named', async () => {
    // The pushes arrive before the family lists catch up with a new family:
    // the rows on the page can always be narrowed to the family they name.
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/events'
        ? json({
            events: [
              pipelineEvent({ seq: 12, kind: 'todo.claimed', family: 'jailgun', summary: 'Claimed' }),
            ],
            latest_seq: 12,
          })
        : req.pathname === '/api/v1/shift/families'
          ? json({
              families: [
                { name: 'acme-split', queue_repo: 'acme/acme-todo', repos: [], shift_tz: 'UTC', landing: 'shifts' },
              ],
            })
          : undefined
    );
    renderPage();
    const strip = await screen.findByRole('group', { name: 'Filter by family' });
    expect(
      within(strip)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['All', 'acme', 'jailgun']);
  });

  it('holds the family pills’ place and keeps a chip’s note off the control line', async () => {
    let answerFamilies = (): void => {};
    const families = new Promise<void>((resolve) => {
      answerFamilies = () => resolve();
    });
    mockPipelineApi((req) =>
      req.pathname === '/api/v1/shift/families'
        ? families.then(() =>
            json({
              families: [
                { name: 'jeryu', queue_repo: 'jeryu/jeryu-todo', repos: [], shift_tz: 'UTC', landing: 'shifts' },
                { name: 'globex', queue_repo: 'globex/todo', repos: [], shift_tz: 'UTC', landing: 'shifts' },
              ],
            })
          )
        : undefined
    );
    renderPage();
    await screen.findByTestId('activity-event-12');

    // Before the family list answers there are no pills, but their slot is
    // already there, so the chips beside it are not moved when it fills.
    const filters = screen.getByRole('region', { name: 'Activity filters' });
    const row = filters.querySelector<HTMLElement>('.activity__chip-row');
    const slot = row?.firstElementChild;
    if (!(row instanceof HTMLElement) || !(slot instanceof HTMLElement)) throw new Error('no family slot');
    expect(slot).toHaveClass('activity__family-slot');
    expect(within(slot).queryByRole('group', { name: 'Filter by family' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Show' }).previousElementSibling).toBe(slot);

    await act(async () => {
      answerFamilies();
      await families;
    });
    const strip = await screen.findByRole('group', { name: 'Filter by family' });
    // The names landed in the slot that was waiting for them: same element,
    // same place in the row.
    expect(strip.parentElement).toBe(slot);
    expect(row.firstElementChild).toBe(slot);

    // A chip's note is the next line under the controls, not a block beside
    // them that pushes More filters onto a line of its own.
    fireEvent.click(screen.getByRole('button', { name: 'Needed a human' }));
    const note = await screen.findByTestId('activity-needs-you');
    expect(note.parentElement).toBe(filters);
    expect(note.previousElementSibling).toBe(row);
    expect(row.contains(note)).toBe(false);
  });

  it('loads older events with before_seq and tails newer ones with after_seq', async () => {
    const page = eventPage(200, 100);
    const calls = mockPipelineApi((req) => {
      if (req.pathname !== '/api/v1/events') return undefined;
      const qs = new URLSearchParams(req.search);
      if (qs.get('before_seq')) {
        return json({ events: [pipelineEvent({ seq: 100, kind: 'todo.filed' })], latest_seq: 201 });
      }
      if (qs.get('after_seq')) {
        return json({ events: [pipelineEvent({ seq: 201, kind: 'pr.merged' })], latest_seq: 201 });
      }
      return json({ events: page, latest_seq: 200 });
    });
    renderPage();
    await screen.findByTestId('activity-event-200');
    // The tail starts as soon as the first page is in.
    expect(await screen.findByTestId('activity-event-201')).toBeInTheDocument();
    expect(calls.some((c) => c.search.includes('after_seq=200'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Load older' }));
    expect(await screen.findByTestId('activity-event-100')).toBeInTheDocument();
    expect(calls.some((c) => c.search.includes('before_seq=101'))).toBe(true);
    expect(screen.getByText('That is every stored event (30-day retention).')).toBeInTheDocument();
  });

  it('fetches the tail on an event push and not on another surface\'s snapshot', async () => {
    const listeners: Array<(event: { scope: string; kind: string }) => void> = [];
    const store = useRealtimeStore.getState();
    vi.spyOn(useRealtimeStore, 'getState').mockReturnValue({
      ...store,
      addInvalidator: (listener) => {
        listeners.push(listener as (event: { scope: string; kind: string }) => void);
        return () => {};
      },
    });
    const calls = mockPipelineApi();
    renderPage();
    await screen.findByTestId('activity-event-12');
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));
    const tails = (): number =>
      calls.filter((call) => call.pathname === '/api/v1/events' && call.search.includes('after_seq')).length;
    const before = tails();

    const fire = (event: { scope: string; kind: string }): void => {
      act(() => {
        for (const listener of listeners) listener(event);
      });
    };
    // The release board publishes on the same scope; its snapshot is never a row.
    fire({ scope: 'pipeline', kind: 'release_board.updated' });
    fire({ scope: 'pipeline', kind: 'usage.changed' });
    fire({ scope: 'repo.jeryu/jeryu-web', kind: 'gate.finished' });
    expect(tails()).toBe(before);

    fire({ scope: 'pipeline', kind: 'gate.finished' });
    await waitFor(() => expect(tails()).toBeGreaterThan(before));
  });

  it('says the live tail is paused when it fails, and resumes on Retry now', async () => {
    let tailCalls = 0;
    mockPipelineApi((req) => {
      if (req.pathname !== '/api/v1/events') return undefined;
      const qs = new URLSearchParams(req.search);
      if (!qs.get('after_seq')) return json({ events: [pipelineEvent({ seq: 10, kind: 'todo.claimed' })], latest_seq: 10 });
      tailCalls += 1;
      if (tailCalls === 1) return errorResponse(502, 'forge is away');
      return json({ events: [pipelineEvent({ seq: 11, kind: 'pr.merged' })], latest_seq: 11 });
    });
    renderPage();
    await screen.findByTestId('activity-event-10');
    const notice = await screen.findByTestId('activity-tail-paused');
    expect(notice).toHaveTextContent(/Live updates paused — retrying in \d+s/);
    expect(screen.getByTestId('activity-live')).toHaveAttribute('data-phase', 'reconnecting');

    fireEvent.click(within(notice).getByRole('button', { name: 'Retry now' }));
    expect(await screen.findByTestId('activity-event-11')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-tail-paused')).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('activity-live')).toHaveAttribute('data-phase', 'live')
    );
  });

  it('pulses a Live dot with the count and a ticking "updated Xs ago"', async () => {
    mockPipelineApi();
    renderPage();
    const pill = await screen.findByTestId('activity-live');
    expect(pill).toHaveAttribute('role', 'status');
    expect(pill).toHaveAttribute('data-phase', 'live');
    expect(pill.className).toContain('activity__live--live');
    expect(pill.className).not.toContain('activity__live--still');
    expect(within(pill).getByText('Live')).toBeInTheDocument();
    expect(pill).toHaveTextContent(
      new RegExp(`^Live · Showing ${EVENTS.length} since .+ · updated 0s ago$`)
    );
    // Only the state is announced: the count and the clock move on their own.
    for (const moving of [/Showing/, /updated/]) {
      expect(within(pill).getByText(moving)).toHaveAttribute('aria-live', 'off');
    }

    // The clock ticks once a second without the feed fetching anything.
    const base = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(base + 4_200);
    await waitFor(() => expect(pill).toHaveTextContent('updated 4s ago'), { timeout: 3_000 });
  });

  it('says Paused while the tab is hidden, because the tail stops polling then', async () => {
    mockPipelineApi();
    renderPage();
    const pill = await screen.findByTestId('activity-live');
    const visibility = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    try {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await waitFor(() => expect(pill).toHaveAttribute('data-phase', 'paused'));
      expect(within(pill).getByText('Paused')).toBeInTheDocument();

      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await waitFor(() => expect(pill).toHaveAttribute('data-phase', 'live'));
    } finally {
      delete (document as unknown as Record<string, unknown>).visibilityState;
      if (visibility) Object.defineProperty(Document.prototype, 'visibilityState', visibility);
    }
  });

  it('holds the dot still when the reader asked for less motion', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      mockPipelineApi();
      renderPage();
      const pill = await screen.findByTestId('activity-live');
      expect(pill.className).toContain('activity__live--still');
      expect(pill).toHaveTextContent('Live ·');
    } finally {
      window.matchMedia = original;
    }
  });

  it("keys the row edges with the rows' own classes, and not on the wall", async () => {
    mockPipelineApi();
    renderPage();
    const legend = await screen.findByTestId('activity-legend');
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((key) => key.textContent)
    ).toEqual(['needs you', 'an agent will pick it up', 'ok']);
    // Each marker is an activity-row with its tone, so the colour and the
    // dashes come from the same rules that draw the list.
    const marker = (tone: string): Element | null =>
      legend.querySelector(`.activity__marker.activity-row.activity-row--${tone}`);
    for (const tone of ['human', 'failed', 'ok']) expect(marker(tone)).not.toBeNull();
    // The paragraph above it is one line now, not the colour explanation.
    const subtitle = screen.getByText('Every step the pipeline takes, as it happens.');
    expect(subtitle).toHaveClass('page__subtitle');
  });

  it('leaves the legend off the wall, which has no subtitle either', async () => {
    mockPipelineApi();
    renderPage('/activity?wall=1');
    await screen.findByTestId('activity-event-12');
    expect(screen.queryByTestId('activity-legend')).toBeNull();
  });

  it('wall mode swaps the filters for 24-hour counters', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-19T14:00:00Z') });
    try {
      mockPipelineApi();
      renderPage('/activity?wall=1');
      const counters = await screen.findByRole('region', { name: 'Last 24 hours' });
      await screen.findByTestId('activity-event-12');
      // The numbers travel to their value, so wait for where they land.
      await waitFor(() =>
        expect(within(counters).getByText('Todos finished').previousSibling).toHaveTextContent('1')
      );
      await waitFor(() =>
        expect(within(counters).getByText('Spent').previousSibling).toHaveTextContent('$0.54')
      );
      expect(screen.queryByRole('region', { name: 'Activity filters' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Leave wall mode' })).toBeInTheDocument();
      expect(screen.getByTestId('activity-page')).toHaveClass('activity--wall');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows empty and "not available" states', async () => {
    mockPipelineApi((req) => (req.pathname === '/api/v1/events' ? json({ events: [], latest_seq: 0 }) : undefined));
    renderPage();
    expect(await screen.findByText('No pipeline events yet.')).toBeInTheDocument();
    vi.restoreAllMocks();

    mockPipelineApi((req) => (req.pathname === '/api/v1/events' ? htmlShell() : undefined));
    renderPage('/activity?family=x');
    expect(await screen.findByText('Not available on this server version.')).toBeInTheDocument();
  });

  it('retries a failed feed read in place, and names an unreachable forge plainly', async () => {
    let attempt = 0;
    mockPipelineApi((req) => {
      if (req.pathname !== '/api/v1/events') return undefined;
      attempt += 1;
      return attempt === 1
        ? errorResponse(500, 'boom internal')
        : json({ events: [pipelineEvent({ seq: 7, kind: 'pr.opened', summary: 'back again' })], latest_seq: 7 });
    });
    renderPage();
    expect(await screen.findByText('Could not load the activity feed.')).toBeInTheDocument();
    // The failure is recoverable without a reload: the button asks again.
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('activity-event-7')).toHaveTextContent('back again');
    vi.restoreAllMocks();

    mockPipelineApi((req) => {
      if (req.pathname === '/api/v1/events') throw new TypeError('Failed to fetch');
      return undefined;
    });
    renderPage();
    expect(await screen.findByText('Cannot reach the forge.')).toBeInTheDocument();
    // The browser's own words say nothing a reader can act on.
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    expect(screen.queryByText(/network_error/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
