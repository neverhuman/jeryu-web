// ActivityPage.test.tsx — feed rows, log tails, URL filters, load older, the
// live tail, wall mode, and degradation on an older server.

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { htmlShell, mockPipelineApi } from './pipelinePageHelpers';
import { EVENTS, pipelineEvent } from './pipelineTestData';
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
    expect(screen.getByRole('link', { name: 'Needs you' })).toHaveAttribute(
      'href',
      '/needs-you?family=jeryu'
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
    const row = strip.parentElement as HTMLElement;
    const show = within(row).getByRole('group', { name: 'Show' });
    // Far left: the pills are the row's first child, the chips follow.
    expect(row.firstElementChild).toBe(strip);
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

  it('loads older events with before_seq and tails newer ones with after_seq', async () => {
    const page = Array.from({ length: 100 }, (_, i) => pipelineEvent({ seq: 200 - i, kind: 'todo.claimed' }));
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
    expect(screen.queryByText(/^Live ·/)).toBeNull();

    fireEvent.click(within(notice).getByRole('button', { name: 'Retry now' }));
    expect(await screen.findByTestId('activity-event-11')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-tail-paused')).toBeNull();
    expect(screen.getByText(/^Live ·/)).toBeInTheDocument();
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
});
