// ActivityPage.test.tsx — feed rows, log tails, URL filters, load older, the
// live tail, wall mode, and degradation on an older server.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityPage } from '../activity';
import { htmlShell, mockPipelineApi } from './pipelinePageHelpers';
import { EVENTS, pipelineEvent } from './pipelineTestData';
import { json, renderAt } from './shiftPageHelpers';

function renderPage(path = '/activity'): void {
  renderAt(path, '/activity', <ActivityPage />);
}

describe('ActivityPage', () => {
  afterEach(() => vi.restoreAllMocks());

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
  });

  it('sends URL filters to the server and commits a typed filter on Enter', async () => {
    const calls = mockPipelineApi();
    renderPage('/activity?family=jeryu&needs_human=1');
    await screen.findByTestId('activity-event-12');
    expect(calls.some((c) => c.pathname === '/api/v1/events' && c.search === '?family=jeryu&needs_human=true&limit=100')).toBe(
      true
    );
    expect(screen.getByRole('button', { name: 'Needs a human' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Family')).toHaveValue('jeryu');
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

  it('wall mode swaps the filters for 24-hour counters', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-19T14:00:00Z') });
    try {
      mockPipelineApi();
      renderPage('/activity?wall=1');
      const counters = await screen.findByRole('region', { name: 'Last 24 hours' });
      await screen.findByTestId('activity-event-12');
      expect(within(counters).getByText('Todos finished').previousSibling).toHaveTextContent('1');
      expect(within(counters).getByText('Spent').previousSibling).toHaveTextContent('$0.54');
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
