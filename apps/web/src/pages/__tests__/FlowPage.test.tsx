// FlowPage.test.tsx — `/flow` Live mode: the strip and the station cards, the
// rework loops, a station's lots, the window and station in the address, and
// what the page says on a server or to a reader that will not answer it.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { flowHistory, FLOW_LAYOUT } from '../../../e2e/fixtures/flowHistory';
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
    if (url.pathname === '/api/v1/flow/history') return json(flowHistory(url.searchParams));
    if (url.pathname === '/api/v1/flow/layout') return json(FLOW_LAYOUT);
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
  it('keeps closed work discoverable, segments dispositions, and opens its history', async () => {
    mockFlowApi(req => req.pathname === '/api/v1/flow' ? json({ ...FLOW_REPORT, closures: [
      { lot_id: 'acme/widgets#90', station: 'gate', kind: 'pull_request', href: '/acme/widgets/pull/90', title: 'Unexplained closure', disposition: 'needs_disposition', explanation: '', replacement: null, needs_attention: true },
      { lot_id: 'acme/widgets#91', station: 'review', kind: 'pull_request', href: '/acme/widgets/pull/91', title: 'Replaced work', disposition: 'replacement_recorded', explanation: 'Superseded-by: #92', replacement: { href: '/acme/widgets/pull/92', label: 'acme/widgets#92', state: 'open' }, needs_attention: false },
    ] }) : undefined);
    renderAt('/flow', '/flow', <FlowPage />);
    const panel = await screen.findByTestId('flow-closures');
    fireEvent.click(within(panel).getByText('Inspect closed work'));
    expect(panel).toHaveTextContent('2 items · 1 need attention');
    expect(within(panel).getByRole('link', { name: 'acme/widgets#90' })).toHaveAttribute('href', '/acme/widgets/pull/90');
    expect(within(panel).queryByText('Replaced work')).toBeNull();
    fireEvent.change(within(panel).getByLabelText('Disposition'), { target: { value: 'replacement_recorded' } });
    expect(within(panel).getByRole('link', { name: 'acme/widgets#92' })).toHaveAttribute('href', '/acme/widgets/pull/92');
    fireEvent.click(within(panel).getByRole('button', { name: 'Inspect history' }));
    expect(await screen.findByTestId('flow-item-journey')).toHaveTextContent('acme/widgets#91');
  });

  it('shows configured parallel decisions without inventing an unknown release route', async () => {
    mockFlowApi();
    renderAt('/flow', '/flow', <FlowPage />);
    await screen.findByTestId('flow-body');
    expect(screen.getByTestId('flow-card-gate')).toHaveTextContent('3 waiting');
    expect(screen.getByTestId('flow-card-gate')).toHaveTextContent('2 running');
    expect(screen.getByText(/Current revision satisfies configured/)).toBeInTheDocument();
    expect(screen.queryByText(/awaiting activation authorization/)).toBeNull();
    expect(screen.queryByTestId('flow-bottleneck-badge')).toBeNull();
    expect(screen.queryByTestId('flow-line-strip')).toBeNull();
  });

  it('filters daily transitions and opens the named runner and item journey', async () => {
    const calls = mockFlowApi();
    renderAt('/flow?station=gate', '/flow', <FlowPage />);
    await screen.findByTestId('flow-daily-chart');
    fireEvent.click(screen.getByRole('button', { name: '2026-10-13: Returned for fixes 1' }));
    await waitFor(() => expect(calls.some(c => c.pathname.endsWith('/history') && c.search.includes('state=rework') && c.search.includes('day=2026-10-13'))).toBe(true));
    await screen.findByText('Repair the queue');
    expect(screen.getByRole('link', { name: 'Runner gate-b' })).toHaveAttribute('href', '/runners?runners=gate-b');
    const history = screen.getByText('Repair the queue').closest('li')!;
    fireEvent.click(within(history).getByRole('button', { name: 'Inspect journey' }));
    await screen.findByTestId('flow-item-journey');
    expect(screen.getByTestId('flow-item-journey')).toHaveTextContent('acme/widgets#41');
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
      '/repos/jeryu/acme/widgets/pulls/42'
    );


    // A held lot has no estimate: its next step is a person.
    fireEvent.click(screen.getByTestId('flow-card-review'));
    await waitFor(() =>
      expect(screen.getByTestId('flow-lots')).toHaveTextContent('held — awaiting an explicit release decision')
    );
    // A lot held for a named reason says why, by whom, for how long, and
    // links to its pull request and review; nobody acting is its own badge.
    const hold = screen.getByTestId('flow-hold-acme/widgets#43');
    expect(hold).toHaveTextContent('review held it');
    expect(hold).toHaveTextContent('held by acme-reviewer, 5h 30m');
    expect(within(hold).getByTestId('flow-nobody-acting-acme/widgets#43')).toHaveTextContent('nobody acting');
    expect(within(hold).getByRole('link', { name: 'Pull request' })).toHaveAttribute(
      'href',
      '/repos/jeryu/acme/widgets/pulls/43'
    );
    expect(within(hold).getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      '/repos/jeryu/acme/widgets/pulls/43#changes-requested'
    );
  });

  it('keeps the window and the station in the address and the request', async () => {
    const calls = mockFlowApi();
    renderAt('/flow?days=7&station=gate', '/flow', <FlowPage />);
    await screen.findByTestId('flow-body');
    expect(flowCalls(calls)[0].get('days')).toBe('7');
    // A deep link lists that station's lots without a click.
    expect(screen.getByTestId('flow-lots')).toHaveTextContent('At Gate, oldest first');
    expect(screen.getByTestId('flow-card-gate')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: '90 d' }));
    await waitFor(() => expect(flowCalls(calls).at(-1)?.get('days')).toBe('90'));

    fireEvent.click(screen.getByTestId('flow-card-review'));
    expect(screen.getByTestId('flow-detail')).toHaveTextContent('Assess the current pull request revision independently.');
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

describe('Flow repository handoff', () => {
  it('shows a second independent PR cycle and scopes its station request', async () => {
    const calls = mockFlowApi(req => req.pathname === '/api/v1/flow' ? json({ ...FLOW_REPORT, repository_wip: [
      { repo: 'acme/jeryu-web', station: 'gate', waiting: 1, active: 0, held: 0 },
      { repo: 'acme/jeryu-deploy', station: 'gate', waiting: 2, active: 0, held: 0 },
    ] }) : undefined);
    renderAt('/flow', '/flow', <FlowPage />);
    await screen.findByTestId('flow-card-consumer-gate');
    expect(screen.getAllByText(/Current revision satisfies configured/)).toHaveLength(2);
    expect(screen.getByTestId('flow-card-gate')).toHaveTextContent('1 waiting');
    expect(screen.getByTestId('flow-card-consumer-gate')).toHaveTextContent('2 waiting');
    fireEvent.click(screen.getByTestId('flow-card-consumer-gate'));
    await waitFor(() => expect(calls.some(c => c.pathname === '/api/v1/flow' && new URLSearchParams(c.search).get('repo') === 'acme/jeryu-deploy')).toBe(true));
    expect(await screen.findByTestId('flow-detail')).toHaveTextContent('Selected station · acme/jeryu-deploy');
    expect(screen.getByText(/awaiting activation authorization/)).toBeInTheDocument();
  });
});


describe('Flow repository requirements', () => {
  it.each([0, 2])('reads required approvals (%s) and check pass-through from the branch rule', async (approvals) => {
    mockFlowApi(req => {
      if (req.pathname.endsWith('/automation')) return json({ repo: 'acme/widgets', defaultBranch: 'main', requiredContexts: [], checks: [], actors: [], mirrors: [], grants: [], grantsVisible: false, warnings: [] });
      if (req.pathname.endsWith('/protection')) return json({ required_status_checks: { contexts: [] }, required_pull_request_reviews: { required_approving_review_count: approvals } });
      if (req.pathname === '/api/v1/flow') return json({ ...FLOW_REPORT, repo: 'acme/widgets', repository_wip: [{ repo: 'acme/widgets', station: 'gate', waiting: 1, active: 0, held: 0 }] });
      return undefined;
    });
    renderAt('/flow?repo=acme/widgets&station=gate', '/flow', <FlowPage />);
    await waitFor(() => expect(screen.getByTestId('flow-card-gate')).toHaveTextContent('No checks required by branch rule · pass-through'));
    expect(screen.getByTestId('flow-card-review')).toHaveTextContent(approvals ? '2 approving reviews required' : 'No approval required by branch rule · pass-through');
    expect(screen.getByTestId('flow-detail')).toHaveTextContent('current default-branch rules');
    expect(screen.getByRole('link', { name: 'Inspect repository configuration' })).toHaveAttribute('href', '/acme/widgets/settings/branch-protection');
  });
  it('does not infer pass-through or human-only policy from missing configuration', async () => {
    mockFlowApi(req => req.pathname === '/api/v1/flow' ? json({ ...FLOW_REPORT, repository_wip: [{ repo: 'acme/widgets', station: 'gate', waiting: 1, active: 0, held: 0 }] }) : undefined);
    renderAt('/flow', '/flow', <FlowPage />);
    await screen.findByTestId('flow-card-gate');
    expect(screen.getByTestId('flow-card-gate')).toHaveTextContent('Check requirement unknown');
    expect(screen.queryByText(/No checks required by branch rule/)).toBeNull();
  });
});


describe('Flow review accuracy', () => {
  it('selects the only deploy repository and preserves unspecified release stations', async () => {
    mockFlowApi(req => req.pathname === '/api/v1/flow' ? json({ ...FLOW_REPORT, repository_wip: [{ repo: 'acme/other-deploy', station: 'gate', waiting: 1, active: 0, held: 0 }] }) : undefined);
    renderAt('/flow', '/flow', <FlowPage />);
    expect(await screen.findByRole('combobox', { name:'Change repository' })).toHaveValue('acme/other-deploy');
    expect(screen.getByTestId('flow-card-gate')).toHaveTextContent('1 waiting');
    for (const id of ['pin','stage','deploy']) expect(screen.getByTestId(`flow-card-${id}`)).toHaveTextContent('No open visits recorded');
    expect(screen.getByText('Route configuration unavailable')).toBeInTheDocument();
  });
  it('does not invent a consumer repository or discard required contexts on an unprotected branch', async () => {
    mockFlowApi(req => {
      if (req.pathname.endsWith('/automation')) return json({ repo:'acme/jeryu-web', defaultBranch:'main', requiredContexts:['widgets/required'], checks:[],actors:[],mirrors:[],grants:[],warnings:[] });
      if (req.pathname.endsWith('/protection')) return errorResponse(404,'no rule');
      if (req.pathname === '/api/v1/flow') return json({ ...FLOW_REPORT, repository_wip:[{repo:'acme/jeryu-web',station:'gate',waiting:1,active:0,held:0}] });
      return undefined;
    });
    renderAt('/flow','/flow',<FlowPage />);
    await waitFor(() => expect(screen.getByTestId('flow-card-gate')).toHaveTextContent('1 required check'));
    expect(screen.queryByTestId('flow-card-consumer-gate')).toBeNull();
    expect(screen.getByTestId('flow-card-deploy')).toBeInTheDocument();
  });
  it('does not include a similarly named repository in a station list', async () => {
    mockFlowApi(req => req.pathname === '/api/v1/flow' ? json(FLOW_REPORT) : undefined);
    renderAt('/flow?repo=acme/widget&station=gate','/flow',<FlowPage />);
    await screen.findByTestId('flow-detail');
    expect(screen.queryByTestId('flow-lot-acme/widgets#42')).toBeNull();
  });
});
