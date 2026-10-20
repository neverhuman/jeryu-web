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
    expect(screen.getByTestId('flow-line-strip')).toHaveTextContent('Gate holds the most waiting');
  });

  it('shares the nine-station strip and selects a station without losing the window', async () => {
    mockFlowApi();
    renderAt('/flow?days=7', '/flow', <FlowPage />);
    const strip = await screen.findByTestId('flow-line-strip');
    expect(within(strip).getAllByRole('button')).toHaveLength(9);
    expect(within(strip).getByTestId('flow-line-strip-station-review')).toHaveTextContent('1');
    fireEvent.click(within(strip).getByTestId('flow-line-strip-station-gate'));
    expect(await screen.findByTestId('flow-lots')).toHaveTextContent('At Gate, oldest first');
    expect(within(strip).getByTestId('flow-line-strip-station-gate')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '7 d' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('flow-mode-layout'));
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

  it('Layout mode lists the runners of each station and flags a station short of tools', async () => {
    mockFlowApi();
    renderAt('/flow?mode=layout', '/flow', <FlowPage />);
    const gate = await screen.findByTestId('flow-layout-card-gate');
    expect(gate).toHaveAttribute('data-tone', 'human');
    expect(screen.getByTestId('flow-layout-capacity-gate')).toHaveTextContent('2 of 4 expected reporting');
    const gateB = within(gate).getByTestId('flow-layout-tool-gate-b');
    expect(gateB).toHaveTextContent('node-b');
    expect(gateB).toHaveTextContent('online · busy');
    expect(gateB).toHaveTextContent('2.0.9 (1234567)');
    expect(within(gate).getByTestId('flow-layout-tool-gate-c')).toHaveTextContent('offline · idle');
    // No tool reports for Merge: red, and the summary names it.
    expect(screen.getByTestId('flow-layout-card-merge')).toHaveAttribute('data-tone', 'human');
    expect(screen.getByTestId('flow-layout-summary')).toHaveTextContent('Gate, Merge');
    // A healthy station without a configured expectation is not red and says so.
    const review = screen.getByTestId('flow-layout-card-review');
    expect(review).toHaveAttribute('data-tone', 'ok');
    expect(screen.getByTestId('flow-layout-capacity-review')).toHaveTextContent('expected capacity not set');
  });

  it('Layout mode says so when the server has no layout route', async () => {
    mockFlowApi((req) => (req.pathname === '/api/v1/flow/layout' ? errorResponse(404, 'no route') : undefined));
    renderAt('/flow?mode=layout', '/flow', <FlowPage />);
    expect(await screen.findByText('Not available on this server version.')).toBeInTheDocument();
  });

  it('switches mode in the address and keeps the window', async () => {
    mockFlowApi();
    renderAt('/flow?days=7', '/flow', <FlowPage />);
    fireEvent.click(await screen.findByTestId('flow-mode-layout'));
    expect(await screen.findByTestId('flow-layout')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('flow-mode-live'));
    expect(await screen.findByTestId('flow-body')).toBeInTheDocument();
  });
});

const ROUTE = (approvals: number | null, checks: string[] | null, kind: string) => ({
  kind,
  source: kind === 'unknown' ? 'unreadable' : 'branch_protection',
  approvals,
  required_checks: checks,
});

const repoNode = (repo: string, over: Record<string, unknown> = {}) => ({
  repo,
  role: 'source',
  shared: false,
  pins_into: [],
  pin_source: 'none',
  route: ROUTE(1, ['required'], 'automated'),
  active_lots: 0,
  no_current_work: true,
  ...over,
});

const WORK = (over: Record<string, number> = {}) => ({
  active_lots: 0,
  changes: 0,
  pull_requests: 0,
  pin_pull_requests: 0,
  release_artifacts: 0,
  ...over,
});

/** One product, as a family that declares none gets by default. */
const ONE_PRODUCT = {
  families: [{ family: 'acme', products: 1, repos: 3, work: WORK({ active_lots: 2, pull_requests: 1, pin_pull_requests: 1 }) }],
  products: [
    {
      id: 'acme',
      label: 'acme',
      family: 'acme',
      source: 'family_default',
      integration: 'acme/widgets-deploy',
      release: { repo: 'acme/widgets-deploy', source: 'integration_repo', stations: ['stage', 'deploy'] },
      work: WORK({ active_lots: 2, pull_requests: 1, pin_pull_requests: 1 }),
      repos: [
        repoNode('acme/widgets', { pins_into: ['acme/widgets-deploy'], pin_source: 'pin_lock', active_lots: 1, no_current_work: false }),
        repoNode('acme/widgets-deploy', { role: 'integration', route: ROUTE(0, [], 'no_gate'), active_lots: 1, no_current_work: false }),
        repoNode('acme/widgets-core', { pins_into: ['acme/widgets-deploy'], pin_source: 'pin_lock', route: ROUTE(2, [], 'human_only') }),
      ],
    },
  ],
  unscoped_active_lots: 0,
  unknown: [],
  families_truncated: false,
};

/** Two product groups sharing one dependency, as veox-ai is configured. */
const TWO_PRODUCTS = {
  families: [{ family: 'veox-ai', products: 2, repos: 5, work: WORK({ active_lots: 2, changes: 1, pull_requests: 1 }) }],
  products: [
    {
      id: 'portal', label: 'Veox portal', family: 'veox-ai', source: 'declared',
      integration: 'veox-ai/veox-portal-deploy',
      release: { repo: 'veox-ai/veox-portal-deploy', source: 'declared', stations: ['stage', 'deploy'] },
      work: WORK({ active_lots: 2, changes: 1, pull_requests: 1 }),
      repos: [
        repoNode('veox-ai/veox-portal', { active_lots: 1, no_current_work: false, pins_into: ['veox-ai/veox-portal-deploy'], pin_source: 'pin_lock' }),
        repoNode('veox-ai/veox-shared', { shared: true, active_lots: 1, no_current_work: false, pins_into: ['veox-ai/veox-portal-deploy'], pin_source: 'pin_lock' }),
        repoNode('veox-ai/veox-portal-deploy', { role: 'integration' }),
      ],
    },
    {
      id: 'studio', label: 'Veox studio', family: 'veox-ai', source: 'declared',
      integration: null, release: null,
      work: WORK({ active_lots: 1, pull_requests: 1 }),
      repos: [
        repoNode('veox-ai/veox-studio'),
        repoNode('veox-ai/veox-shared', { shared: true, active_lots: 1, no_current_work: false }),
      ],
    },
  ],
  unscoped_active_lots: 1,
  unknown: [
    { scope: 'studio', field: 'integration_repo', reason: 'no_pin_lock_or_declaration' },
    { scope: 'family', field: 'lot_repository', reason: 'visits_name_no_repository' },
  ],
  families_truncated: false,
};

describe('Flow family and product topology', () => {
  it('shows every configured repository converging on the shared chain, and scopes a click', async () => {
    const calls = mockFlowApi((req) =>
      req.pathname === '/api/v1/flow'
        ? json({
            ...FLOW_REPORT,
            topology: ONE_PRODUCT,
            repository_wip: [
              { repo: 'acme/widgets', station: 'gate', waiting: 1, active: 0, held: 0 },
              { repo: 'acme/widgets-deploy', station: 'gate', waiting: 2, active: 0, held: 0 },
            ],
          })
        : undefined
    );
    renderAt('/flow', '/flow', <FlowPage />);
    await screen.findByTestId('flow-product-acme');
    // The family headline counts one work item once, however many stations it is at.
    expect(screen.getByTestId('flow-family-acme')).toHaveTextContent(
      '3 configured repositories · 2 in flight · 1 pull request · 1 pin pull request'
    );
    // A configured repository with no work in flight is still on the map.
    expect(screen.getByTestId('flow-repo-acme/widgets-core')).toHaveTextContent('configured · no current work');
    expect(screen.getByTestId('flow-repo-acme/widgets-core')).toHaveTextContent(
      'No checks required by configuration · human decision only'
    );
    expect(screen.getByTestId('flow-repo-acme/widgets')).toHaveTextContent('Pins into acme/widgets-deploy (pin lock)');
    expect(screen.getByTestId('flow-converge-acme')).toHaveTextContent('converge in acme/widgets-deploy');
    // The source lane and the integration repository's own cycle are separate.
    expect(screen.getByTestId('flow-card-gate')).toHaveTextContent('1 waiting');
    expect(screen.getByTestId('flow-card-consumer-gate')).toHaveTextContent('2 waiting');
    expect(screen.getByTestId('flow-card-consumer-review')).toHaveTextContent(
      'No approval required by configuration · pass-through'
    );
    expect(screen.getByText(/awaiting activation authorization/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('flow-card-consumer-gate'));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.pathname === '/api/v1/flow' && new URLSearchParams(c.search).get('repo') === 'acme/widgets-deploy'
        )
      ).toBe(true)
    );
    expect(await screen.findByTestId('flow-detail')).toHaveTextContent('Selected station · acme/widgets-deploy');
    // The drilldown keeps the product visible and offers the way back.
    expect(screen.getByTestId('flow-drilldown')).toHaveTextContent('acme/widgets-deploy');
    expect(screen.getByTestId('flow-product-acme')).toBeInTheDocument();
  });

  it('groups several products, marks a shared dependency and discloses what is unknown', async () => {
    mockFlowApi((req) =>
      req.pathname === '/api/v1/flow' ? json({ ...FLOW_REPORT, topology: TWO_PRODUCTS }) : undefined
    );
    renderAt('/flow', '/flow', <FlowPage />);
    await screen.findByTestId('flow-product-portal');
    expect(screen.getByTestId('flow-product-studio')).toBeInTheDocument();
    // The shared repository is in both products and marked in both.
    expect(screen.getAllByTestId('flow-shared-veox-ai/veox-shared')).toHaveLength(2);
    // The family total counts the shared work once; the products keep their own.
    expect(screen.getByTestId('flow-family-veox-ai')).toHaveTextContent(
      '5 configured repositories · 2 in flight'
    );
    expect(screen.getByTestId('flow-product-portal')).toHaveTextContent('2 in flight');
    expect(screen.getByTestId('flow-product-studio')).toHaveTextContent('1 in flight');
    // A product with no configured convergence point says so instead of guessing.
    expect(screen.getByTestId('flow-converge-studio')).toHaveTextContent('No configured convergence point');
    const coverage = screen.getByTestId('flow-topology-coverage');
    expect(coverage).toHaveTextContent('studio: convergence point — no declaration and no readable pin lock');
    expect(coverage).toHaveTextContent('1 recorded work item name no repository');
    // Each product keeps its own addressable stations.
    expect(screen.getByTestId('flow-card-portal-gate')).toBeInTheDocument();
    expect(screen.getByTestId('flow-card-studio-gate')).toBeInTheDocument();
  });

  it('narrows to one product when a repository of it is picked', async () => {
    mockFlowApi((req) =>
      req.pathname === '/api/v1/flow' ? json({ ...FLOW_REPORT, topology: TWO_PRODUCTS }) : undefined
    );
    renderAt('/flow?repo=veox-ai/veox-studio', '/flow', <FlowPage />);
    await screen.findByTestId('flow-product-studio');
    expect(screen.queryByTestId('flow-product-portal')).toBeNull();
    expect(screen.getByTestId('flow-card-gate')).toBeInTheDocument();
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
