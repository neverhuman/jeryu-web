import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScorecardPage } from '../scorecard';
import { SCORECARD_REPORT } from './scorecardTestData';
import { errorResponse, json, recordHeaders, renderAt, type Override, type Recorded } from './shiftPageHelpers';

afterEach(() => vi.restoreAllMocks());

function mockScorecardApi(override?: Override): Recorded[] {
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
    if (url.pathname === '/api/v1/scorecard') {
      return json({
        ...SCORECARD_REPORT,
        window: url.searchParams.get('window') ?? '30d',
        family: url.searchParams.get('family'),
        repo: url.searchParams.get('repo'),
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

function scorecardCalls(calls: Recorded[]): URLSearchParams[] {
  return calls
    .filter((call) => call.pathname === '/api/v1/scorecard')
    .map((call) => new URLSearchParams(call.search));
}

describe('ScorecardPage', () => {
  it('renders headline and unknown tiles without inventing zeros', async () => {
    mockScorecardApi();
    renderAt('/scorecard', '/scorecard', <ScorecardPage />);

    const headline = await screen.findByTestId('scorecard-tile-lead_time_p50');
    expect(headline).toHaveTextContent('Lead time p50');
    expect(headline).toHaveTextContent('1 d');
    expect(headline).toHaveTextContent('p85 1.6 d');
    expect(screen.getByTestId('scorecard-tile-time_to_restore')).toHaveTextContent(
      'Not measured yet — needs incident ledger'
    );
    expect(screen.getByTestId('scorecard-station-breakdown')).toHaveTextContent('review');
    expect(screen.getByTestId('scorecard-wip-strip')).toHaveAttribute('href', '/work');
  });

  it('keeps window, family, repository and outcomes tab in the URL and request', async () => {
    const calls = mockScorecardApi();
    renderAt('/scorecard?family=acme&window=7d&repo=acme/widgets', '/scorecard', <ScorecardPage />);
    await screen.findByTestId('scorecard-body');
    expect(scorecardCalls(calls)[0].get('window')).toBe('7d');
    expect(scorecardCalls(calls)[0].get('family')).toBe('acme');
    expect(scorecardCalls(calls)[0].get('repo')).toBe('acme/widgets');

    fireEvent.click(screen.getByRole('button', { name: '90 d' }));
    await waitFor(() => expect(scorecardCalls(calls).at(-1)?.get('window')).toBe('90d'));

    const beforeTyping = scorecardCalls(calls).length;
    fireEvent.change(screen.getByLabelText(/Repository/), { target: { value: 'globex/api' } });
    expect(scorecardCalls(calls)).toHaveLength(beforeTyping);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(scorecardCalls(calls).at(-1)?.get('repo')).toBe('globex/api'));

    fireEvent.click(screen.getByRole('tab', { name: 'Outcomes' }));
    expect(await screen.findByTestId('scorecard-outcomes')).toHaveTextContent(
      'Hypotheses checked and met'
    );
  });

  it('pairs volume tiles beside their guardrails', async () => {
    mockScorecardApi();
    renderAt('/scorecard', '/scorecard', <ScorecardPage />);
    const pairs = await screen.findByTestId('scorecard-volume-pairs');
    const tiles = within(pairs).getAllByRole('article');
    expect(tiles.map((tile) => within(tile).getByRole('heading').textContent)).toEqual([
      'Items/day',
      'False-done guardrail',
      'Releases/day',
      'Failure guardrail',
      'Surviving net lines/day',
      'Rework guardrail',
    ]);
    expect(screen.getByTestId('scorecard-volume-context')).toHaveTextContent('PRs/day');
    expect(screen.getByTestId('scorecard-volume-context')).toHaveTextContent('Raw lines/day');
  });
});
