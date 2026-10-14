// YieldPage.test.tsx — the Yield page on a mocked `GET /api/v1/yield`: the
// headline and KPI row, the funnel, the arms table and its "not enough data
// yet", the breakdown and its cut, the todo lists, the controls in the
// request, the ad-hoc agent sessions beside (never inside) those numbers, and
// the states (loading, empty, older server, not an admin, error).

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { YieldPage } from '../yield/YieldPage';
import { windowDates } from '../yield/yieldModel';
import { errorResponse, json, recordHeaders, renderAt, type Override, type Recorded } from './shiftPageHelpers';
import { ADHOC, REPORT, REPORT_WITH_ADHOC, row } from './yieldTestData';

afterEach(() => vi.restoreAllMocks());

/** Serve the report; anything unmocked answers 404 like a server without it. */
function mockYieldApi(override?: Override): Recorded[] {
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
    if (url.pathname === '/api/v1/yield') {
      const by = url.searchParams.get('by') ?? 'model';
      return json({ ...REPORT, by });
    }
    return errorResponse(404, `unmocked ${url.pathname}`);
  });
  return calls;
}

function yieldCalls(calls: Recorded[]): URLSearchParams[] {
  return calls
    .filter((call) => call.pathname === '/api/v1/yield')
    .map((call) => new URLSearchParams(call.search));
}

describe('YieldPage', () => {
  it('leads with cost per merged change and explains it underneath', async () => {
    mockYieldApi();
    renderAt('/yield', '/yield', <YieldPage />);

    const headline = await screen.findByTestId('yield-kpi-per-merged');
    expect(headline).toHaveTextContent('Cost per merged change');
    expect(headline).toHaveTextContent('$5.00');
    expect(headline).toHaveTextContent('95% range $3.90–$6.10');
    expect(screen.getByTestId('yield-kpi-yield')).toHaveTextContent('83%');
    expect(screen.getByTestId('yield-kpi-first-pass')).toHaveTextContent('70%');
    expect(screen.getByTestId('yield-kpi-review-share')).toHaveTextContent('20%');
    expect(screen.getByTestId('yield-kpi-waste')).toHaveTextContent('$12.50');

    expect(screen.getByTestId('yield-spend-summary')).toHaveTextContent(
      '$200 spent on 40 todos over 58 attempts in the last 28 days; 30 changes reached main.'
    );
    expect(screen.getByTestId('yield-funnel-outcome-main')).toHaveTextContent('Reached main $150 75%');
    expect(screen.getByTestId('yield-funnel-outcome-scrap')).toHaveTextContent('Scrapped $30.00 15%');
    expect(screen.getByTestId('yield-funnel-source-review')).toHaveTextContent('Review $40.00 20%');
    expect(
      screen.getByRole('img', { name: /^By outcome: Reached main \$150 \(75%\)/ })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('img', { name: /^Cost per merged change by week, 2026-09-14 to 2026-09-28/ })
    ).toBeInTheDocument();
    expect(screen.getByTestId('yield-price-sources')).toHaveTextContent(
      'Token prices: catalog@0000001, config.'
    );
    expect(screen.getByTestId('yield-price-sources')).toHaveTextContent(
      'Window 2026-09-11 to 2026-10-09 (UTC).'
    );
  });

  it('shows ad-hoc session spend after the breakdown, outside cost per merged change', async () => {
    const calls = mockYieldApi((req) => (req.pathname === '/api/v1/yield' ? json(REPORT_WITH_ADHOC) : undefined));
    renderAt('/yield', '/yield', <YieldPage />);
    const section = await screen.findByTestId('yield-adhoc');
    expect(within(section).getByRole('heading', { name: 'Ad-hoc agent sessions' })).toBeInTheDocument();
    expect(screen.getByTestId('yield-adhoc-note')).toHaveTextContent('not in cost per merged change');
    // The headline is todo work alone, whatever the sessions spent.
    expect(screen.getByTestId('yield-kpi-per-merged')).toHaveTextContent('$5.00');
    expect(screen.getByTestId('yield-adhoc-tile-total')).toHaveTextContent('$12.34');
    expect(screen.getByTestId('yield-adhoc-tile-sessions')).toHaveTextContent('7');
    expect(screen.getByTestId('yield-adhoc-tile-unattributed')).toHaveTextContent('$1.20');

    // After the breakdown, before the todo lists.
    const breakdown = screen.getByTestId('yield-breakdown-table');
    expect(breakdown.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.compareDocumentPosition(screen.getByTestId('yield-costliest')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const table = within(section).getByTestId('yield-adhoc-table');
    expect(within(table).getByRole('columnheader', { name: 'Family' })).toBeInTheDocument();
    expect(screen.getByTestId('yield-adhoc-group-acme')).toHaveTextContent('acme574%$9.14');
    expect(screen.getByTestId('yield-adhoc-remainder')).toHaveTextContent('No family—10%$1.20');
    expect(within(table).getByTestId('yield-adhoc-total')).toHaveTextContent('All7100%$12.34');
    expect(within(section).getByRole('img', { name: /^Ad-hoc spend by week, 2026-09-21 to 2026-10-05/ })).toBeInTheDocument();

    const cut = within(section).getByRole('group', { name: 'Break ad-hoc spend down by' });
    fireEvent.click(within(cut).getByRole('button', { name: 'Repository' }));
    const repo = await screen.findByTestId('yield-adhoc-group-acme/widgets');
    expect(within(repo).getByRole('link', { name: 'acme/widgets' })).toHaveAttribute('href', '/repos/jeryu/acme/widgets');
    expect(repo).toHaveTextContent('acme');
    expect(within(cut).getByRole('button', { name: 'Repository' })).toHaveAttribute('aria-pressed', 'true');
    // The ad-hoc cut is the page's own choice: it never changes the request.
    expect(yieldCalls(calls).every((query) => !query.has('adhoc'))).toBe(true);
  });

  it('hides the ad-hoc section on a server that does not send it', async () => {
    mockYieldApi();
    renderAt('/yield', '/yield', <YieldPage />);
    await screen.findByTestId('yield-breakdown-table');
    expect(screen.queryByTestId('yield-adhoc')).toBeNull();
  });

  it('says so in a line when no ad-hoc session spent in the window', async () => {
    mockYieldApi((req) =>
      req.pathname === '/api/v1/yield'
        ? json({
            ...REPORT,
            adhoc: { ...ADHOC, total_usd: 0, sessions: 0, unattributed_usd: 0, by_family: [], by_repo: [], by_agent: [], by_model: [], weekly: [] },
          })
        : undefined
    );
    renderAt('/yield', '/yield', <YieldPage />);
    expect(await screen.findByTestId('yield-adhoc-none')).toHaveTextContent(
      'No ad-hoc agent session reported spend in this window.'
    );
    expect(screen.queryByTestId('yield-adhoc-table')).toBeNull();
  });

  it('still shows ad-hoc spend in a window with no todo work', async () => {
    mockYieldApi((req) =>
      req.pathname === '/api/v1/yield'
        ? json({ ...REPORT_WITH_ADHOC, totals: row(), groups: [], weekly: [], experiments: [], costliest: [], scrap: [] })
        : undefined
    );
    renderAt('/yield?adhoc=model', '/yield', <YieldPage />);
    expect(await screen.findByText('No work in this window.')).toBeInTheDocument();
    expect(screen.getByTestId('yield-adhoc-group-model-x')).toHaveTextContent('$11.00');
  });

  it('holds an arm back until it has enough data', async () => {
    mockYieldApi();
    renderAt('/yield', '/yield', <YieldPage />);
    const ready = await screen.findByTestId('yield-arm-claude-model-a');
    expect(screen.getByRole('columnheader', { name: 'Reworked' })).toBeInTheDocument();
    expect(ready).toHaveTextContent('claude · model-a');
    expect(ready).toHaveTextContent('75%');
    expect(ready).toHaveTextContent('$5.00');
    expect(within(ready).queryByText('Not enough data yet')).toBeNull();

    const early = screen.getByTestId('yield-arm-codex-model-b');
    expect(within(early).getByText('Not enough data yet')).toBeInTheDocument();
    // What it merged and spent still shows; the rates do not.
    expect(early).toHaveTextContent('25%');
    expect(early).toHaveTextContent('$30.00');
    expect(early).not.toHaveTextContent('$5.00');
  });

  it('says when no experiment ran', async () => {
    mockYieldApi((req) =>
      req.pathname === '/api/v1/yield' ? json({ ...REPORT, experiments: [] }) : undefined
    );
    renderAt('/yield', '/yield', <YieldPage />);
    expect(await screen.findByTestId('yield-experiments-none')).toHaveTextContent(
      'No routing experiment drew an arm in this window.'
    );
  });

  it('breaks the spend down by the cut picked, and keeps it in the address', async () => {
    const calls = mockYieldApi();
    renderAt('/yield', '/yield', <YieldPage />);
    const table = await screen.findByTestId('yield-breakdown-table');
    expect(within(table).getByRole('columnheader', { name: 'Model' })).toBeInTheDocument();
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('model-a');
    expect(screen.getByTestId('yield-group-total')).toHaveTextContent('All4030');

    const dates = windowDates(28, new Date());
    expect(yieldCalls(calls)[0].toString()).toBe(
      new URLSearchParams({ since: dates.since, until: dates.until, by: 'model' }).toString()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Agent' }));
    await waitFor(() => expect(yieldCalls(calls).at(-1)?.get('by')).toBe('agent'));
    await waitFor(() =>
      expect(
        within(screen.getByTestId('yield-breakdown-table')).getByRole('columnheader', {
          name: 'Agent',
        })
      ).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Agent' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('asks for the window and family picked', async () => {
    const calls = mockYieldApi();
    renderAt('/yield?family=acme-split&days=7', '/yield', <YieldPage />);
    await screen.findByTestId('yield-kpi-per-merged');
    const first = yieldCalls(calls)[0];
    expect(first.get('family')).toBe('acme');
    expect(first.get('since')).toBe(windowDates(7, new Date()).since);
    expect(screen.getByRole('button', { name: '7 d' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '90 d' }));
    await waitFor(() =>
      expect(yieldCalls(calls).at(-1)?.get('since')).toBe(windowDates(90, new Date()).since)
    );
  });

  it('links the costliest and scrapped todos to their own pages', async () => {
    mockYieldApi();
    renderAt('/yield', '/yield', <YieldPage />);
    const costliest = await screen.findByTestId('yield-costliest');
    const link = within(costliest).getByRole('link', { name: 'Split the billing module' });
    expect(link).toHaveAttribute('href', '/work/20261001-120000-aaaaaa');
    expect(costliest).toHaveTextContent('acme · 3 attempts · claude · model-a');
    expect(within(costliest).getByTestId('yield-todo-status-20261001-120000-aaaaaa')).toHaveTextContent('merged');
    expect(within(costliest).getByTestId('yield-todo-status-20261001-120000-aaaaaa')).toHaveClass('page__pill--success');
    expect(costliest).toHaveTextContent('$24.50');
    const scrap = screen.getByTestId('yield-scrap');
    expect(within(scrap).getByRole('link', { name: 'Retry flaky uploads' })).toHaveAttribute(
      'href',
      '/work/20261002-120000-bbbbbb'
    );
    // Blocked is red: the spend can still reach main if a person unblocks it.
    const blocked = within(scrap).getByTestId('yield-todo-status-20261002-120000-bbbbbb');
    expect(blocked).toHaveTextContent('blocked');
    expect(blocked.className).toMatch(/page__pill--(danger|human|error)/);
    expect(blocked).toHaveAttribute('title', expect.stringContaining('unblock'));
  });

  it('says so while loading, and when nothing worked in the window', async () => {
    mockYieldApi((req) =>
      req.pathname === '/api/v1/yield'
        ? json({
            ...REPORT,
            totals: row(),
            groups: [],
            weekly: [],
            experiments: [],
            costliest: [],
            scrap: [],
          })
        : undefined
    );
    renderAt('/yield', '/yield', <YieldPage />);
    expect(screen.getByText('Loading what the work cost…')).toBeInTheDocument();
    expect(await screen.findByText('No work in this window.')).toBeInTheDocument();
    expect(screen.queryByTestId('yield-kpi-per-merged')).toBeNull();
  });

  it('labels a still-loading window with the window it was read for, dimmed and busy', async () => {
    const week = windowDates(7, new Date());
    mockYieldApi((req) =>
      req.pathname === '/api/v1/yield' && new URLSearchParams(req.search).get('since') === week.since
        ? new Promise<Response>(() => {})
        : undefined
    );
    renderAt('/yield', '/yield', <YieldPage />);
    expect(await screen.findByRole('heading', { name: 'Last 28 days' })).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('group', { name: 'Window' })).getByRole('button', { name: '7 d' }));

    const body = await screen.findByTestId('yield-body');
    await waitFor(() => expect(body).toHaveAttribute('aria-busy', 'true'));
    // The 28-day numbers are still up: they must not be called the last 7 days.
    expect(screen.getByRole('heading', { name: 'Last 28 days' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Last 7 days' })).toBeNull();
    expect(screen.getByTestId('yield-spend-summary')).toHaveTextContent('in the last 28 days');
    expect(within(body).getByRole('status')).toHaveTextContent(
      'Updating… showing the last 28 days until the 7-day read lands.'
    );
  });

  it('keeps an empty window dimmed and busy while the next window loads', async () => {
    const week = windowDates(7, new Date());
    mockYieldApi((req) => {
      if (req.pathname !== '/api/v1/yield') return undefined;
      if (new URLSearchParams(req.search).get('since') === week.since) return new Promise<Response>(() => {});
      return json({ ...REPORT, totals: row(), groups: [], weekly: [], experiments: [], costliest: [], scrap: [] });
    });
    renderAt('/yield', '/yield', <YieldPage />);
    expect(await screen.findByText('No work in this window.')).toBeInTheDocument();
    expect(screen.getByTestId('yield-body')).toHaveAttribute('aria-busy', 'false');

    fireEvent.click(within(screen.getByRole('group', { name: 'Window' })).getByRole('button', { name: '7 d' }));

    const body = screen.getByTestId('yield-body');
    await waitFor(() => expect(body).toHaveAttribute('aria-busy', 'true'));
    expect(within(body).getByText('No work in this window.')).toBeInTheDocument();
    expect(within(body).getByText(/^Updating…/)).toHaveClass('yield__updating');
  });

  it('degrades plainly on a server without the route', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(404, 'no such route'));
    renderAt('/yield', '/yield', <YieldPage />);
    expect(await screen.findByText('Not available on this server version.')).toBeInTheDocument();
  });

  it('keeps spend admin-only on a 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(403, 'forbidden'));
    renderAt('/yield', '/yield', <YieldPage />);
    expect(
      await screen.findByText('Only admins can see what the work cost.')
    ).toBeInTheDocument();
  });

  it('reports a refused query with its cause', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockYieldApi((req) =>
      req.pathname === '/api/v1/yield' ? errorResponse(422, 'since is after until') : undefined
    );
    renderAt('/yield', '/yield', <YieldPage />);
    expect(await screen.findByText('Could not load what the work cost.')).toBeInTheDocument();
    expect(screen.getByText(/since is after until/)).toBeInTheDocument();
  });
});
