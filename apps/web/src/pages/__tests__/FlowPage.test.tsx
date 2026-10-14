// FlowPage.test.tsx — `/flow` Live mode: the strip and the station cards, the
// rework loops, a station's lots, the window and station in the address, and
// what the page says on a server or to a reader that will not answer it.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlowPage } from '../flow';
import { FLOW_REPORT } from './flowTestData';
import {
  errorResponse,
  json,
  recordHeaders,
  renderAt,
  type Override,
  type Recorded,
} from './shiftPageHelpers';

afterEach(() => vi.restoreAllMocks());

function mockFlowApi(override?: Override): Recorded[] {
  const calls: Recorded[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, 'http://localhost');
    const req: Recorded = {
      method: init?.method ?? 'GET',
      pathname: url.pathname,
      search: url.search,
      body: undefined,
      headers: recordHeaders(init?.headers),
    };
    calls.push(req);
    const custom = override?.(req);
    if (custom) return custom;
    if (url.pathname === '/api/v1/flow') {
      return json({
        ...FLOW_REPORT,
        days: Number(url.searchParams.get('days') ?? 28),
        family: url.searchParams.get('family'),
      });
    }
    if (url.pathname === '/api/v1/shift/families') {
      return json({
        families: [
          { name: 'acme', queue_repo: 'acme/acme-todo', repos: [], shift_tz: 'UTC', landing: {} },
          { name: 'globex', queue_repo: 'globex/globex-todo', repos: [], shift_tz: 'UTC', landing: {} },
        ],
      });
    }
    return errorResponse(404, `unmocked ${url.pathname}`);
  });
  return calls;
}

const flowCalls = (calls: Recorded[]): URLSearchParams[] =>
  calls.filter((call) => call.pathname === '/api/v1/flow').map((call) => new URLSearchParams(call.search));

describe('FlowPage', () => {
  it('lays the line out as stations and names the bottleneck in the header', async () => {
    mockFlowApi();
    renderAt('/flow', '/flow', <FlowPage />);

    expect(await screen.findByTestId('flow-body')).toBeInTheDocument();
    expect(screen.getByTestId('flow-bottleneck-badge')).toHaveTextContent(
      'Gate holds the most waiting'
    );
    // The strip above the cards is the one Activity carries, with the totals.
    expect(screen.getByTestId('flow-line-strip-cycle')).toHaveTextContent('1.0 d');
    expect(screen.getByTestId('flow-line-strip-x-factor')).toHaveTextContent('4.2×');

    const gate = screen.getByTestId('flow-card-gate');
    expect(gate).toHaveTextContent('3 waiting');
    expect(gate).toHaveTextContent('2 active');
    expect(gate).toHaveTextContent('Oldest wait 1h 10m');
    expect(gate).toHaveTextContent('Queue 15m · work 6m 40s');
    expect(gate).toHaveTextContent('4.2/h');
    expect(gate.className).toContain('flow-card--bottleneck');
    // Red is a hold: Review has one.
    expect(screen.getByTestId('flow-card-review').className).toContain('flow-card--human');
    // A station nothing has reached says so rather than showing zeros.
    expect(screen.getByTestId('flow-card-pin')).toHaveTextContent(
      'nothing has reached this station yet'
    );
    expect(screen.getByTestId('flow-card-stage')).toHaveTextContent('queue time: not enough data');

    // The rework loops, as arcs and as the same sentences in words.
    expect(screen.getByTestId('flow-rework-gate-work')).toHaveTextContent('9');
    expect(screen.getByTestId('flow-rework-list')).toHaveTextContent(
      '9 lots sent back from Gate to Work (19% of what left)'
    );
  });

  it('lists a station lots oldest first, and each lot opens its own page', async () => {
    mockFlowApi();
    renderAt('/flow', '/flow', <FlowPage />);
    await screen.findByTestId('flow-body');
    expect(screen.getByTestId('flow-lots-hint')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('flow-card-gate'));
    const lots = await screen.findByTestId('flow-lots');
    expect(lots).toHaveTextContent('At Gate, oldest first');
    const rows = within(lots).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('a')?.textContent)).toEqual([
      'acme-0001',
      'acme/widgets#42',
      'acme-0002',
    ]);
    expect(screen.getByTestId('flow-lot-acme-0001')).toHaveAttribute('href', '/work/acme-0001');
    expect(screen.getByTestId('flow-lot-acme/widgets#42')).toHaveAttribute(
      'href',
      '/acme/widgets/pull/42'
    );
    expect(rows[1]).toHaveTextContent('not counting pin');

    // A held lot has no estimate: its next step is a person.
    fireEvent.click(screen.getByTestId('flow-card-review'));
    await waitFor(() =>
      expect(screen.getByTestId('flow-lots')).toHaveTextContent('held — a person is the next step')
    );
  });

  it('keeps the window and the station in the address and the request', async () => {
    const calls = mockFlowApi();
    renderAt('/flow?days=7&station=gate', '/flow', <FlowPage />);
    await screen.findByTestId('flow-body');
    expect(flowCalls(calls)[0].get('days')).toBe('7');
    // A deep link lists that station's lots without a click.
    expect(screen.getByTestId('flow-lots')).toHaveTextContent('At Gate, oldest first');
    expect(screen.getByTestId('flow-line-strip-station-gate')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: '90 d' }));
    await waitFor(() => expect(flowCalls(calls).at(-1)?.get('days')).toBe('90'));

    // Clicking the open station again puts the list away.
    fireEvent.click(screen.getByTestId('flow-card-gate'));
    await waitFor(() => expect(screen.queryByTestId('flow-lots')).toBeNull());
  });

  it('says so on a server without the route, and to a reader who may not read it', async () => {
    mockFlowApi((req) =>
      req.pathname === '/api/v1/flow' ? errorResponse(404, 'no such route') : undefined
    );
    renderAt('/flow', '/flow', <FlowPage />);
    expect(await screen.findByText('Not available on this server version.')).toBeInTheDocument();
    vi.restoreAllMocks();

    mockFlowApi((req) =>
      req.pathname === '/api/v1/flow' ? errorResponse(403, 'admin only') : undefined
    );
    renderAt('/flow', '/flow', <FlowPage />);
    expect(await screen.findByText('Only admins can see the delivery line.')).toBeInTheDocument();
  });

  it('sends Layout mode to Runners until it is built', async () => {
    mockFlowApi();
    renderAt('/flow?mode=layout', '/flow', <FlowPage />);
    expect(await screen.findByText('Layout is not on this page yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Runners' })).toHaveAttribute('href', '/runners');
  });
});
