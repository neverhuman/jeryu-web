// FlowPage.test.tsx — `/flow`: one number per station with the bottleneck
// marked and opened by default, the picked station's work oldest first, the
// stale part folded into one line, the 50-row cap, the listed-of-counted line,
// the family from the header scope, and what the page says on a server or to a
// reader that will not answer it.

import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowLot, FlowReport } from '../../api/types';
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

/** The instant FLOW_REPORT was read at; every age is measured from it. */
const NOW = new Date('2026-10-14T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function lot(lot_id: string, at: string, daysAgo: number, over: Partial<FlowLot> = {}): FlowLot {
  return {
    lot_id,
    station: at,
    state: 'waiting',
    since: new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString(),
    eta_s: null,
    eta_partial: false,
    eta_unknown_stations: [],
    slowest_ahead: null,
    href: `/work/${lot_id}`,
    ...over,
  };
}

function mockFlowApi(report: FlowReport = FLOW_REPORT, override?: Override): Recorded[] {
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
      return json({ ...report, family: url.searchParams.get('family') });
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

const ids = (list: HTMLElement): string[] =>
  Array.from(list.querySelectorAll('.flow-items__id')).map((node) => node.textContent ?? '');

describe('FlowPage', () => {
  it('shows one number per station, marks the bottleneck and opens it by default', async () => {
    mockFlowApi();
    renderAt('/flow', '/flow', <FlowPage />);
    const strip = await screen.findByTestId('flow-strip');
    expect(within(strip).getAllByRole('link')).toHaveLength(9);
    // Active, waiting and held together.
    expect(screen.getByTestId('flow-strip-station-gate')).toHaveTextContent('Gate5Bottleneck');
    expect(screen.getByTestId('flow-strip-station-review')).toHaveTextContent('Review2');
    // Nothing has reached Pin: no number, never a zero.
    expect(screen.getByTestId('flow-strip-station-pin')).toHaveTextContent('Pin—');
    expect(screen.getByTestId('flow-strip-station-gate')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('flow-station')).toHaveAttribute('data-station', 'gate');
    // A pick is an address of its own, so it is linkable and Back returns.
    expect(screen.getByTestId('flow-strip-station-review')).toHaveAttribute('href', '/flow?station=review');
  });

  it('lists the picked station oldest first, with why each item is held and its links', async () => {
    mockFlowApi();
    renderAt('/flow?station=review', '/flow', <FlowPage />);
    const current = await screen.findByTestId('flow-current');
    expect(ids(current)).toEqual(['acme-0003', 'acme/widgets#43']);
    const held = screen.getByTestId('flow-item-acme/widgets#43');
    expect(held).toHaveTextContent('review held it · held 5h 30m by acme-reviewer');
    expect(held).toHaveTextContent('nobody acting');
    expect(within(held).getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      '/repos/jeryu/acme/widgets/pulls/43#changes-requested'
    );
    // A held item with no recorded hold says so rather than inventing one.
    expect(screen.getByTestId('flow-item-acme-0003')).toHaveTextContent('no reason recorded');
    expect(screen.getByTestId('flow-item-acme-0003')).toHaveTextContent('todo');
    expect(within(screen.getByTestId('flow-item-acme-0003')).getByRole('link')).toHaveAttribute(
      'href',
      '/work/acme-0003'
    );
  });

  it('folds items older than 14 days into one stale line that lists them on click', async () => {
    mockFlowApi({
      ...FLOW_REPORT,
      lots: [
        ...FLOW_REPORT.lots,
        lot('acme-old-1', 'gate', 30, { state: 'active' }),
        lot('acme-old-2', 'gate', 15),
        lot('acme-new', 'gate', 13),
      ],
    });
    renderAt('/flow?station=gate', '/flow', <FlowPage />);
    const current = await screen.findByTestId('flow-current');
    expect(ids(current)).toEqual(['acme-new', 'acme-0001', 'acme/widgets#42', 'acme-0002']);
    // Collapsed means not rendered, not hidden.
    expect(screen.queryByTestId('flow-stale')).toBeNull();
    const toggle = screen.getByTestId('flow-stale-toggle');
    expect(toggle).toHaveTextContent('2 stale · older than 14 days');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(ids(screen.getByTestId('flow-stale'))).toEqual(['acme-old-1', 'acme-old-2']);
  });

  it('caps a list at 50 rows until the reader asks for all of them', async () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      lot(`acme-${String(index).padStart(4, '0')}x`, 'queue', 1 + index / 100)
    );
    mockFlowApi({ ...FLOW_REPORT, lots: many });
    renderAt('/flow?station=queue', '/flow', <FlowPage />);
    const current = await screen.findByTestId('flow-current');
    expect(within(current).getAllByRole('listitem')).toHaveLength(50);
    // Oldest first: the item set furthest back leads.
    expect(ids(current)[0]).toBe('acme-0059x');
    fireEvent.click(screen.getByTestId('flow-current-show-all'));
    expect(within(screen.getByTestId('flow-current')).getAllByRole('listitem')).toHaveLength(60);
    expect(screen.queryByTestId('flow-current-show-all')).toBeNull();
  });

  it('says how many of the counted items the server lists, for the line and the station', async () => {
    mockFlowApi({
      ...FLOW_REPORT,
      repository_wip: [
        { repo: 'acme/widgets-deploy', station: 'gate', waiting: 1, active: 1, held: 0 },
        { repo: 'acme/widgets', station: 'gate', waiting: 2, active: 1, held: 0 },
        { repo: 'acme/widgets', station: 'review', waiting: 1, active: 0, held: 1 },
      ],
    });
    renderAt('/flow', '/flow', <FlowPage />);
    expect(await screen.findByTestId('flow-coverage')).toHaveTextContent('6 of 13 in progress listed');
    expect(screen.getByTestId('flow-station')).toHaveTextContent('Gate · 5 in progress · 3 of 5 listed');
    // Per repository at this station only, most first.
    expect(screen.getByTestId('flow-station-repos')).toHaveTextContent('acme/widgets 3acme/widgets-deploy 2');
  });

  it('notes when the read left families out', async () => {
    mockFlowApi({
      ...FLOW_REPORT,
      topology: { families: [], products: [], unscoped_active_lots: 0, unknown: [], families_truncated: true },
    });
    renderAt('/flow', '/flow', <FlowPage />);
    expect(await screen.findByTestId('flow-coverage')).toHaveTextContent(
      'some families are left out of this read'
    );
  });

  it('opens the busiest station when the bottleneck has nothing in progress', async () => {
    mockFlowApi({
      ...FLOW_REPORT,
      stations: FLOW_REPORT.stations.map((station) => ({ ...station, bottleneck: station.id === 'deploy' })),
    });
    renderAt('/flow', '/flow', <FlowPage />);
    expect(await screen.findByTestId('flow-station')).toHaveAttribute('data-station', 'gate');
    expect(screen.getByTestId('flow-strip-station-deploy')).toHaveTextContent('Bottleneck');
  });

  it('reads the header family and no window, and ignores the old controls', async () => {
    const calls = mockFlowApi();
    renderAt('/flow?family=acme&days=7&mode=layout', '/flow', <FlowPage />);
    await screen.findByTestId('flow-strip');
    const query = flowCalls(calls)[0];
    expect(query?.get('family')).toBe('acme');
    expect(query?.has('days')).toBe(false);
    expect(screen.queryByRole('group', { name: 'Window' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Mode' })).toBeNull();
    // A pick keeps the family and drops the old parameters.
    expect(screen.getByTestId('flow-strip-station-work')).toHaveAttribute(
      'href',
      '/flow?family=acme&station=work'
    );
  });

  it('says so when nothing is in progress', async () => {
    mockFlowApi({
      ...FLOW_REPORT,
      stations: FLOW_REPORT.stations.map((station) => ({
        ...station,
        wip: { waiting: 0, active: 0, held: 0 },
      })),
      line: { ...FLOW_REPORT.line, wip: 0 },
      lots: [],
    });
    renderAt('/flow', '/flow', <FlowPage />);
    expect(await screen.findByText('Nothing is in progress.')).toBeInTheDocument();
  });

  it('says so on a server without the route, and to a reader who may not read it', async () => {
    mockFlowApi(FLOW_REPORT, (req) =>
      req.pathname === '/api/v1/flow' ? errorResponse(404, 'no such route') : undefined
    );
    renderAt('/flow', '/flow', <FlowPage />);
    expect(await screen.findByText('Not available on this server version.')).toBeInTheDocument();
    vi.restoreAllMocks();

    mockFlowApi(FLOW_REPORT, (req) =>
      req.pathname === '/api/v1/flow' ? errorResponse(403, 'admin only') : undefined
    );
    renderAt('/flow', '/flow', <FlowPage />);
    expect(await screen.findByText('Only admins can see the delivery line.')).toBeInTheDocument();
  });
});
